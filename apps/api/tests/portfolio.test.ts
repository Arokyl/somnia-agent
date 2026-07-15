import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PortfolioService, TOKEN_LIST } from '../src/services/PortfolioService.js'

const SOMNIA_CHAIN_ID = 50312

describe('PortfolioService TOKEN_LIST', () => {
  it('includes STT as the native Somnia token on the Somnia chain', () => {
    const tokens = TOKEN_LIST[SOMNIA_CHAIN_ID]
    expect(tokens).toBeDefined()
    const stt = tokens.find((t) => t.symbol === 'STT')
    expect(stt).toBeDefined()
    expect(stt!.address).toBe('0x0000000000000000000000000000000000000000')
    expect(stt!.decimals).toBe(18)
  })

  it('includes a USDC entry on the Somnia chain (placeholder)', () => {
    const tokens = TOKEN_LIST[SOMNIA_CHAIN_ID]
    const usdc = tokens.find((t) => t.symbol === 'USDC')
    expect(usdc).toBeDefined()
    expect(usdc!.decimals).toBe(6)
  })
})

describe('PortfolioService.getTokenPrice', () => {
  const service = new PortfolioService() as any

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
    delete process.env.STT_USD_PRICE
  })

  it('looks up ETH via CoinGecko and returns the price', async () => {
    const price = await service.getTokenPrice('ETH')
    expect(price).toBe(3000)
    expect((globalThis.fetch as any).mock.calls[0][0]).toContain('ids=ethereum')
  })

  it('prices STT from STT_USD_PRICE env var, not CoinGecko', async () => {
    process.env.STT_USD_PRICE = '0.25'
    const price = await service.getTokenPrice('STT')
    expect(price).toBe(0.25)
    // STT should never hit the CoinGecko endpoint.
    expect((globalThis.fetch as any).mock.calls.length).toBe(0)
  })

  it('returns 0 for STT when STT_USD_PRICE is unset', async () => {
    const price = await service.getTokenPrice('STT')
    expect(price).toBe(0)
    expect((globalThis.fetch as any).mock.calls.length).toBe(0)
  })
})
