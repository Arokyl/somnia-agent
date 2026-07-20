import type OpenAI from 'openai'
import { encodeFunctionData, parseUnits, zeroAddress } from 'viem'

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
const AUTOMATION_REGISTRY_ADDRESS = (process.env.AUTOMATION_REGISTRY_ADDRESS || '') as `0x${string}`

const AUTOMATION_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'createOrder',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'minAmountOut', type: 'uint256' },
      { name: 'maxGasPrice', type: 'uint256' },
      { name: 'expiresAt', type: 'uint256' },
      { name: 'aggregatorTarget', type: 'address' },
      { name: 'aggregatorCalldata', type: 'bytes' },
    ],
    outputs: [{ name: 'orderId', type: 'uint256' }],
  },
] as const

interface AuthContext {
  address: string
  message: string
  signature: string
}

export function buildAuthHeaders(auth?: AuthContext): Record<string, string> {
  if (!auth?.address || !auth.message || !auth.signature) {
    return {}
  }

  return {
    'x-user-address': auth.address,
    'x-message': auth.message,
    'x-signature': auth.signature,
  }
}

export const tools: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_portfolio',
      description: 'Get the user current token balances and portfolio value on the connected chain.',
      parameters: {
        type: 'object',
        properties: {
          address: { type: 'string', description: 'Wallet address (0x...)' },
          chainId: { type: 'number', description: 'Chain ID' },
        },
        required: ['address', 'chainId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_market_price',
      description: 'Get the current USD market price for a token symbol such as ETH, BTC, or MON.',
      parameters: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'Token symbol, e.g. ETH, BTC, MON' },
        },
        required: ['symbol'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_quote',
      description: 'Get the best swap quote for a token pair. Returns amountOut, price impact, gas cost, and which aggregator is cheapest.',
      parameters: {
        type: 'object',
        properties: {
          tokenIn: { type: 'string', description: 'Input token symbol or address' },
          tokenOut: { type: 'string', description: 'Output token symbol or address' },
          amountIn: { type: 'string', description: 'Amount to swap as a decimal string, e.g. "1.5"' },
          tokenInDecimals: { type: 'number', description: 'Decimals of input token, default 18' },
          tokenOutDecimals: { type: 'number', description: 'Decimals of output token, default 6 for USDC/USDT' },
          chainId: { type: 'number', description: 'Chain ID' },
        },
        required: ['tokenIn', 'tokenOut', 'amountIn', 'chainId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_all_quotes',
      description: 'Compare quotes from all available aggregators for a swap. Use when the user asks to compare routes or find the cheapest path.',
      parameters: {
        type: 'object',
        properties: {
          tokenIn: { type: 'string' },
          tokenOut: { type: 'string' },
          amountIn: { type: 'string' },
          tokenInDecimals: { type: 'number' },
          tokenOutDecimals: { type: 'number' },
          chainId: { type: 'number' },
        },
        required: ['tokenIn', 'tokenOut', 'amountIn', 'chainId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_gas_price',
      description: 'Get current gas price, trend, and recommendation. Always call this before recommending trade execution.',
      parameters: {
        type: 'object',
        properties: {
          chainId: { type: 'number', description: 'Chain ID' },
        },
        required: ['chainId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'schedule_order',
      description: 'Schedule a conditional order to execute when a condition is met, such as gas below a threshold.',
      parameters: {
        type: 'object',
        properties: {
          address: { type: 'string', description: 'User wallet address' },
          tokenIn: { type: 'string', description: 'Token to sell' },
          tokenOut: { type: 'string', description: 'Token to buy' },
          amountIn: { type: 'string', description: 'Amount to sell' },
          conditionType: { type: 'string', enum: ['maxGas', 'minPrice', 'time'], description: 'Condition type' },
          conditionValue: { type: 'number', description: 'Condition value, e.g. 20 for maxGas of 20 gwei' },
          originalCommand: { type: 'string', description: 'The original user command' },
          expiresInHours: { type: 'number', description: 'How long to keep the order active, default 24h' },
        },
        required: ['address', 'tokenIn', 'tokenOut', 'amountIn', 'conditionType', 'conditionValue', 'originalCommand'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'return_plan',
      description:
        'Return the final reply and execution plan to the user. Call this exactly once when you have a complete plan ready and no further tool calls are needed. Do NOT respond with plan JSON in plain text — always use this tool.',
      parameters: {
        type: 'object',
        properties: {
          reply: {
            type: 'string',
            description: 'Plain-language reply to the user in a calm teacher voice.',
          },
          plan: {
            type: 'object',
            description:
              'Structured ExecutionPlan object with intent, quote, gasAssessment, shouldExecuteNow, estimatedOutput, and warnings.',
          },
          warnings: {
            type: 'array',
            items: { type: 'string' },
            description: 'Human-readable risk warnings to surface to the user.',
          },
        },
        required: ['reply', 'plan'],
      },
    },
  },
]

/** Marker returned by `executeTool` when the model invokes the structured `return_plan` tool. */
export interface ReturnPlanResult {
  __returnPlan: true
  reply: string
  plan: unknown
  warnings: string[]
}

export function isReturnPlanResult(value: unknown): value is ReturnPlanResult {
  return Boolean(value) && typeof value === 'object' && (value as ReturnPlanResult).__returnPlan === true
}

export async function executeTool(name: string, args: Record<string, any>): Promise<unknown> {
  switch (name) {
    case 'get_portfolio':
      return fetchApi(`/portfolio/${encodeURIComponent(args.address)}?chainId=${encodeURIComponent(args.chainId)}`, 'GET', undefined, args.auth)

    case 'get_market_price':
      return fetchApi(`/market/price/${encodeURIComponent(String(args.symbol))}`, 'GET', undefined, args.auth)

    case 'get_quote':
      return fetchApi(`/quotes?${quoteParams(args)}`, 'GET', undefined, args.auth).then((data: any) => data.bestQuote)

    case 'get_all_quotes':
      return fetchApi(`/quotes?${quoteParams(args)}`, 'GET', undefined, args.auth).then((data: any) => data.quotes)

    case 'get_gas_price':
      return fetchApi(`/gas/${encodeURIComponent(args.chainId)}`, 'GET', undefined, args.auth)

    case 'schedule_order':
      const registryAddress = AUTOMATION_REGISTRY_ADDRESS
      const tokenIn = String(args.tokenIn).trim()
      const tokenOut = String(args.tokenOut).trim()
      const amountIn = String(args.amountIn)
      const isNativeIn = ['eth', 'mon', 'native', '0x', ''].includes(tokenIn.toLowerCase())
      const normalizedTokenIn = isNativeIn ? zeroAddress : (tokenIn as `0x${string}`)
      const normalizedTokenOut = ['eth', 'mon', 'native', '0x', ''].includes(tokenOut.toLowerCase()) ? zeroAddress : (tokenOut as `0x${string}`)
      const conditionType = String(args.conditionType)
      const conditionValue = Number(args.conditionValue)
      const expiresInHours = Number(args.expiresInHours ?? 24)
      const expiresAt = Math.floor(Date.now() / 1000) + expiresInHours * 3600
      const maxGasPrice = conditionType === 'maxGas' ? BigInt(Math.floor(conditionValue * 1e9)) : 0n

      let unsignedTx: { to: string; data: string; value: string; gasLimit: string } | undefined
      let orderCreationError: string | undefined

      if (registryAddress && registryAddress.length === 42) {
        try {
          const amountInWei = parseUnits(amountIn, 18)
          const data = encodeFunctionData({
            abi: AUTOMATION_REGISTRY_ABI,
            functionName: 'createOrder',
            args: [
              normalizedTokenIn,
              normalizedTokenOut,
              amountInWei,
              0n,
              maxGasPrice,
              BigInt(expiresAt),
              zeroAddress,
              '0x',
            ],
          })
          unsignedTx = {
            to: registryAddress,
            data,
            value: '0',
            gasLimit: '300000',
          }
        } catch (err: any) {
          orderCreationError = err.message
        }
      } else {
        orderCreationError = 'AUTOMATION_REGISTRY_ADDRESS is not configured'
      }

      const orderPayload = {
        address: args.address,
        chainId: args.chainId,
        tokenIn,
        tokenOut,
        amountIn,
        condition: { type: conditionType, value: conditionValue },
        originalCommand: args.originalCommand,
        expiresAt: new Date(Date.now() + expiresInHours * 3600 * 1000).toISOString(),
      }

      const apiResult = await fetchApi('/orders', 'POST', orderPayload, args.auth)

      return {
        order: apiResult,
        orderCreation: unsignedTx
          ? { unsignedTx, order: orderPayload }
          : undefined,
        orderCreationError,
      }

    case 'return_plan':
      // Special tool: it does not call an external service, it simply returns the
      // structured reply + plan so the executor can extract it reliably.
      return {
        __returnPlan: true,
        reply: typeof args.reply === 'string' ? args.reply : '',
        plan: args.plan,
        warnings: Array.isArray(args.warnings) ? args.warnings.map(String) : [],
      } satisfies ReturnPlanResult

    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

function quoteParams(args: Record<string, any>) {
  return new URLSearchParams({
    tokenIn: String(args.tokenIn),
    tokenOut: String(args.tokenOut),
    amountIn: String(args.amountIn),
    chainId: String(args.chainId),
    tokenInDecimals: String(args.tokenInDecimals ?? 18),
    tokenOutDecimals: String(args.tokenOutDecimals ?? 6),
  }).toString()
}

async function fetchApi(path: string, method = 'GET', body?: object, auth?: AuthContext): Promise<unknown> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...buildAuthHeaders(auth),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`API error ${res.status} on ${path}${detail ? `: ${detail}` : ''}`)
  }

  return res.json()
}
