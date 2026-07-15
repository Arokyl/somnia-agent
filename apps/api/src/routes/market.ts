import type { FastifyPluginAsync } from 'fastify'

const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  WETH: 'ethereum',
}

type MarketPrice = {
  symbol: string
  priceUsd: number
  source: string
  updatedAt: string
}

function envPrice(symbol: string): MarketPrice | null {
  const value = Number(process.env[`${symbol}_USD_PRICE`])
  if (!Number.isFinite(value) || value <= 0) return null

  return {
    symbol,
    priceUsd: value,
    source: `${symbol}_USD_PRICE`,
    updatedAt: new Date().toISOString(),
  }
}

async function fetchDefiLlamaPrice(symbol: string): Promise<MarketPrice | null> {
  const id = COINGECKO_IDS[symbol]
  if (!id) return null

  const coinKey = `coingecko:${id}`
  const res = await fetch(`https://coins.llama.fi/prices/current/${coinKey}`)
  if (!res.ok) throw new Error(`DefiLlama price error: ${res.status}`)

  const data = await res.json() as {
    coins?: Record<string, { price?: number; timestamp?: number }>
  }
  const coin = data.coins?.[coinKey]
  if (!coin?.price || !Number.isFinite(coin.price)) return null

  return {
    symbol,
    priceUsd: coin.price,
    source: 'DefiLlama/CoinGecko',
    updatedAt: coin.timestamp ? new Date(coin.timestamp * 1000).toISOString() : new Date().toISOString(),
  }
}

async function getMarketPrice(symbolParam: string): Promise<MarketPrice> {
  const symbol = symbolParam.trim().toUpperCase()
  if (!symbol) throw new Error('Missing symbol')

  if (symbol === 'STT' || symbol === 'SOMI' || symbol === 'SOM') {
    const stt = envPrice('STT')
    if (stt) return { ...stt, symbol }
    throw new Error('STT_USD_PRICE is not configured')
  }

  try {
    const live = await fetchDefiLlamaPrice(symbol)
    if (live) return live
  } catch {
    // Fall back to configured env price below.
  }

  const configured = envPrice(symbol)
  if (configured) return configured

  throw new Error(`No market price source is configured for ${symbol}`)
}

export const marketRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { symbol: string } }>('/price/:symbol', async (req, reply) => {
    try {
      return await getMarketPrice(req.params.symbol)
    } catch (error) {
      return reply.code(404).send({
        error: error instanceof Error ? error.message : 'Price unavailable',
      })
    }
  })
}
