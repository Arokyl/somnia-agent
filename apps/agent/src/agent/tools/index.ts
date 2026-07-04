import type OpenAI from 'openai'

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

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
