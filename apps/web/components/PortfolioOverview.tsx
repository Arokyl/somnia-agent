'use client'

import { useEffect, useState } from 'react'
import { useChainId } from 'wagmi'
import type { Portfolio, TokenBalance } from '@somnia-agent/shared'

export default function PortfolioOverview({ address }: { address: string }) {
  const chainId = useChainId()
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [loading, setLoading] = useState(true)
  const [isDemo, setIsDemo] = useState(false)

  useEffect(() => {
    if (!address) return
    setLoading(true)
    fetch(`/api/portfolio?address=${address}&chainId=${chainId}`)
      .then((response) => response.json())
      .then((data) => {
        setPortfolio(data.data)
        setIsDemo(Boolean(data.demo))
      })
      .catch(() => setPortfolio(null))
      .finally(() => setLoading(false))
  }, [address, chainId])

  return (
    <div className="panel">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
        <div>
          <h2 className="panel-title">Portfolio</h2>
          {isDemo && <p className="panel-subtitle">Demo balances</p>}
        </div>
        {portfolio && (
          <span className="status-chip">
            ${portfolio.totalUsdValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
        )}
      </div>

      {loading && <p className="panel-subtitle">Loading balances...</p>}
      {!loading && !portfolio && <p className="panel-subtitle">Portfolio unavailable.</p>}
      {!loading && portfolio?.tokens.length === 0 && <p className="panel-subtitle">No tokens found.</p>}

      <div className="token-list">
        {!loading && portfolio?.tokens.map((token: TokenBalance) => (
          <div key={token.address} className="token-row">
            <div style={{ display: 'flex', minWidth: 0, alignItems: 'center', gap: '0.75rem' }}>
              <div className="status-chip" style={{ width: '2.4rem', height: '2.4rem', display: 'grid', placeItems: 'center', padding: 0 }}>
                {token.symbol.slice(0, 2)}
              </div>
              <div style={{ minWidth: 0 }}>
                <p>{token.symbol}</p>
                <p className="muted" style={{ fontSize: '0.8rem' }}>{token.name}</p>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p>{Number(token.balanceFormatted).toFixed(4)}</p>
              <p className="muted" style={{ fontSize: '0.8rem' }}>
                ${token.balanceUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        ))}
      </div>

      <p className="panel-subtitle" style={{ textAlign: 'center' }}>
        Updated {portfolio ? new Date(portfolio.updatedAt).toLocaleTimeString() : '-'}
      </p>
    </div>
  )
}
