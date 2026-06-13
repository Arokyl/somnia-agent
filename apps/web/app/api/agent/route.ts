import { NextRequest, NextResponse } from 'next/server'

const allowDemoAgent =
  process.env.ALLOW_DEMO_AGENT === 'true' ||
  (process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEMO_AGENT !== 'false')

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
  warnings: ['Local demo mode is enabled. Connect backend services before signing real transactions.'],
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const agentUrl = process.env.AGENT_URL || process.env.NEXT_PUBLIC_AGENT_URL

  if (!agentUrl && !allowDemoAgent) {
    return NextResponse.json(
      { error: 'Agent service is not configured. Set AGENT_URL in Vercel to your deployed agent service.' },
      { status: 503 }
    )
  }

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

      if (!allowDemoAgent) {
        return NextResponse.json(
          { error: `Agent service returned HTTP ${res.status}. Check the deployed agent logs and AGENT_URL.` },
          { status: 502 }
        )
      }
    } catch (error) {
      if (!allowDemoAgent) {
        return NextResponse.json(
          {
            error: error instanceof Error
              ? `Agent service request failed: ${error.message}`
              : 'Agent service request failed.',
          },
          { status: 502 }
        )
      }
    }
  }

  return NextResponse.json({
    ok: true,
    reply: `Local demo parsed: "${body.message}". Best route is Odos, gas is favorable, and the plan is ready for review.`,
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
