import { cacheGet, cacheSetex, CACHE_TTL } from '../lib/redis.js'

type MarketPrice = {
  symbol: string
  priceUsd: number
  source: string
  updatedAt: string
}

const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  WETH: 'ethereum',
  BNB: 'binancecoin',
  SOL: 'solana',
  MATIC: 'matic-network',
  POL: 'matic-network',
  ARB: 'arbitrum',
  OP: 'optimism',
  AVAX: 'avalanche-2',
  LINK: 'chainlink',
  UNI: 'uniswap',
  AAVE: 'aave',
  MKR: 'maker',
  COMP: 'compound-governance-token',
  SUSHI: 'sushi',
  CRV: 'curve-dao-token',
  LDO: 'lido-dao',
  PEPE: 'pepe',
  SHIB: 'shiba-inu',
  DOGE: 'dogecoin',
  WBTC: 'wbtc',
  USDC: 'usd-coin',
  USDT: 'tether',
  DAI: 'dai',
  MON: 'monad',
}

const COINGECKO_CHAIN_IDS: Record<number, string> = {
  1: 'ethereum',
  10: 'optimism',
  56: 'binance-smart-chain',
  137: 'polygon-pos',
  42161: 'arbitrum-one',
  43114: 'avalanche',
  8453: 'base',
  10143: 'monad-testnet',
}

const FALLBACK_PRICES: Record<string, number> = {
  BTC: 65000,
  ETH: 3200,
  WETH: 3200,
  BNB: 600,
  SOL: 145,
  MATIC: 0.6,
  POL: 0.6,
  ARB: 0.85,
  OP: 2.2,
  AVAX: 35,
  LINK: 14,
  UNI: 7.5,
  AAVE: 95,
  MKR: 2800,
  COMP: 52,
  SUSHI: 1.2,
  CRV: 0.35,
  LDO: 1.8,
  PEPE: 0.00001,
  SHIB: 0.000025,
  DOGE: 0.12,
  WBTC: 65000,
  USDC: 1,
  USDT: 1,
  DAI: 1,
  MON: 0.25,
}

async function fetchWithRetry(url: string, retries = 2, delayMs = 500): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url)
      if (res.ok) return res
      if (res.status === 429 && attempt < retries) {
        const wait = delayMs * Math.pow(2, attempt)
        await new Promise((r) => setTimeout(r, wait))
        continue
      }
      return res
    } catch {
      if (attempt < retries) {
        const wait = delayMs * Math.pow(2, attempt)
        await new Promise((r) => setTimeout(r, wait))
        continue
      }
      throw new Error(`Failed after ${retries + 1} attempts`)
    }
  }
  throw new Error('Unreachable')
}

export class PriceService {
  async getTokenPrice(symbol: string, chainId?: number, contractAddress?: string): Promise<number> {
    const upper = symbol.trim().toUpperCase()
    if (!upper) return 0

    const cacheKey = `price:${upper.toLowerCase()}`
    const cached = await cacheGet(cacheKey)
    if (cached) return parseFloat(cached)

    const envPrice = this.getEnvPrice(upper)
    if (envPrice > 0) {
      await cacheSetex(cacheKey, CACHE_TTL.PRICE, envPrice.toString())
      return envPrice
    }

    const fallback = FALLBACK_PRICES[upper]
    if (fallback > 0) {
      await cacheSetex(cacheKey, CACHE_TTL.PRICE, fallback.toString())
      return fallback
    }

    if (contractAddress && contractAddress !== '0x0000000000000000000000000000000000000000') {
      const cgPrice = await this.tryCoinGeckoByAddress(chainId, contractAddress)
      if (cgPrice > 0) {
        await cacheSetex(cacheKey, CACHE_TTL.PRICE, cgPrice.toString())
        return cgPrice
      }
    }

    const defiLlamaPrice = await this.tryDefiLlama(upper)
    if (defiLlamaPrice > 0) {
      await cacheSetex(cacheKey, CACHE_TTL.PRICE, defiLlamaPrice.toString())
      return defiLlamaPrice
    }

    const coingeckoPrice = await this.tryCoinGeckoBySymbol(upper)
    if (coingeckoPrice > 0) {
      await cacheSetex(cacheKey, CACHE_TTL.PRICE, coingeckoPrice.toString())
      return coingeckoPrice
    }

    return 0
  }

