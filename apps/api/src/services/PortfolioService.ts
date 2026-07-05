import { formatUnits, erc20Abi } from 'viem'
import { getClient } from '../lib/rpc.js'
import { cacheGet, cacheSetex, CACHE_TTL } from '../lib/redis.js'
import type { Portfolio, TokenBalance } from '@somnia-agent/shared'

// Minimal token list per chain (extend with your own token registry)
const TOKEN_LIST: Record<number, Array<{ address: string; symbol: string; name: string; decimals: number; logoURI?: string }>> = {
  50312: [  // Somnia testnet — fill with actual deployed token addresses
    { address: '0x0000000000000000000000000000000000000000', symbol: 'STT',  name: 'Somnia',    decimals: 18 },
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
    // Simple coingecko free API lookup — cache aggressively
    const cacheKey = `price:${symbol.toLowerCase()}`
    const cached = await cacheGet(cacheKey)
    if (cached) return parseFloat(cached)

    const idMap: Record<string, string> = {
      ETH: 'ethereum', STT: 'ethereum', USDC: 'usd-coin', USDT: 'tether', DAI: 'dai',
    }
    const id = idMap[symbol.toUpperCase()]
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

export const portfolioService = new PortfolioService()
