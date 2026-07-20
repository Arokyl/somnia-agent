import { formatGwei, formatUnits, parseUnits } from 'viem'
import { getClient } from '../lib/rpc.js'
import { cacheGet, cacheSetex, CACHE_TTL } from '../lib/redis.js'
import type { AggregatedQuote, Aggregator } from '@somnia-agent/shared'
import { priceService } from './PriceService.js'

interface QuoteRequest {
  tokenIn: string
  tokenOut: string
  amountIn: string       // decimal string e.g. "1.5"
  tokenInDecimals: number
  tokenOutDecimals: number
  chainId: number
  slippageBps?: number
}

const ZEROX_SUPPORTED_CHAIN_IDS = new Set([
  1, 10, 56, 130, 137, 146, 480, 999, 2741, 4217, 5000, 8453, 9745, 42161,
  43114, 57073, 59144, 80094, 534352,
])

const DREAMDEX_BASE_URLS: Record<number, string> = {
  10143: 'https://stg.api.dreamdex.io/v0',
  1014: 'https://api.dreamdex.io/v0',
}

const DREAMDEX_TOKEN_ALIASES: Record<string, string> = {
  MON: 'MON',
  MONAD: 'MON',
  USD: 'USDso',
  USDSO: 'USDso',
  USDC: 'USDso',
  'USDC.E': 'USDso',
  USDT: 'USDso',
  ETH: 'WETH',
  WETH: 'WETH',
  WBTC: 'WBTC',
}

interface DreamDexRouteStep {
  market: string
  fromToken: string
  toToken: string
}

interface DreamDexOrderBookEntry {
  symbol?: string
  bids?: Array<{ price?: string | number; quantity?: string | number }>
  asks?: Array<{ price?: string | number; quantity?: string | number }>
}

interface DreamDexOrderBooksResponse {
  orderbooks?: DreamDexOrderBookEntry[]
}

export function normalizeDreamDexToken(token: string): string | null {
  const trimmed = token?.trim()
  if (!trimmed) return null

  const upper = trimmed.toUpperCase()
  return DREAMDEX_TOKEN_ALIASES[upper] ?? (['MON', 'USDso', 'WBTC', 'WETH'].includes(upper) ? upper : null)
}

export function resolveDreamDexRoute(tokenIn: string, tokenOut: string): DreamDexRouteStep[] | null {
  const normalizedIn = normalizeDreamDexToken(tokenIn)
  const normalizedOut = normalizeDreamDexToken(tokenOut)

  if (!normalizedIn || !normalizedOut || normalizedIn === normalizedOut) return null

  if (normalizedIn === 'USDso' || normalizedOut === 'USDso') {
    const baseToken = normalizedIn === 'USDso' ? normalizedOut : normalizedIn
    const quoteToken = normalizedIn === 'USDso' ? normalizedIn : normalizedOut
    return [{ market: `${baseToken}:USDso`, fromToken: normalizedIn, toToken: normalizedOut }]
  }

  return [
    { market: `${normalizedIn}:USDso`, fromToken: normalizedIn, toToken: 'USDso' },
    { market: `${normalizedOut}:USDso`, fromToken: 'USDso', toToken: normalizedOut },
  ]
}

export class QuoteService {
  async getBestQuote(req: QuoteRequest): Promise<AggregatedQuote> {
    const cacheKey = `quote:${req.chainId}:${req.tokenIn}:${req.tokenOut}:${req.amountIn}`
    const cached = await cacheGet(cacheKey)
    if (cached) return JSON.parse(cached)

    const amountInWei = parseUnits(req.amountIn, req.tokenInDecimals)

    // Fetch from configured and chain-supported aggregators in parallel, ignore failures.
    const fetchers = this.getQuoteFetchers(req, amountInWei)
    if (fetchers.length === 0) throw new Error(this.unsupportedChainMessage(req.chainId))
    const results = await Promise.allSettled(fetchers)

    const quotes: AggregatedQuote[] = results
      .filter((r): r is PromiseFulfilledResult<AggregatedQuote> => r.status === 'fulfilled')
      .map((r) => r.value)

    if (quotes.length === 0) throw new Error(this.unsupportedChainMessage(req.chainId))

    // Sort by effectiveRate (output minus estimated gas cost)
    quotes.sort((a, b) => b.effectiveRate - a.effectiveRate)
    const best = quotes[0]

    await cacheSetex(cacheKey, CACHE_TTL.QUOTE, JSON.stringify(best))
    return best
  }

