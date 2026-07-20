import { NextRequest, NextResponse } from 'next/server'

const demoGas = {
  currentBaseFeeGwei: 6.4,
  suggestedMaxFeeGwei: 7.2,
  suggestedPriorityFeeGwei: 0.3,
  isOptimal: true,
  trend: 'falling',
  recommendation: 'execute',
  predictedDropMinutes: null,
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const chainId = searchParams.get('chainId') || '10143'
  const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL

  if (apiUrl) {
    try {
      const res = await fetch(`${apiUrl}/gas/${chainId}`)
      if (res.ok) {
        const data = await res.json()
        return NextResponse.json({ ok: true, data })
      }
    } catch {
      // Fall through to demo response.
    }
  }

  return NextResponse.json({ ok: true, data: demoGas, demo: true })
}
