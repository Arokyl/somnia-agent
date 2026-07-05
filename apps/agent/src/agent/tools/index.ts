import type OpenAI from 'openai'

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

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
]

export async function executeTool(name: string, args: Record<string, any>): Promise<unknown> {
  switch (name) {
    case 'get_portfolio':
      return fetchApi(`/portfolio/${encodeURIComponent(args.address)}?chainId=${encodeURIComponent(args.chainId)}`, 'GET', undefined, args.auth)

    case 'get_quote':
      return fetchApi(`/quotes?${quoteParams(args)}`, 'GET', undefined, args.auth).then((data: any) => data.bestQuote)

    case 'get_all_quotes':
      return fetchApi(`/quotes?${quoteParams(args)}`, 'GET', undefined, args.auth).then((data: any) => data.quotes)

    case 'get_gas_price':
      return fetchApi(`/gas/${encodeURIComponent(args.chainId)}`, 'GET', undefined, args.auth)

    case 'schedule_order':
      return fetchApi('/orders', 'POST', {
        address: args.address,
        chainId: args.chainId,
        tokenIn: args.tokenIn,
        tokenOut: args.tokenOut,
        amountIn: args.amountIn,
        condition: { type: args.conditionType, value: args.conditionValue },
        originalCommand: args.originalCommand,
        expiresAt: new Date(Date.now() + (args.expiresInHours ?? 24) * 3600 * 1000).toISOString(),
      }, args.auth)

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
