import { NextRequest, NextResponse } from 'next/server'

const demoPlan = {
  intent: {
    tokenIn: 'STT',
    tokenOut: 'USDC',
    amountIn: '0.1',
    amountType: 'exact',
    urgency: 'high',
    conditions: [],
    raw: 'Swap 0.1 STT to USDC at the cheapest gas',
  },
  quote: {
    aggregator: 'odos',
    amountIn: '100000000000000000',
    tokenIn: 'STT',
    tokenOut: 'USDC',
    amountOut: '18420000',
    amountOutFormatted: '18.42',
    priceImpact: 0.18,
    gasEstimate: '142000',
    gasEstimateUsd: 0.04,
    route: [{ protocol: 'Somnia DEX', tokenIn: 'STT', tokenOut: 'USDC', share: 100 }],
    effectiveRate: 18.38,
  },
  gasAssessment: {
    currentBaseFeeGwei: 6.4,
    suggestedMaxFeeGwei: 7.2,
    suggestedPriorityFeeGwei: 0.3,
    isOptimal: true,
    trend: 'falling',
    recommendation: 'execute',
    predictedDropMinutes: null,
  },
  shouldExecuteNow: false,
  estimatedOutput: '18.42 USDC',
  warnings: ['Demo mode: connect backend services before signing real transactions.'],
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const agentUrl = process.env.AGENT_URL || process.env.NEXT_PUBLIC_AGENT_URL

  if (agentUrl) {
    try {
      const res = await fetch(`${agentUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        const data = await res.json()
        return NextResponse.json({ ok: true, ...data })
      }
    } catch {
      // Fall through to demo response.
    }
  }

  return NextResponse.json({
    ok: true,
    reply: `Demo agent parsed: "${body.message}". Best route is Odos, gas is favorable, and the plan is ready for review.`,
    plan: {
      ...demoPlan,
      intent: {
        ...demoPlan.intent,
        raw: body.message,
      },
    },
    demo: true,
  })
}
