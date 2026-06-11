'use client'

import { useEffect, useState } from 'react'
import { useChainId } from 'wagmi'
import type { GasAssessment } from '@somnia-agent/shared'

export default function GasTracker() {
  const chainId = useChainId()
  const [gas, setGas] = useState<GasAssessment | null>(null)

  useEffect(() => {
    const fetchGas = () => {
      window.fetch(`/api/gas?chainId=${chainId}`)
        .then((response) => response.json())
        .then((data) => setGas(data.data))
        .catch(() => setGas(null))
    }
    fetchGas()
    const id = setInterval(fetchGas, 15_000)
    return () => clearInterval(id)
  }, [chainId])

  if (!gas) return <span className="status-chip">Gas loading</span>

  return (
    <span className="status-chip">
      <span className={`dot ${gas.isOptimal ? 'ok' : ''}`} style={{ display: 'inline-block', marginRight: '0.45rem' }} />
      <span className="mono">{gas.currentBaseFeeGwei.toFixed(1)} gwei</span>
      <span className="muted" style={{ marginLeft: '0.45rem' }}>{gas.isOptimal ? 'optimal' : gas.trend}</span>
    </span>
  )
}
