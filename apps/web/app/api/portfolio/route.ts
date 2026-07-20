import { NextRequest, NextResponse } from 'next/server'

const AUTH_HEADERS = ['x-user-address', 'x-message', 'x-signature']

const demoPortfolio = {
  address: '0xDemo000000000000000000000000000000000000',
  chainId: 10143,
  totalUsdValue: 4286.78,
  updatedAt: new Date().toISOString(),
  tokens: [
    {
      address: '0x0000000000000000000000000000000000000000',
      symbol: 'MON',
      name: 'Monad',
      decimals: 18,
      chainId: 10143,
      balance: '1825000000000000000000',
      balanceFormatted: '1825.00',
      balanceUsd: 3358.0,
    },
    {
      address: '0x0000000000000000000000000000000000000001',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      chainId: 10143,
      balance: '928780000',
      balanceFormatted: '928.78',
      balanceUsd: 928.78,
    },
  ],
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const address = searchParams.get('address')
  const chainId = searchParams.get('chainId') || '10143'
  const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL

  if (!address) return NextResponse.json({ ok: false, error: 'Missing address' }, { status: 400 })

  if (apiUrl) {
    try {
      const headers = new Headers()
      for (const header of AUTH_HEADERS) {
        const value = req.headers.get(header)
        if (value) headers.set(header, value)
      }

      const res = await fetch(`${apiUrl}/portfolio/${address}?chainId=${chainId}`, { headers })
      if (res.ok) {
        const data = await res.json()
        return NextResponse.json({ ok: true, data })
      }
    } catch {
      // Fall through to demo response.
    }
  }

  return NextResponse.json({
    ok: true,
    data: {
      ...demoPortfolio,
      address,
      chainId: Number(chainId),
      updatedAt: new Date().toISOString(),
    },
    demo: true,
  })
}