  async getAllQuotes(req: QuoteRequest): Promise<AggregatedQuote[]> {
    const amountInWei = parseUnits(req.amountIn, req.tokenInDecimals)
    const fetchers = this.getQuoteFetchers(req, amountInWei)
    if (fetchers.length === 0) return []
    const results = await Promise.allSettled(fetchers)
    return results
      .filter((r): r is PromiseFulfilledResult<AggregatedQuote> => r.status === 'fulfilled')
      .map((r) => r.value)
      .sort((a, b) => b.effectiveRate - a.effectiveRate)
  }

  private getQuoteFetchers(req: QuoteRequest, amountInWei: bigint): Array<Promise<AggregatedQuote>> {
    const fetchers: Array<Promise<AggregatedQuote>> = []

    if (DREAMDEX_BASE_URLS[req.chainId]) {
      fetchers.push(this.fetchDreamDex(req, amountInWei))
    }

    if (process.env.ONEINCH_API_KEY) {
      fetchers.push(this.fetch1inch(req, amountInWei))
    }

    if (process.env.ZEROX_API_KEY && ZEROX_SUPPORTED_CHAIN_IDS.has(req.chainId)) {
      fetchers.push(this.fetch0x(req, amountInWei))
    }

    return fetchers
  }

  private async fetchDreamDex(req: QuoteRequest, amountInWei: bigint): Promise<AggregatedQuote> {
    const baseUrl = DREAMDEX_BASE_URLS[req.chainId] || process.env.DREAMDEX_API_URL || 'https://stg.api.dreamdex.io/v0'
    const route = resolveDreamDexRoute(req.tokenIn, req.tokenOut)

    if (!route) {
      throw new Error(`DreamDex does not currently expose a direct market route for ${req.tokenIn} -> ${req.tokenOut}`)
    }

    const amountInFormatted = formatUnits(amountInWei, req.tokenInDecimals)
    const amountOutFormatted = await this.getDreamDexQuoteAmount(baseUrl, route, amountInFormatted)
    const amountOut = parseUnits(amountOutFormatted, req.tokenOutDecimals).toString()
    const gasEst = 200000n
    const gasUsd = await this.estimateGasUsd(gasEst, req.chainId)

    return {
      aggregator: 'direct',
      amountIn: amountInWei.toString(),
      tokenIn: req.tokenIn,
      tokenOut: req.tokenOut,
      amountOut,
      amountOutFormatted,
      priceImpact: 0.1,
      gasEstimate: gasEst.toString(),
      gasEstimateUsd: gasUsd,
      route: route.map((step) => ({ protocol: 'dreamDEX', tokenIn: step.fromToken, tokenOut: step.toToken, share: 100 / route.length })),
      effectiveRate: parseFloat(amountOutFormatted) - gasUsd,
    }
  }

  private async getDreamDexQuoteAmount(baseUrl: string, route: DreamDexRouteStep[], amountIn: string): Promise<string> {
    const symbols = Array.from(new Set(route.map((step) => step.market)))
    const res = await fetch(`${baseUrl}/orderbooks?symbols=${encodeURIComponent(symbols.join(','))}`)

    if (!res.ok) {
      throw new Error(`DreamDex orderbook error: ${res.status}`)
    }

    const data = (await res.json()) as DreamDexOrderBooksResponse
    const books = new Map<string, { bestBid: number | null; bestAsk: number | null }>()

    for (const entry of data.orderbooks ?? []) {
      if (!entry.symbol) continue
      const bids = (entry.bids ?? []).map((bid) => Number(bid.price ?? 0)).filter((value) => Number.isFinite(value) && value > 0)
      const asks = (entry.asks ?? []).map((ask) => Number(ask.price ?? 0)).filter((value) => Number.isFinite(value) && value > 0)
      books.set(entry.symbol, { bestBid: bids[0] ?? null, bestAsk: asks[0] ?? null })
    }

    let currentAmount = Number(amountIn)

    for (const step of route) {
      const book = books.get(step.market)
      if (!book) {
        throw new Error(`DreamDex has no orderbook data for ${step.market}`)
      }

      if (step.fromToken === 'USDso' && step.toToken !== 'USDso') {
        if (book.bestAsk == null || book.bestAsk <= 0) throw new Error(`DreamDex has no ask liquidity for ${step.market}`)
        currentAmount = currentAmount / book.bestAsk
      } else {
        if (book.bestBid == null || book.bestBid <= 0) throw new Error(`DreamDex has no bid liquidity for ${step.market}`)
        currentAmount = currentAmount * book.bestBid
      }
    }

    return currentAmount.toFixed(8)
  }

  private unsupportedChainMessage(chainId: number) {
    if (chainId === 10143) {
      return 'No configured quote aggregator currently supports Monad chain 10143. 0x does not list Monad as a supported Swap API chain, so Monad swaps need a Monad-native DEX/router quote source.'
    }

    return `No configured quote aggregator is available for chain ${chainId}. Add a supported quote provider API key or switch to a supported chain.`
  }

