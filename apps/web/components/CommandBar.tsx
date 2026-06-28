'use client'

import { useEffect, useRef, useState } from 'react'
import { useAccount, useChainId } from 'wagmi'
import type { ExecutionPlan, OrchestrationPlan } from '@somnia-agent/shared'
import SwapConfirmModal from './SwapConfirmModal'

interface Message {
  role: 'user' | 'assistant'
  content: string
  plan?: ExecutionPlan
  orchestration?: OrchestrationPlan
  demo?: boolean
  reaction?: string
}

const REACTION_LABELS: Record<string, string> = {
  greeting: 'Warm signal',
  thanks: 'Acknowledged',
  teacher: 'Teacher mode',
  help: 'Capability map',
  'market-education': 'Market note',
}

const EXAMPLE_COMMANDS = [
  'Hello, what can you help me do?',
  'Teach me how to review a swap safely',
  'Compare routes for 0.5 STT to USDC',
  'Wait until gas is below 8 gwei before swapping',
]

const SAFETY_SIGNALS = [
  ['Intent', 'Parse the goal'],
  ['Risk', 'Explain tradeoffs'],
  ['Gas', 'Time the route'],
  ['Review', 'You approve'],
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

function AgentSignal({ reaction, demo }: { reaction?: string; demo?: boolean }) {
  const label = reaction ? REACTION_LABELS[reaction] ?? reaction : demo ? 'Demo route' : 'Live reasoning'

  return (
    <div className="agent-signal" aria-label={`Agent response signal: ${label}`}>
      <div className="signal-core">
        <span />
        <span />
        <span />
      </div>
      <div>
        <p className="signal-label">{label}</p>
        <p className="signal-caption">{reaction ? 'Common response handled instantly' : 'Wallet-safe planning layer'}</p>
      </div>
    </div>
  )
}

function OrchestrationSummary({ orchestration }: { orchestration: OrchestrationPlan }) {
  const activeRuns = orchestration.runs.filter((run) => run.status === 'completed')

  return (
    <div className="orchestration-card">
      <div className="plan-head">
        <p className="eyebrow">Subagent orchestration</p>
        <p className="orchestration-meta">
          {orchestration.mode} mode | {orchestration.depth} depth | {activeRuns.length} active
        </p>
      </div>
      <div className="subagent-grid">
        {activeRuns.map((run) => (
          <div className="subagent-tile" key={run.id}>
            <div className="subagent-row">
              <strong>{run.name}</strong>
              <span>{Math.round(run.confidence * 100)}%</span>
            </div>
            <p>{run.findings[0]?.detail ?? run.goal}</p>
          </div>
        ))}
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
          orchestration: data.orchestration,
          demo: Boolean(data.demo),
          reaction: data.reaction,
        },
      ])
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: error instanceof Error
            ? `The live agent service is not answering cleanly yet: ${error.message}. Simple greetings and teacher-style guidance still work locally, but swap planning needs the deployed AGENT_URL service logs checked.`
            : 'The live agent service is not answering cleanly yet. Check the deployed agent logs and AGENT_URL, then retry the trade plan.',
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="chat-panel" id="somnia-agent-chat">
      <div className="chat-header">
        <div className="chat-header-row">
          <div>
            <p className="eyebrow">AI Agent Chat</p>
            <h2 className="chat-title">Command the agent. Keep the signature.</h2>
            <p className="chat-copy">
              Ask naturally. The agent separates conversation, teaching, route planning, gas timing, and wallet review into clear signals.
            </p>
          </div>
          <div className="network-card">
            <p className="muted">Network</p>
            <p className="mono">{chainId === 50312 ? 'Somnia 50312' : `Chain ${chainId}`}</p>
            <span className="network-pulse">Ready</span>
          </div>
        </div>
      </div>

      <div className="chat-body">
        {messages.length === 0 && (
          <div className="empty-chat">
            <div className="intro-card">
              <h3 className="panel-title">{isConnected ? 'Start with a natural command' : 'Try the agent, then connect'}</h3>
              <p className="panel-subtitle">
                Ask for guidance, route comparison, gas timing, or a wallet-reviewed transaction plan.
              </p>
              <div className="signal-strip" aria-label="Agent safeguards">
                {SAFETY_SIGNALS.map(([label, detail]) => (
                  <span key={label}>
                    <strong>{label}</strong>
                    <small>{detail}</small>
                  </span>
                ))}
              </div>
            </div>
            <div className="prompt-grid">
              {EXAMPLE_COMMANDS.map((cmd) => (
                <button key={cmd} type="button" className="prompt-button" onClick={() => sendCommand(cmd)}>
                  <span />
                  {cmd}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="message-list">
          {messages.map((msg, index) => (
            <div key={`${msg.role}-${index}`} className={`message-wrap ${msg.role === 'user' ? 'user' : ''}`}>
              <div className={`message-card ${msg.role === 'user' ? 'user' : 'assistant'}`}>
                <div className="message-head">
                  <p className="message-meta">{msg.role === 'user' ? 'You' : 'Somnia agent'}</p>
                  {msg.role === 'assistant' && <AgentSignal reaction={msg.reaction} demo={msg.demo} />}
                </div>
                <p className="message-text">{msg.content}</p>
                {msg.orchestration && <OrchestrationSummary orchestration={msg.orchestration} />}
                {msg.plan && <PlanSummary plan={msg.plan} onReview={() => setPendingPlan(msg.plan!)} />}
              </div>
            </div>
          ))}

          {loading && (
            <div className="message-wrap">
              <div className="message-card">
                <p className="message-meta">Somnia agent</p>
                <div className="thinking-row">
                  <span />
                  <span />
                  <span />
                  <p>Analyzing route, risk, and gas...</p>
                </div>
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
