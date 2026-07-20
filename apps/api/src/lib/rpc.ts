import { createPublicClient, http, defineChain } from 'viem'
import { mainnet, base, arbitrum } from 'viem/chains'

const MONAD_RPC = process.env.MONAD_RPC || process.env.NEXT_PUBLIC_MONAD_RPC || 'https://testnet-rpc.monad.xyz'
const MONAD_RPC_FALLBACK = process.env.MONAD_RPC_FALLBACK || process.env.NEXT_PUBLIC_MONAD_RPC_FALLBACK
const ETH_RPC = process.env.NEXT_PUBLIC_ETH_RPC || 'https://rpc.ankr.com/eth'
const ETH_RPC_FALLBACK = process.env.NEXT_PUBLIC_ETH_RPC_FALLBACK
const BASE_RPC = process.env.NEXT_PUBLIC_BASE_RPC || 'https://rpc.ankr.com/base'
const BASE_RPC_FALLBACK = process.env.NEXT_PUBLIC_BASE_RPC_FALLBACK
const ARB_RPC = process.env.NEXT_PUBLIC_ARB_RPC || 'https://rpc.ankr.com/arbitrum'
const ARB_RPC_FALLBACK = process.env.NEXT_PUBLIC_ARB_RPC_FALLBACK

export type RpcClient = {
  getGasPrice: ReturnType<typeof createPublicClient>['getGasPrice']
  getBlock: ReturnType<typeof createPublicClient>['getBlock']
  getFeeHistory: ReturnType<typeof createPublicClient>['getFeeHistory']
  getBalance: ReturnType<typeof createPublicClient>['getBalance']
  readContract: ReturnType<typeof createPublicClient>['readContract']
}

function createFailoverClient(chain: ReturnType<typeof defineChain>, urls: Array<string | undefined>): RpcClient {
  const validUrls = urls.filter(Boolean) as string[]
  if (validUrls.length === 0) {
    throw new Error(`No RPC URLs configured for chain ${chain.id}`)
  }

  const primaryClient = createPublicClient({ chain, transport: http(validUrls[0]) })
  const fallbackClients = validUrls.slice(1).map((url) => createPublicClient({ chain, transport: http(url) }))

  if (fallbackClients.length === 0) return primaryClient as unknown as RpcClient

  return new Proxy(primaryClient, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      if (typeof value !== 'function') return value

      return async (...args: unknown[]) => {
        try {
          return await (value as (...args: unknown[]) => Promise<unknown>)(...args)
        } catch (error) {
          for (const fallback of fallbackClients) {
            const fallbackValue = Reflect.get(fallback, prop)
            if (typeof fallbackValue !== 'function') continue
            try {
              return await (fallbackValue as (...args: unknown[]) => Promise<unknown>)(...args)
            } catch {
              // try next fallback
            }
          }
          throw error
        }
      }
    },
  }) as unknown as RpcClient
}

export const monad = defineChain({
  id: 10143,
  name: 'Monad',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: { http: [MONAD_RPC] },
  },
})

export const clients: Record<number, RpcClient> = {
  [monad.id]: createFailoverClient(monad, [
    MONAD_RPC,
    MONAD_RPC_FALLBACK,
  ]),
  [mainnet.id]: createFailoverClient(mainnet, [
    ETH_RPC,
    ETH_RPC_FALLBACK,
  ]),
  [base.id]: createFailoverClient(base, [
    BASE_RPC,
    BASE_RPC_FALLBACK,
  ]),
  [arbitrum.id]: createFailoverClient(arbitrum, [
    ARB_RPC,
    ARB_RPC_FALLBACK,
  ]),
}

export function getClient(chainId: number) {
  const client = clients[chainId]
  if (!client) throw new Error(`Unsupported chainId: ${chainId}`)
  return client
}
