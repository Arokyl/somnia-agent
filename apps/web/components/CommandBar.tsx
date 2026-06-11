'use client'

import { useEffect, useRef, useState } from 'react'
import { useAccount, useChainId } from 'wagmi'
import type { ExecutionPlan } from '@somnia-agent/shared'
import SwapConfirmModal from './SwapConfirmModal'

interface Message {
  role: 'user' | 'assistant'
  content: string
  plan?: ExecutionPlan
  demo?: boolean
}

const EXAMPLE_COMMANDS = [
  'Swap 0.1 STT to USDC at the cheapest gas',
  'Find the safest route for 1 STT to USDC',
  'Compare routes for 0.5 STT to USDC',
  'Wait until gas is below 8 gwei before swapping',
]

function PlanSummary({ plan, onReview }: { plan: ExecutionPlan; onReview: () => void }) {
  const hasExecutableTx = Boolean(plan.unsignedTx)

  return (
    <div className="plan-card">
      <div className="plan-head">
        <p className="eyebrow">Execution plan</p>
      </div>
      <div className="plan-grid">
        <div>
          <p className="muted">Route</p>
          <p className="metric-value">{plan.quote?.aggregator ?? 'Pending'}</p>
        </div>
        <div>
          <p className="muted">Receive</p>
          <p className="metric-value success">{plan.estimatedOutput ?? '-'}</p>
        </div>
        <div>
          <p className="muted">Gas</p>
          <p className="metric-value">{plan.gasAssessment?.currentBaseFeeGwei?.toFixed(1) ?? '-'} gwei</p>
        </div>
      </div>
      {plan.warnings?.length > 0 && (
        <div className="plan-head">
          {plan.warnings.map((warning) => (
            <p key={warning} className="warning">{warning}</p>
          ))}
        </div>
      )}
      <div className="plan-actions">
        <span className="status-chip">{hasExecutableTx ? 'Ready for wallet review' : 'Plan review only'}</span>
        <button type="button" className="primary-button" onClick={onReview}>
          Review plan
        </button>
      </div>
    </div>
  )
}

export default function CommandBar({ address }: { address: string }) {
  const chainId = useChainId()
  const { isConnected } = useAccount()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [pendingPlan, setPendingPlan] = useState<ExecutionPlan | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const sendCommand = async (command: string) => {
    if (!command.trim() || loading) return

    const userMsg: Message = { role: 'user', content: command }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: command,
          walletContext: { address, chainId },
          history: messages.map(({ role, content }) => ({ role, content })),
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Agent request failed')

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.reply ?? 'I prepared an execution plan for review.',
          plan: data.plan,
          demo: Boolean(data.demo),
        },
      ])
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: error instanceof Error
            ? `Agent request failed: ${error.message}`
            : 'Agent request failed. Check the Agent API status panel and retry.',
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="chat-panel">
      <div className="chat-header">
        <div className="chat-header-row">
          <div>
            <p className="eyebrow">AI Agent Chat</p>
            <h2 className="chat-title">What should your Somnia agent do?</h2>
            <p className="chat-copy">
              The agent can analyze intent and prepare a transaction plan. You stay in control of every wallet signature.
            </p>
          </div>
          <div className="network-card">
            <p className="muted">Network</p>
            <p className="mono">{chainId === 50312 ? 'Somnia 50312' : `Chain ${chainId}`}</p>
          </div>
        </div>
      </div>

      <div className="chat-body">
        {messages.length === 0 && (
          <div className="empty-chat">
            <div className="intro-card">
              <h3 className="panel-title">{isConnected ? 'Start with a natural command' : 'Try the agent, then connect'}</h3>
              <p className="panel-subtitle">
                Pick a prompt or type your own trade request. Wallet signing stays disabled until you connect.
              </p>
            </div>
            <div className="prompt-grid">
              {EXAMPLE_COMMANDS.map((cmd) => (
                <button key={cmd} type="button" className="prompt-button" onClick={() => sendCommand(cmd)}>
                  {cmd}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="message-list">
          {messages.map((msg, index) => (
            <div key={`${msg.role}-${index}`} className={`message-wrap ${msg.role === 'user' ? 'user' : ''}`}>
              <div className={`message-card ${msg.role === 'user' ? 'user' : ''}`}>
                <p className="message-meta">{msg.role === 'user' ? 'You' : msg.demo ? 'Agent demo fallback' : 'Somnia agent'}</p>
                <p className="message-text">{msg.content}</p>
                {msg.plan && <PlanSummary plan={msg.plan} onReview={() => setPendingPlan(msg.plan!)} />}
              </div>
            </div>
          ))}

          {loading && (
            <div className="message-wrap">
              <div className="message-card">
                <p className="message-text">Agent is analyzing route and gas...</p>
              </div>
            </div>
          )}
        </div>
        <div ref={bottomRef} />
      </div>

      <div className="input-shell">
        <div className="input-row">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && sendCommand(input)}
            placeholder="Ask the agent to swap, compare routes, or wait for cheaper gas..."
            className="agent-input"
          />
          <button type="button" className="primary-button" onClick={() => sendCommand(input)} disabled={loading || !input.trim()}>
            Ask
          </button>
        </div>
      </div>

      {pendingPlan && (
        <SwapConfirmModal plan={pendingPlan} address={address} onClose={() => setPendingPlan(null)} />
      )}
    </section>
  )
}
