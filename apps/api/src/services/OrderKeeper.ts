import {
  createPublicClient,
  createWalletClient,
  http,
  parseGwei,
  parseUnits,
  decodeEventLog,
  parseAbiItem,
  zeroAddress,
  type Abi,
  type Chain,
  type Hash,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { and, eq, gt, lt } from 'drizzle-orm'
import pino from 'pino'
import { db } from '../db/client.js'
import { conditionalOrders } from '../db/schema.js'
import type { RpcClient } from '../lib/rpc.js'

export const AUTOMATION_REGISTRY_ABI = [
  'function createOrder(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, uint256 maxGasPrice, uint256 expiresAt, address aggregatorTarget, bytes calldata aggregatorCalldata) returns (uint256)',
  'function executeOrder(uint256 orderId)',
  'function orders(uint256 orderId) view returns (address user, address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, uint256 maxGasPrice, uint256 expiresAt, bool active, address aggregatorTarget, bytes aggregatorCalldata)',
  'event OrderCreated(uint256 indexed orderId, address indexed user, address tokenIn, address tokenOut, uint256 amountIn)',
  'event OrderExecuted(uint256 indexed orderId, uint256 amountOut)',
] as const

export type OrderConditionType = 'maxGas' | 'time' | 'minPrice' | (string & {})

export type OrderCondition = {
  type: OrderConditionType
  value: number | string
}

export type KeeperConfig = {
  registryAddress: `0x${string}`
  privateKey: `0x${string}`
  chainId: number
  rpcUrl?: string
  executionProxyAddress?: `0x${string}`
  pollIntervalMs?: number
  defaultAggregatorTarget?: `0x${string}`
  defaultAggregatorCalldata?: `0x${string}`
}

export type KeeperStatus = {
  running: boolean
  chainId: number
  registryAddress: string
  lastRunAt: number | null
  lastError: string | null
  processedCount: number
  createdOnChainCount: number
  executedCount: number
}

type ConditionalOrderRow = typeof conditionalOrders.$inferSelect

const DEFAULT_POLL_INTERVAL_MS = 30_000
const DEFAULT_AMOUNT_DECIMALS = 18

export class ConditionalOrderKeeper {
  private readonly db: typeof db
  private readonly rpc: RpcClient
  private readonly config: Required<Pick<KeeperConfig, 'registryAddress' | 'privateKey' | 'chainId'>> &
    Omit<KeeperConfig, 'registryAddress' | 'privateKey' | 'chainId'>
  private readonly logger = pino({ name: 'OrderKeeper' })
  private readonly wallet
  private readonly publicClient

  private timer: ReturnType<typeof setInterval> | null = null
  private running = false
  private lastRunAt: number | null = null
  private lastError: string | null = null
  private processedCount = 0
  private createdOnChainCount = 0
  private executedCount = 0

  constructor(dbInstance: typeof db, rpc: RpcClient, config: KeeperConfig) {
    this.db = dbInstance
    this.rpc = rpc
    this.config = {
      ...config,
      pollIntervalMs: config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
      defaultAggregatorTarget: config.defaultAggregatorTarget ?? zeroAddress,
      defaultAggregatorCalldata: config.defaultAggregatorCalldata ?? '0x',
    }

    const account = privateKeyToAccount(config.privateKey)
    const chain = (rpc as unknown as { chain?: Chain }).chain
    const rpcUrl =
      config.rpcUrl ?? chain?.rpcUrls?.default?.http?.[0]

    if (!chain) {
      throw new Error('RpcClient is missing a chain definition; unable to build keeper wallet client')
    }
    if (!rpcUrl) {
      throw new Error('No RPC URL available for keeper (set config.rpcUrl or a default RPC URL on the chain)')
    }

    this.wallet = createWalletClient({ account, chain, transport: http(rpcUrl) })
    this.publicClient = createPublicClient({ chain, transport: http(rpcUrl) })
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  start() {
    if (this.running) return
    this.running = true
    this.logger.info(
      { chainId: this.config.chainId, registry: this.config.registryAddress },
      'ConditionalOrderKeeper started'
    )
    // Run immediately, then on interval.
    void this.processActiveOrders()
    this.timer = setInterval(() => {
      void this.processActiveOrders().catch((err) => this.handleError('poll', err))
    }, this.config.pollIntervalMs)
  }

  stop() {
    this.running = false
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.logger.info('ConditionalOrderKeeper stopped')
  }

  getStatus(): KeeperStatus {
    return {
      running: this.running,
      chainId: this.config.chainId,
      registryAddress: this.config.registryAddress,
      lastRunAt: this.lastRunAt,
      lastError: this.lastError,
      processedCount: this.processedCount,
      createdOnChainCount: this.createdOnChainCount,
      executedCount: this.executedCount,
    }
  }

  // ─── Main polling logic ─────────────────────────────────────────────────────

  async processActiveOrders() {
    const now = new Date()
    this.lastRunAt = Date.now()

    // Mark orders that have passed their expiry as expired (best-effort cleanup).
    try {
      await this.db
        .update(conditionalOrders)
        .set({ status: 'expired' })
        .where(and(eq(conditionalOrders.status, 'active'), lt(conditionalOrders.expiresAt, now)))
    } catch (err) {
      this.handleError('expire', err)
    }

    const active = await this.db
      .select()
      .from(conditionalOrders)
      .where(and(eq(conditionalOrders.status, 'active'), gt(conditionalOrders.expiresAt, now)))

    this.logger.info({ count: active.length }, 'Processing active conditional orders')

    for (const order of active) {
      try {
        await this.processOrder(order)
      } catch (err) {
        this.logger.error({ orderId: order.id }, 'Failed to process order')
        this.handleError(`order:${order.id}`, err)
      }
    }
  }

  private async processOrder(order: ConditionalOrderRow) {
    if (order.onchainOrderId == null) {
      this.logger.warn({ orderId: order.id }, 'Skipping order: no on-chain orderId. The user must sign a createOrder transaction first.')
      return
    }

    const condition = this.parseCondition(order.condition)
    const met = await this.evaluateCondition(order, condition)
    if (!met) {
      this.logger.debug({ orderId: order.id, condition: condition?.type }, 'Condition not yet met')
      return
    }

    this.logger.info({ orderId: order.id, onchainId: order.onchainOrderId }, 'Condition met, executing on-chain')
    const txHash = await this.executeOnChainOrder(order)
    if (txHash) {
      await this.updateOrderStatus(order.id, 'executed', txHash)
      this.executedCount++
    }
  }

  // ─── Condition evaluation ─────────────────────────────────────────────────

  async evaluateCondition(
    _order: ConditionalOrderRow,
    condition: OrderCondition | null
  ): Promise<boolean> {
    if (!condition || !condition.type) {
      this.logger.warn('Order has no evaluable condition; skipping')
      return false
    }

    switch (condition.type) {
      case 'maxGas': {
        // value is the maximum gas price in gwei the user is willing to pay.
        const maxGasWei = parseGwei(String(condition.value))
        const current = await this.rpc.getGasPrice()
        this.logger.debug(
          { current: current.toString(), max: maxGasWei.toString() },
          'Evaluating maxGas condition'
        )
        return current <= maxGasWei
      }
      case 'time': {
        // value is a unix timestamp (seconds) after which the order may execute.
        const scheduled = Number(condition.value)
        return Math.floor(Date.now() / 1000) >= scheduled
      }
      case 'minPrice': {
        // Future use: would compare a token price feed against condition.value.
        this.logger.debug('minPrice condition evaluation is not yet implemented')
        return false
      }
      default:
        this.logger.warn({ type: condition.type }, 'Unknown condition type')
        return false
    }
  }

  // ─── On-chain interactions ──────────────────────────────────────────────────

  async createOnChainOrder(order: ConditionalOrderRow): Promise<bigint | null> {
    const condition = this.parseCondition(order.condition)
    const maxGasPrice =
      condition?.type === 'maxGas' ? parseGwei(String(condition.value)) : 0n
    const amountIn =
      order.amountIn != null ? parseUnits(String(order.amountIn), DEFAULT_AMOUNT_DECIMALS) : 0n
    const expiresAt = Math.floor((order.expiresAt?.getTime() ?? Date.now()) / 1000)
    const aggregatorTarget = this.config.defaultAggregatorTarget as `0x${string}`
    const aggregatorCalldata = (this.config.defaultAggregatorCalldata ?? '0x') as `0x${string}`

    this.logger.info({ orderId: order.id }, 'Creating on-chain order via AutomationRegistry.createOrder')

    let hash: Hash
    try {
      hash = await this.wallet.writeContract({
        address: this.config.registryAddress,
        abi: AUTOMATION_REGISTRY_ABI as unknown as Abi,
        functionName: 'createOrder',
        args: [
          order.tokenIn as `0x${string}`,
          order.tokenOut as `0x${string}`,
          amountIn,
          0n, // minAmountOut (not stored on the DB order; 0 = no floor)
          maxGasPrice,
          BigInt(expiresAt),
          aggregatorTarget,
          aggregatorCalldata,
        ],
      } as any)
    } catch (err) {
      this.handleError(`createOrder:${order.id}`, err)
      return null
    }

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash })
    if (receipt.status === 'reverted') {
      this.logger.error({ orderId: order.id, hash }, 'createOrder transaction reverted')
      return null
    }

    const orderId = decodeOrderCreated(receipt.logs)
    if (orderId == null) {
      this.logger.error({ orderId: order.id, hash }, 'createOrder succeeded but OrderCreated event not found')
      return null
    }

    this.createdOnChainCount++
    return orderId
  }

  async executeOnChainOrder(order: ConditionalOrderRow): Promise<Hash | null> {
    if (order.onchainOrderId == null) {
      this.logger.error({ orderId: order.id }, 'Cannot execute: order has no on-chain id')
      return null
    }

    const id = BigInt(order.onchainOrderId)
    this.logger.info({ orderId: order.id, onchainId: id }, 'Executing on-chain order via AutomationRegistry.executeOrder')

    let hash: Hash
    try {
      hash = await this.wallet.writeContract({
        address: this.config.registryAddress,
        abi: AUTOMATION_REGISTRY_ABI as unknown as Abi,
        functionName: 'executeOrder',
        args: [id],
      } as any)
    } catch (err) {
      this.handleError(`executeOrder:${order.id}`, err)
      return null
    }

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash })
    if (receipt.status === 'reverted') {
      this.logger.error({ orderId: order.id, hash }, 'executeOrder transaction reverted')
      return null
    }

    this.processedCount++
    return hash
  }

  // ─── DB updates ─────────────────────────────────────────────────────────────

  async updateOrderStatus(
    orderId: string,
    status: string,
    txHash?: string,
    onchainOrderId?: number
  ) {
    const set: Partial<typeof conditionalOrders.$inferInsert> = { status }
    if (txHash) {
      set.txHash = txHash
      set.executedAt = new Date()
    }
    if (onchainOrderId != null) {
      set.onchainOrderId = onchainOrderId
    }
    await this.db
      .update(conditionalOrders)
      .set(set)
      .where(eq(conditionalOrders.id, orderId))
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private parseCondition(condition: unknown): OrderCondition | null {
    if (!condition || typeof condition !== 'object') return null
    const c = condition as Record<string, unknown>
    if (typeof c.type !== 'string' || c.value == null) return null
    return { type: c.type, value: c.value as number | string }
  }

  private handleError(context: string, err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    this.lastError = `${context}: ${message}`
    this.logger.error({ context, err }, 'Keeper error')
  }
}

function decodeOrderCreated(logs: unknown): bigint | null {
  const event = parseAbiItem(
    'event OrderCreated(uint256 indexed orderId, address indexed user, address tokenIn, address tokenOut, uint256 amountIn)'
  )
  const abi = [event] as const
  for (const raw of logs as Array<{ data: string; topics: string[] }>) {
    try {
      const decoded = decodeEventLog({ abi: abi as unknown as Abi, data: raw.data as any, topics: raw.topics as any })
      if (decoded.eventName === 'OrderCreated') {
        return (decoded.args as unknown as { orderId: bigint }).orderId
      }
    } catch {
      // not this event; try next log
    }
  }
  return null
}
