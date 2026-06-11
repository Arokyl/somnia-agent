'use client'

import { useEffect, useState } from 'react'

type Health = {
  api: { ok: boolean; latencyMs: number | null; error?: string }
  agent: { ok: boolean; latencyMs: number | null; error?: string }
  rpc: { primary: string | null; fallback: string | null; chainId: number }
}

function StatusRow({ label, ok, latencyMs }: { label: string; ok: boolean; latencyMs: number | null }) {
  return (
    <div className="health-row">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <span className={`dot ${ok ? 'ok' : ''}`} />
        <span>{label}</span>
      </div>
      <span className="muted">{ok && latencyMs !== null ? `${latencyMs}ms` : 'offline'}</span>
    </div>
  )
}

export default function SystemHealth() {
  const [health, setHealth] = useState<Health | null>(null)

  useEffect(() => {
    let mounted = true

    const load = () => {
      fetch('/api/health', { cache: 'no-store' })
        .then((res) => res.json())
        .then((data) => {
          if (mounted) setHealth(data)
        })
        .catch(() => {
          if (mounted) setHealth(null)
        })
    }

    load()
    const id = setInterval(load, 20_000)
    return () => {
      mounted = false
      clearInterval(id)
    }
  }, [])

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
        <div>
          <h2 className="panel-title">System status</h2>
          <p className="panel-subtitle">Agent, API, and Somnia runtime configuration.</p>
        </div>
        <span className="status-chip">Chain 50312</span>
      </div>

      <div className="health-list">
        <StatusRow label="Backend API" ok={Boolean(health?.api.ok)} latencyMs={health?.api.latencyMs ?? null} />
        <StatusRow label="Agent API" ok={Boolean(health?.agent.ok)} latencyMs={health?.agent.latencyMs ?? null} />
      </div>

      <div className="intro-card" style={{ marginTop: '1rem' }}>
        <p className="metric-label">Primary RPC</p>
        <p className="mono" style={{ marginTop: '0.55rem', wordBreak: 'break-all' }}>
          {health?.rpc.primary || 'https://api.infra.testnet.somnia.network/'}
        </p>
      </div>
    </div>
  )
}