  async getMarketPrice(symbol: string): Promise<MarketPrice> {
    const upper = symbol.trim().toUpperCase()
    if (!upper) throw new Error('Missing symbol')

    const env = this.getEnvPriceObj(upper)
    if (env) return env

    const fallback = FALLBACK_PRICES[upper]
    if (fallback > 0) {
      return {
        symbol,
        priceUsd: fallback,
        source: 'local-fallback',
        updatedAt: new Date().toISOString(),
      }
    }

    const defiLlama = await this.tryDefiLlamaObj(upper)
    if (defiLlama) return defiLlama

    const coingecko = await this.tryCoinGeckoObj(upper)
    if (coingecko) return coingecko

    throw new Error(`No market price source is configured for ${symbol}`)
  }

  private getEnvPrice(symbol: string): number {
    const raw = process.env[`${symbol}_USD_PRICE`]
    if (raw === undefined || raw.trim() === '') return 0
    const n = parseFloat(raw)
    return Number.isFinite(n) ? n : 0
  }

  private getEnvPriceObj(symbol: string): MarketPrice | null {
    const value = this.getEnvPrice(symbol)
    if (value <= 0) return null
    return {
      symbol,
      priceUsd: value,
      source: `${symbol}_USD_PRICE`,
      updatedAt: new Date().toISOString(),
    }
  }

  private async tryDefiLlama(symbol: string): Promise<number> {
    const id = COINGECKO_IDS[symbol]
    if (!id) return 0

    const coinKey = `coingecko:${id}`
    try {
      const res = await fetchWithRetry(`https://coins.llama.fi/prices/current/${coinKey}`)
      if (!res.ok) return 0
      const data = await res.json() as { coins?: Record<string, { price?: number; timestamp?: number }> }
      const coin = data.coins?.[coinKey]
      if (coin?.price && Number.isFinite(coin.price)) return coin.price
    } catch {
      // ignore
    }
    return 0
  }

  private async tryDefiLlamaObj(symbol: string): Promise<MarketPrice | null> {
    const id = COINGECKO_IDS[symbol]
    if (!id) return null

    const coinKey = `coingecko:${id}`
    try {
      const res = await fetchWithRetry(`https://coins.llama.fi/prices/current/${coinKey}`)
      if (!res.ok) return null
      const data = await res.json() as { coins?: Record<string, { price?: number; timestamp?: number }> }
      const coin = data.coins?.[coinKey]
      if (coin?.price && Number.isFinite(coin.price)) {
        return {
          symbol,
          priceUsd: coin.price,
          source: 'DefiLlama/CoinGecko',
          updatedAt: coin.timestamp ? new Date(coin.timestamp * 1000).toISOString() : new Date().toISOString(),
        }
      }
    } catch {
      // ignore
    }
    return null
  }

  private async tryCoinGeckoByAddress(chainId: number | undefined, address: string): Promise<number> {
    if (!chainId) return 0
    const cgChain = COINGECKO_CHAIN_IDS[chainId]
    if (!cgChain) return 0

    try {
      const url = `https://api.coingecko.com/api/v3/simple/token_prices/${cgChain}?contract_addresses=${address}&vs_currencies=usd`
      const res = await fetchWithRetry(url)
      if (!res.ok) return 0
      const data = await res.json() as Record<string, { usd?: number }>
      const key = address.toLowerCase()
      if (data[key]?.usd && Number.isFinite(data[key].usd)) return data[key].usd
    } catch {
      // ignore
    }
    return 0
  }

  private async tryCoinGeckoBySymbol(symbol: string): Promise<number> {
    const id = COINGECKO_IDS[symbol]
    if (!id) return 0

    try {
      const res = await fetchWithRetry(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`)
      if (!res.ok) return 0
      const data = await res.json() as Record<string, { usd?: number }>
      if (data[id]?.usd && Number.isFinite(data[id].usd)) return data[id].usd
    } catch {
      // ignore
    }
    return 0
  }

  private async tryCoinGeckoObj(symbol: string): Promise<MarketPrice | null> {
    const id = COINGECKO_IDS[symbol]
    if (!id) return null

    try {
      const res = await fetchWithRetry(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`)
      if (!res.ok) return null
      const data = await res.json() as Record<string, { usd?: number }>
      if (data[id]?.usd && Number.isFinite(data[id].usd)) {
        return {
          symbol,
          priceUsd: data[id].usd,
          source: 'CoinGecko',
          updatedAt: new Date().toISOString(),
        }
      }
    } catch {
      // ignore
    }
    return null
  }
}

export const priceService = new PriceService()