  private async fetch1inch(req: QuoteRequest, amountInWei: bigint): Promise<AggregatedQuote> {
    const apiKey = process.env.ONEINCH_API_KEY
    if (!apiKey) throw new Error('1inch API key not set')

    const url = `https://api.1inch.dev/swap/v6.0/${req.chainId}/quote`
    const params = new URLSearchParams({
      src:              req.tokenIn,
      dst:              req.tokenOut,
      amount:           amountInWei.toString(),
      includeGas:       'true',
      includeProtocols: 'true',
    })

    const res = await fetch(`${url}?${params}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })

    if (!res.ok) throw new Error(`1inch error: ${res.status}`)
    const data = await res.json()

    const amountOut = BigInt(data.dstAmount)
    const amountOutFormatted = formatUnits(amountOut, req.tokenOutDecimals)
    const gasEst = BigInt(data.gas || 200000)
    const gasUsd = await this.estimateGasUsd(gasEst, req.chainId)

    return {
      aggregator:        'oneinch',
      amountIn:          amountInWei.toString(),
      tokenIn:           req.tokenIn,
      tokenOut:          req.tokenOut,
      amountOut:         amountOut.toString(),
      amountOutFormatted,
      priceImpact:       parseFloat(data.estimatedPriceImpact || '0'),
      gasEstimate:       gasEst.toString(),
      gasEstimateUsd:    gasUsd,
      route:             this.parse1inchRoute(data.protocols),
      calldata:          data.tx?.data,
      to:                data.tx?.to,
      value:             data.tx?.value,
      effectiveRate:     parseFloat(amountOutFormatted) - gasUsd,
    }
  }

  private async fetch0x(req: QuoteRequest, amountInWei: bigint): Promise<AggregatedQuote> {
    const apiKey = process.env.ZEROX_API_KEY
    if (!apiKey) throw new Error('0x API key not set')

    const params = new URLSearchParams({
      sellToken:   req.tokenIn,
      buyToken:    req.tokenOut,
      sellAmount:  amountInWei.toString(),
      slippagePercentage: ((req.slippageBps || 50) / 10000).toString(),
    })

    const res = await fetch(`https://api.0x.org/swap/v1/quote?${params}`, {
      headers: { '0x-api-key': apiKey },
    })

    if (!res.ok) throw new Error(`0x error: ${res.status}`)
    const data = await res.json()

    const amountOut = BigInt(data.buyAmount)
    const amountOutFormatted = formatUnits(amountOut, req.tokenOutDecimals)
    const gasEst = BigInt(data.estimatedGas || 200000)
    const gasUsd = await this.estimateGasUsd(gasEst, req.chainId)

    return {
      aggregator:        'zerox',
      amountIn:          amountInWei.toString(),
      tokenIn:           req.tokenIn,
      tokenOut:          req.tokenOut,
      amountOut:         amountOut.toString(),
      amountOutFormatted,
      priceImpact:       parseFloat(data.estimatedPriceImpact || '0'),
      gasEstimate:       gasEst.toString(),
      gasEstimateUsd:    gasUsd,
      route:             [],
      calldata:          data.data,
      to:                data.to,
      value:             data.value,
      effectiveRate:     parseFloat(amountOutFormatted) - gasUsd,
    }
  }

  private async estimateGasUsd(gasUnits: bigint, chainId: number): Promise<number> {
    let gasPriceGwei = 30
    let nativePriceUsd = await priceService.getTokenPrice('MON', chainId)

    if (nativePriceUsd === 0) {
      nativePriceUsd = await priceService.getTokenPrice('ETH', chainId)
    }

    if (nativePriceUsd === 0) {
      nativePriceUsd = parseFloat(process.env.ETH_USD_PRICE || '3000')
    }

    try {
      const client = getClient(chainId)
      const gasPrice = await client.getGasPrice()
      gasPriceGwei = parseFloat(formatGwei(gasPrice))
    } catch {
      // Fallback to a reasonable default if the chain client is unavailable
    }

    const gasNative = Number(gasUnits) * gasPriceGwei * 1e-9
    return gasNative * nativePriceUsd
  }

  private parse1inchRoute(protocols: any[][]): AggregatedQuote['route'] {
    if (!protocols) return []
    return protocols.flat().map((p: any) => ({
      protocol:  p.name,
      tokenIn:   p.fromTokenAddress,
      tokenOut:  p.toTokenAddress,
      share:     p.part,
    }))
  }
}

export const quoteService = new QuoteService()
