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

function getCommonReply(message?: string) {
  const text = message?.trim().toLowerCase() ?? ''
  if (!text) return null

  if (/^(hi|hello|hey|yo|gm|good\s+(morning|afternoon|evening))[\s!.]*$/.test(text)) {
    return {
      reply:
        'Hello. I am online and ready. You can speak normally: ask for a swap plan, a route comparison, gas timing, or a plain-language lesson before you sign anything.',
      reaction: 'greeting',
    }
  }

  if (/\b(thanks|thank you|appreciate it)\b/.test(text)) {
    return {
      reply:
        'You are welcome. Strong execution is quiet: know the goal, size the risk, read the wallet prompt, and only sign when the transaction matches the plan.',
      reaction: 'thanks',
    }
  }

  if (/\b(advice|teach|teacher|guide|learn|explain|safe|safely|risk)\b/.test(text)) {
    return {
      reply:
        'Teacher mode: begin with the outcome, then inspect the risk. For every swap, check six things: token in, token out, amount, expected output, price impact, and gas. Then compare those details against the wallet confirmation. If one line feels unclear, do not sign yet.',
      reaction: 'teacher',
    }
  }

  if (/\b(help|what can you do|commands?)\b/.test(text)) {
    return {
      reply:
        'I can teach, translate DeFi terms, compare routes, prepare swap plans, wait for cheaper gas, and help you review a transaction before you sign. I do not submit wallet transactions for you.',
      reaction: 'help',
    }
  }

  if (/\b(price|worth|value)\b/.test(text) && /\b(eth|ethereum)\b/.test(text)) {
    return {
      reply:
        'I can explain how ETH pricing works, but this chat is not wired to a live market feed yet. For a live number, use an exchange, oracle, or market API; then bring the intended trade here and I will help reason through route quality, gas, and risk.',
      reaction: 'market-education',
    }
  }

  return null
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const agentUrl = process.env.AGENT_URL || process.env.NEXT_PUBLIC_AGENT_URL
  const commonReply = getCommonReply(body.message)

  if (commonReply) {
    return NextResponse.json({ ok: true, ...commonReply })
  }

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
