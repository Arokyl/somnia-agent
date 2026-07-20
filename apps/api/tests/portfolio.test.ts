import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PortfolioService, TOKEN_LIST } from '../src/services/PortfolioService.js'
import { priceService } from '../src/services/PriceService.js'

const MONAD_CHAIN_ID = 10143

describe('PortfolioService TOKEN_LIST', () => {
  it('includes MON as the native Monad token on the Monad chain', () => {
    const tokens = TOKEN_LIST[MONAD_CHAIN_ID]
    expect(tokens).toBeDefined()
    const mon = tokens.find((t) => t.symbol === 'MON')
    expect(mon).toBeDefined()
    expect(mon!.address).toBe('0x0000000000000000000000000000000000000000')
    expect(mon!.decimals).toBe(18)
  })

  it('includes a USDC entry on the Monad chain (placeholder)', () => {
    const tokens = TOKEN_LIST[MONAD_CHAIN_ID]
    const usdc = tokens.find((t) => t.symbol === 'USDC')
    expect(usdc).toBeDefined()
    expect(usdc!.decimals).toBe(6)
  })
})

describe('PriceService.getTokenPrice', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        json: async () => ({ ethereum: { usd: 3000 } }),
      }))
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    delete process.env.MON_USD_PRICE
    delete process.env.ETH_USD_PRICE
  })

  it('looks up ETH via CoinGecko and returns the price', async () => {
    const price = await priceService.getTokenPrice('ETH')
    expect(price).toBe(3000)
    expect((globalThis.fetch as any).mock.calls[0][0]).toContain('ids=ethereum')
  })

  it('prices MON from MON_USD_PRICE env var, not CoinGecko', async () => {
    process.env.MON_USD_PRICE = '0.25'
    const price = await priceService.getTokenPrice('MON')
    expect(price).toBe(0.25)
    expect((globalThis.fetch as any).mock.calls.length).toBe(0)
  })

  it('returns 0 for MON when MON_USD_PRICE is unset', async () => {
    const price = await priceService.getTokenPrice('MON')
    expect(price).toBe(0)
    expect((globalThis.fetch as any).mock.calls.length).toBe(0)
  })
})
