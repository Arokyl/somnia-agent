'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAccount, useChainId, useSignMessage } from 'wagmi'
import type { ExecutionPlan, OrchestrationPlan } from '@somnia-agent/shared'
import SwapConfirmModal from './SwapConfirmModal'
import OrderConfirmModal from './OrderConfirmModal'

export interface Message {
  role: 'user' | 'assistant'
  content: string
  plan?: ExecutionPlan
  orchestration?: OrchestrationPlan
  demo?: boolean
  reaction?: string
  orderCreation?: {
    unsignedTx: { to: string; data: string; value: string; gasLimit: string }
    order: Record<string, any>
  }
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
  ['Sign', 'Only for money moves'],
]

const MONETARY_ACTION_PATTERN =
  /\b(swap|buy|sell|send|transfer|bridge|stake|unstake|withdraw|deposit|approve|execute|sign|confirm|schedule|order|trade|convert|pay)\b/i

function needsWalletSignature(command: string) {
  return MONETARY_ACTION_PATTERN.test(command)
}

function generateNonce(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return Array.from(new Uint8Array(16)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function buildAuthMessage(address: string, nonce: string): string {
  return JSON.stringify({
    address,
    nonce,
    timestamp: Date.now(),
  })
}

function renderInlineMarkdown(text: string): ReactNode {
  const nodes: ReactNode[] = []
  const pattern = /\*\*([^*]+)\*\*/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }

    nodes.push(<strong key={`${match.index}-${match[1]}`}>{match[1]}</strong>)
    lastIndex = pattern.lastIndex
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return nodes.length > 0 ? nodes : text
}

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
  const { isConnected, address: walletAddress } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [pendingPlan, setPendingPlan] = useState<ExecutionPlan | null>(null)
  const [pendingOrderCreation, setPendingOrderCreation] = useState<Message['orderCreation'] | null>(null)
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
      let authMessage: string | undefined
      let authSignature: string | undefined

      const shouldSign = Boolean(walletAddress && needsWalletSignature(command))

      if (shouldSign) {
        const nonce = generateNonce()
        authMessage = buildAuthMessage(walletAddress ?? address, nonce)
        authSignature = await signMessageAsync({ message: authMessage })
      }

      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: command,
          walletContext: {
            address: walletAddress ?? address,
            chainId,
            authMessage,
            authSignature,
          },
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
          orderCreation: data.orderCreation,
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
            <h2 className="chat-title">Command the agent. Sign only for money moves.</h2>
            <p className="chat-copy">
              Ask naturally. Education, wallet checks, and route comparisons do not request a signature; swaps, orders, transfers, and approvals do.
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
                Ask for guidance, wallet checks, route comparison, or gas timing without signing. Monetary actions ask for wallet review.
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
                  <p className="message-meta">{msg.role === 'user' ? 'You' : 'Arokyl'}</p>
                  {msg.role === 'assistant' && <AgentSignal reaction={msg.reaction} demo={msg.demo} />}
                </div>
                <p className="message-text">{renderInlineMarkdown(msg.content)}</p>
                {msg.orchestration && <OrchestrationSummary orchestration={msg.orchestration} />}
                {msg.plan && <PlanSummary plan={msg.plan} onReview={() => setPendingPlan(msg.plan!)} />}
                {msg.orderCreation && (
                  <div className="plan-card">
                    <div className="plan-head">
                      <p className="eyebrow">Conditional order</p>
                    </div>
                    <div className="plan-grid">
                      <div>
                        <p className="muted">Token in</p>
                        <p className="metric-value">{msg.orderCreation.order.tokenIn}</p>
                      </div>
                      <div>
                        <p className="muted">Token out</p>
                        <p className="metric-value">{msg.orderCreation.order.tokenOut}</p>
                      </div>
                      <div>
                        <p className="muted">Amount</p>
                        <p className="metric-value">{msg.orderCreation.order.amountIn}</p>
                      </div>
                      <div>
                        <p className="muted">Condition</p>
                        <p className="metric-value">{msg.orderCreation.order.condition.type} &lt; {msg.orderCreation.order.condition.value}</p>
                      </div>
                    </div>
                    <div className="plan-actions">
                      <span className="status-chip">Ready for wallet review</span>
                      <button type="button" className="primary-button" onClick={() => setPendingOrderCreation(msg.orderCreation!)}>
                        Create order
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="message-wrap">
              <div className="message-card">
                <p className="message-meta">Arokyl</p>
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
      {pendingOrderCreation && (
        <OrderConfirmModal orderCreation={pendingOrderCreation} address={address} onClose={() => setPendingOrderCreation(null)} />
      )}
    </section>
  )
}
