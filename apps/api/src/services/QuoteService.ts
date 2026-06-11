import { formatGwei, formatUnits, parseUnits } from 'viem'
import { getClient } from '../lib/rpc'
import { cacheGet, cacheSetex, CACHE_TTL } from '../lib/redis'
import type { AggregatedQuote, Aggregator } from '@somnia-agent/shared'

interface QuoteRequest {
  tokenIn: string
  tokenOut: string
  amountIn: string       // decimal string e.g. "1.5"
  tokenInDecimals: number
  tokenOutDecimals: number
  chainId: number
  slippageBps?: number
}

export class QuoteService {
  async getBestQuote(req: QuoteRequest): Promise<AggregatedQuote> {
    const cacheKey = `quote:${req.chainId}:${req.tokenIn}:${req.tokenOut}:${req.amountIn}`
    const cached = await cacheGet(cacheKey)
    if (cached) return JSON.parse(cached)

    const amountInWei = parseUnits(req.amountIn, req.tokenInDecimals)

    // Fetch from all aggregators in parallel, ignore failures
    const results = await Promise.allSettled([
      this.fetch1inch(req, amountInWei),
      this.fetch0x(req, amountInWei),
    ])

    const quotes: AggregatedQuote[] = results
      .filter((r): r is PromiseFulfilledResult<AggregatedQuote> => r.status === 'fulfilled')
      .map((r) => r.value)

    if (quotes.length === 0) throw new Error('No quotes available from any aggregator')

    // Sort by effectiveRate (output minus estimated gas cost)
    quotes.sort((a, b) => b.effectiveRate - a.effectiveRate)
    const best = quotes[0]

    await cacheSetex(cacheKey, CACHE_TTL.QUOTE, JSON.stringify(best))
    return best
  }

  async getAllQuotes(req: QuoteRequest): Promise<AggregatedQuote[]> {
    const amountInWei = parseUnits(req.amountIn, req.tokenInDecimals)
    const results = await Promise.allSettled([
      this.fetch1inch(req, amountInWei),
      this.fetch0x(req, amountInWei),
    ])
    return results
      .filter((r): r is PromiseFulfilledResult<AggregatedQuote> => r.status === 'fulfilled')
      .map((r) => r.value)
      .sort((a, b) => b.effectiveRate - a.effectiveRate)
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
    let ethPriceUsd = parseFloat(process.env.ETH_USD_PRICE || '3000')

    try {
      const client = getClient(chainId)
      const gasPrice = await client.getGasPrice()
      gasPriceGwei = parseFloat(formatGwei(gasPrice))
    } catch {
      // Fallback to a reasonable default if the chain client is unavailable
    }

    const gasEth = Number(gasUnits) * gasPriceGwei * 1e-9
    return gasEth * ethPriceUsd
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
