import { NextRequest, NextResponse } from 'next/server'

const AUTH_HEADERS = ['x-user-address', 'x-message', 'x-signature']

const demoHistory = [
  {
    id: 'demo-1',
    txHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
    chainId: 50312,
    tokenIn: 'STT',
    tokenOut: 'USDC',
    amountIn: '0.5',
    amountOut: '92.14',
    aggregator: 'odos',
    gasPaidGwei: 6.8,
    priceImpact: 0.21,
    status: 'confirmed',
    executedAt: new Date(Date.now() - 1000 * 60 * 24).toISOString(),
    aiIntent: 'Swap 0.5 STT to USDC when gas is optimal',
  },
  {
    id: 'demo-2',
    txHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
    chainId: 50312,
    tokenIn: 'USDC',
    tokenOut: 'STT',
    amountIn: '50',
    amountOut: '27.16',
    aggregator: 'oneinch',
    gasPaidGwei: 7.1,
    priceImpact: 0.12,
    status: 'pending',
    executedAt: new Date(Date.now() - 1000 * 60 * 52).toISOString(),
    aiIntent: 'Buy STT with 50 USDC using the cheapest route',
  },
]

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const address = searchParams.get('address')
  const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL

  if (!address) return NextResponse.json({ ok: false, error: 'Missing address' }, { status: 400 })

  if (apiUrl) {
    try {
      const headers = new Headers()
      for (const header of AUTH_HEADERS) {
        const value = req.headers.get(header)
        if (value) headers.set(header, value)
      }

      const res = await fetch(`${apiUrl}/history/${address}`, { headers })
      if (res.ok) {
        const data = await res.json()
        return NextResponse.json({ ok: true, data })
      }
    } catch {
      // Fall through to demo response.
    }
  }

  return NextResponse.json({ ok: true, data: demoHistory, demo: true })
}
