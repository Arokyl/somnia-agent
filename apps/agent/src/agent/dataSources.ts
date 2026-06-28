type DataSourceName =
  | 'marketNews'
  | 'airdrop'
  | 'walletHistory'
  | 'tradeIdeas'
  | 'transactionMonitor'
  | 'problemResearch'
  | 'agentAudit'

interface DataSourceConfig {
  url?: string
  apiKey?: string
  ttlSeconds: number
  label: string
}

interface FetchContext {
  address?: string
  chainId?: number
  query?: string
}

export interface DataSourceResult {
  configured: boolean
  source?: string
  items: string[]
}

const cache = new Map<string, { expiresAt: number; items: string[] }>()

const DATA_SOURCES: Record<DataSourceName, DataSourceConfig> = {
  marketNews: {
    url: process.env.MARKET_NEWS_API_URL || process.env.CRYPTO_NEWS_API_URL,
    apiKey: process.env.MARKET_NEWS_API_KEY || process.env.CRYPTO_NEWS_API_KEY,
    ttlSeconds: numberEnv('MARKET_NEWS_TTL_SECONDS', 180),
    label: 'market news',
  },
  airdrop: {
    url: process.env.AIRDROP_FEED_URL,
    apiKey: process.env.AIRDROP_FEED_API_KEY,
    ttlSeconds: numberEnv('AIRDROP_FEED_TTL_SECONDS', 600),
    label: 'airdrop feed',
  },
  walletHistory: {
    url: process.env.WALLET_HISTORY_API_URL,
    apiKey: process.env.WALLET_HISTORY_API_KEY,
    ttlSeconds: numberEnv('WALLET_HISTORY_TTL_SECONDS', 60),
    label: 'wallet history',
  },
  tradeIdeas: {
    url: process.env.TRADE_IDEAS_API_URL,
    apiKey: process.env.TRADE_IDEAS_API_KEY,
    ttlSeconds: numberEnv('TRADE_IDEAS_TTL_SECONDS', 120),
    label: 'trade ideas',
  },
  transactionMonitor: {
    url: process.env.TRANSACTION_MONITOR_API_URL || process.env.EXPLORER_API_URL,
    apiKey: process.env.TRANSACTION_MONITOR_API_KEY || process.env.EXPLORER_API_KEY,
    ttlSeconds: numberEnv('TRANSACTION_MONITOR_TTL_SECONDS', 45),
    label: 'transaction monitor',
  },
  problemResearch: {
    url: process.env.USER_PROBLEM_FEED_URL,
    apiKey: process.env.USER_PROBLEM_FEED_API_KEY,
    ttlSeconds: numberEnv('USER_PROBLEM_FEED_TTL_SECONDS', 900),
    label: 'problem research',
  },
  agentAudit: {
    url: process.env.AGENT_AUDIT_FEED_URL,
    apiKey: process.env.AGENT_AUDIT_FEED_API_KEY,
    ttlSeconds: numberEnv('AGENT_AUDIT_FEED_TTL_SECONDS', 300),
    label: 'agent audit',
  },
}

export async function fetchDataSource(name: DataSourceName, context: FetchContext = {}): Promise<DataSourceResult> {
  const config = DATA_SOURCES[name]
  if (!config.url) return { configured: false, items: [] }

  const url = expandUrl(config.url, context, config.apiKey)
  const cacheKey = `${name}:${url}`
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return { configured: true, source: url, items: cached.items }
  }

  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}`, 'x-api-key': config.apiKey } : {}),
      },
    })

    if (!res.ok) return { configured: true, source: url, items: [] }

    const data = await res.json()
    const items = normalizeItems(data, config.label)
    cache.set(cacheKey, { expiresAt: Date.now() + config.ttlSeconds * 1000, items })
    return { configured: true, source: url, items }
  } catch {
    return { configured: true, source: url, items: [] }
  }
}

function expandUrl(url: string, context: FetchContext, apiKey?: string) {
  const query = context.query ?? ''
  return url
    .replaceAll('{address}', encodeURIComponent(context.address ?? ''))
    .replaceAll('{chainId}', encodeURIComponent(String(context.chainId ?? '')))
    .replaceAll('{chainHex}', encodeURIComponent(context.chainId ? `0x${context.chainId.toString(16)}` : ''))
    .replaceAll('{query}', encodeURIComponent(query))
    .replaceAll('{apiKey}', encodeURIComponent(apiKey ?? ''))
}

function normalizeItems(data: any, label: string): string[] {
  const items = Array.isArray(data)
    ? data
    : Array.isArray(data.items)
    ? data.items
    : Array.isArray(data.results)
    ? data.results
    : Array.isArray(data.data)
    ? data.data
    : Array.isArray(data.protocols)
    ? data.protocols
    : []

  return items
    .slice(0, 5)
    .map((item: any) => {
      if (typeof item === 'string') return item
      const metric = item.total24h || item.total7d || item.change_1d || item.tvl
      const suffix = metric ? ` (${metric})` : ''
      return item.title || item.name && `${item.name}${suffix}` || item.headline || item.summary || item.description || item.txHash || `${label} item`
    })
    .filter((item: string) => item.trim().length > 0)
}

function numberEnv(name: string, fallback: number) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}
