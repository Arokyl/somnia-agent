'use client'

import { useEffect, useState } from 'react'
import type { Trade } from '@somnia-agent/shared'

export default function TradeHistory({ address }: { address: string }) {
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [isDemo, setIsDemo] = useState(false)

  useEffect(() => {
    fetch(`/api/history?address=${address}`)
      .then((response) => response.json())
      .then((data) => {
        setTrades(data.data || [])
        setIsDemo(Boolean(data.demo))
      })
      .catch(() => setTrades([]))
      .finally(() => setLoading(false))
  }, [address])

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
        <h2 className="panel-title">Recent Trades</h2>
        {isDemo && <span className="status-chip">Demo data</span>}
      </div>

      {loading && <p className="panel-subtitle">Loading trade history...</p>}
      {!loading && trades.length === 0 && (
        <p className="panel-subtitle">No trades yet. Try a swap command above.</p>
      )}

      <div className="trade-list">
        {trades.map((trade) => (
          <div key={trade.id} className="trade-row">
            <div style={{ minWidth: 0 }}>
              <p>{trade.tokenIn} to {trade.tokenOut}</p>
              <p className="muted" style={{ fontSize: '0.8rem' }}>
                {new Date(trade.executedAt).toLocaleDateString()} via {trade.aggregator}
              </p>
              {trade.aiIntent && <p className="muted" style={{ fontSize: '0.8rem' }}>"{trade.aiIntent}"</p>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <p>{Number(trade.amountOut).toFixed(4)} {trade.tokenOut}</p>
              <p className={trade.status === 'confirmed' ? 'success' : 'warning'}>{trade.status}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
