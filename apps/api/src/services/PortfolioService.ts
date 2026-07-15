import { formatUnits, erc20Abi } from 'viem'
import { getClient } from '../lib/rpc.js'
import { cacheGet, cacheSetex, CACHE_TTL } from '../lib/redis.js'
import type { Portfolio, TokenBalance } from '@somnia-agent/shared'

// Minimal token list per chain (extend with your own token registry)
// NOTE: The native Somnia token is STT. Its address is the zero address on-chain.
// STT is NOT listed on CoinGecko under a "somnia" id, so we price it via the
// STT_USD_PRICE env var (see getTokenPrice) instead of a CoinGecko lookup.
export const TOKEN_LIST: Record<number, Array<{ address: string; symbol: string; name: string; decimals: number; logoURI?: string }>> = {
  50312: [  // Somnia testnet — fill with actual deployed token addresses
    { address: '0x0000000000000000000000000000000000000000', symbol: 'STT',  name: 'Somnia',    decimals: 18 },
    // USDC on Somnia — placeholder until the canonical deployed address is confirmed.
    // TODO: replace with the verified Somnia USDC contract address.
    { address: '0x0000000000000000000000000000000000000001', symbol: 'USDC', name: 'USD Coin',  decimals: 6 },
    // TODO: add other known Somnia testnet tokens (e.g. USDT, stSTT) once addresses are confirmed.
  ],
  1: [      // Ethereum mainnet
    { address: '0x0000000000000000000000000000000000000000', symbol: 'ETH',  name: 'Ethereum',  decimals: 18 },
    { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', name: 'USD Coin',  decimals: 6  },
    { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', name: 'Tether',     decimals: 6  },
    { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', symbol: 'DAI',  name: 'Dai',       decimals: 18 },
  ],
  8453: [   // Base
    { address: '0x0000000000000000000000000000000000000000', symbol: 'ETH',  name: 'Ethereum',  decimals: 18 },
    { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', name: 'USD Coin',  decimals: 6  },
  ],
}

export class PortfolioService {
  async getPortfolio(address: string, chainId: number): Promise<Portfolio> {
    const cacheKey = `portfolio:${chainId}:${address}`
    const cached = await cacheGet(cacheKey)
    if (cached) return JSON.parse(cached)

    const client = getClient(chainId)
    const tokens = TOKEN_LIST[chainId] ?? []
    const balances: TokenBalance[] = []

    await Promise.all(
      tokens.map(async (token) => {
        try {
          let rawBalance: bigint

          if (token.address === '0x0000000000000000000000000000000000000000') {
            // Native token balance
            rawBalance = await client.getBalance({ address: address as `0x${string}` })
          } else {
            rawBalance = await client.readContract({
              address: token.address as `0x${string}`,
              abi: erc20Abi,
              functionName: 'balanceOf',
              args: [address as `0x${string}`],
            }) as bigint
          }

          if (rawBalance === 0n) return

          const formatted = formatUnits(rawBalance, token.decimals)
          const usdPrice = await this.getTokenPrice(token.symbol)

          balances.push({
            ...token,
            chainId: chainId as any,
            balance:          rawBalance.toString(),
            balanceFormatted: formatted,
            balanceUsd:       parseFloat(formatted) * usdPrice,
          })
        } catch (err) {
          // Skip tokens that fail (not deployed on this chain, etc.)
        }
      })
    )

    const portfolio: Portfolio = {
      address,
      chainId: chainId as any,
      tokens:  balances.sort((a, b) => b.balanceUsd - a.balanceUsd),
      totalUsdValue: balances.reduce((sum, t) => sum + t.balanceUsd, 0),
      updatedAt: new Date().toISOString(),
    }

    await cacheSetex(cacheKey, CACHE_TTL.PORTFOLIO, JSON.stringify(portfolio))
    return portfolio
  }

  private async getTokenPrice(symbol: string): Promise<number> {
    const upper = symbol.toUpperCase()

    // STT is the native Somnia token and is not reliably listed on CoinGecko
    // (mapping it to 'ethereum' would incorrectly price it ~$3000). Operators
    // must supply STT_USD_PRICE; fall back to 0 and warn once so it's obvious.
    if (upper === 'STT') {
      const price = getSttUsdPrice()
      if (price === 0 && !sttPriceWarned) {
        console.warn(
          '[PortfolioService] STT_USD_PRICE is not set (or is 0); STT will be reported at $0. ' +
          'Set STT_USD_PRICE to the real STT/USD price to value Somnia native balances.'
        )
        sttPriceWarned = true
      }
      return price
    }

    // Simple coingecko free API lookup — cache aggressively
    const cacheKey = `price:${upper.toLowerCase()}`
    const cached = await cacheGet(cacheKey)
    if (cached) return parseFloat(cached)

    const idMap: Record<string, string> = {
      ETH: 'ethereum', USDC: 'usd-coin', USDT: 'tether', DAI: 'dai',
    }
    const id = idMap[upper]
    if (!id) return 0

    try {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`
      )
      const data = await res.json()
      const price = data[id]?.usd ?? 0
      await cacheSetex(cacheKey, 60, price.toString())
      return price
    } catch {
      return 0
    }
  }
}

function getSttUsdPrice(): number {
  const raw = process.env.STT_USD_PRICE
  if (raw === undefined || raw.trim() === '') return 0
  const n = parseFloat(raw)
  return Number.isFinite(n) ? n : 0
}

// Module-level flag so we only warn once about a missing STT price.
let sttPriceWarned = false

export const portfolioService = new PortfolioService()
