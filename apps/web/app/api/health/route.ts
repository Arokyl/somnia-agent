import { NextResponse } from 'next/server'

type ServiceState = {
  ok: boolean
  url: string | null
  latencyMs: number | null
  error?: string
}

async function checkService(url: string | undefined, path = '/health'): Promise<ServiceState> {
  if (!url) return { ok: false, url: null, latencyMs: null, error: 'Not configured' }

  const startedAt = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 2500)

  try {
    const res = await fetch(`${url}${path}`, {
      cache: 'no-store',
      signal: controller.signal,
    })

    return {
      ok: res.ok,
      url,
      latencyMs: Date.now() - startedAt,
      error: res.ok ? undefined : `HTTP ${res.status}`,
    }
  } catch (error) {
    return {
      ok: false,
      url,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : 'Request failed',
    }
  } finally {
    clearTimeout(timeout)
  }
}

export async function GET() {
  const [api, agent] = await Promise.all([
    checkService(process.env.API_URL || process.env.NEXT_PUBLIC_API_URL),
    checkService(process.env.AGENT_URL || process.env.NEXT_PUBLIC_AGENT_URL),
  ])

  return NextResponse.json({
    ok: api.ok && agent.ok,
    api,
    agent,
    rpc: {
      primary: process.env.NEXT_PUBLIC_SOMNIA_RPC || null,
      fallback: process.env.NEXT_PUBLIC_SOMNIA_RPC_FALLBACK || null,
      chainId: 50312,
    },
  })
}
