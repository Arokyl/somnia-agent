'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAccount, useChainId, useSignMessage } from 'wagmi'
import type { ExecutionPlan, OrchestrationPlan } from '@somnia-agent/shared'
import { motion, AnimatePresence } from 'framer-motion'
import SwapConfirmModal from './SwapConfirmModal'
import OrderConfirmModal from './OrderConfirmModal'
import { Button } from '@/components/ui/Button'
import { GlassCard } from '@/components/ui/GlassCard'
import { Badge } from '@/components/ui/Badge'
import { Copy, RefreshCw, Check, User, Bot } from 'lucide-react'

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
  'Compare routes for 0.5 MON to USDC',
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
    nodes.push(
      <strong key={`${match.index}-${match[1]}`} className="font-semibold text-white">
        {match[1]}
      </strong>
    )
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
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mt-4"
    >
      <GlassCard className="p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold text-primary uppercase tracking-wider">Execution Plan</p>
          <Badge variant={hasExecutableTx ? 'success' : 'info'} size="sm">
            {hasExecutableTx ? 'Ready for review' : 'Plan only'}
          </Badge>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">Route</p>
            <p className="text-sm font-medium text-white">{plan.quote?.aggregator ?? 'Pending'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Receive</p>
            <p className="text-sm font-medium text-success">{plan.estimatedOutput ?? '-'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Gas</p>
            <p className="text-sm font-medium text-white">
              {plan.gasAssessment?.currentBaseFeeGwei?.toFixed(1) ?? '-'} gwei
            </p>
          </div>
        </div>

        {plan.warnings?.length > 0 && (
          <div className="space-y-2 mb-4">
            {plan.warnings.map((warning) => (
              <div key={warning} className="p-3 rounded-lg bg-warning/10 border border-warning/20 text-warning text-xs">
                {warning}
              </div>
            ))}
          </div>
        )}

        <Button onClick={onReview} className="w-full" size="sm">
          Review Plan
        </Button>
      </GlassCard>
    </motion.div>
  )
}

function AgentSignal({ reaction, demo }: { reaction?: string; demo?: boolean }) {
  const label = reaction ? REACTION_LABELS[reaction] ?? reaction : demo ? 'Demo route' : 'Live reasoning'

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/10"
    >
      <div className="relative w-5 h-5">
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary to-accent animate-ping opacity-20" />
        <div className="relative w-5 h-5 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
          <Bot size={12} className="text-white" />
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold text-white leading-tight">{label}</p>
        <p className="text-[10px] text-gray-400 leading-tight">
          {reaction ? 'Instant response' : 'Wallet-safe planning'}
        </p>
      </div>
    </motion.div>
  )
}

function OrchestrationSummary({ orchestration }: { orchestration: OrchestrationPlan }) {
  const activeRuns = orchestration.runs.filter((run) => run.status === 'completed')

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mt-4"
    >
      <GlassCard className="p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold text-accent uppercase tracking-wider">Subagent Orchestration</p>
          <p className="text-xs text-gray-500">
            {orchestration.mode} · {orchestration.depth} · {activeRuns.length} active
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {activeRuns.map((run) => (
            <div key={run.id} className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.08]">
              <div className="flex items-center justify-between mb-2">
                <strong className="text-sm text-white">{run.name}</strong>
                <span className="text-xs font-semibold text-primary">
                  {Math.round(run.confidence * 100)}%
                </span>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">
                {run.findings[0]?.detail ?? run.goal}
              </p>
            </div>
          ))}
        </div>
      </GlassCard>
    </motion.div>
  )
}

function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3"
    >
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center flex-shrink-0">
        <Bot size={16} className="text-white" />
      </div>
      <GlassCard className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <motion.div
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
            className="w-2 h-2 rounded-full bg-primary"
          />
          <motion.div
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut', delay: 0.2 }}
            className="w-2 h-2 rounded-full bg-primary"
          />
          <motion.div
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
            className="w-2 h-2 rounded-full bg-primary"
          />
        </div>
      </GlassCard>
    </motion.div>
  )
}

function MessageBubble({ msg, onReview }: { msg: Message; onReview: (plan: ExecutionPlan) => void }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(msg.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleRegenerate = () => {
    // Regenerate logic would go here
    console.log('Regenerate:', msg)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`flex items-start gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
    >
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
          msg.role === 'user'
            ? 'bg-gradient-to-br from-accent to-primary'
            : 'bg-gradient-to-br from-primary to-accent'
        }`}
      >
        {msg.role === 'user' ? (
          <User size={16} className="text-white" />
        ) : (
          <Bot size={16} className="text-white" />
        )}
      </div>

      {/* Message content */}
      <div className={`flex-1 ${msg.role === 'user' ? 'flex justify-end' : ''}`}>
        <GlassCard
          className={`p-4 max-w-[85%] ${
            msg.role === 'user'
              ? 'bg-gradient-to-br from-primary/20 to-accent/10 border-primary/20'
              : 'bg-white/[0.03] border-white/[0.08]'
          }`}
        >
          {/* Message header */}
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-400">
              {msg.role === 'user' ? 'You' : 'ArokylAI'}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={handleCopy}
                className="p-1 rounded hover:bg-white/[0.1] text-gray-500 hover:text-white transition-colors"
                aria-label="Copy message"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
              {msg.role === 'assistant' && (
                <button
                  onClick={handleRegenerate}
                  className="p-1 rounded hover:bg-white/[0.1] text-gray-500 hover:text-white transition-colors"
                  aria-label="Regenerate response"
                >
                  <RefreshCw size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Message text */}
          <div className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">
            {renderInlineMarkdown(msg.content)}
          </div>

          {/* Agent signal */}
          {msg.role === 'assistant' && <AgentSignal reaction={msg.reaction} demo={msg.demo} />}

          {/* Orchestration summary */}
          {msg.orchestration && <OrchestrationSummary orchestration={msg.orchestration} />}

          {/* Plan summary */}
          {msg.plan && <PlanSummary plan={msg.plan} onReview={() => onReview(msg.plan!)} />}

          {/* Order creation */}
          {msg.orderCreation && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4"
            >
              <GlassCard className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-semibold text-warning uppercase tracking-wider">
                    Conditional Order
                  </p>
                  <Badge variant="warning" size="sm">
                    Pending
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Token In</p>
                    <p className="text-sm font-medium text-white">{msg.orderCreation.order.tokenIn}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Token Out</p>
                    <p className="text-sm font-medium text-white">{msg.orderCreation.order.tokenOut}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Amount</p>
                    <p className="text-sm font-medium text-white">{msg.orderCreation.order.amountIn}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Condition</p>
                    <p className="text-sm font-medium text-white">
                      {msg.orderCreation.order.condition.type} &lt;{' '}
                      {msg.orderCreation.order.condition.value}
                    </p>
                  </div>
                </div>

                <Button
                  onClick={() => {}}
                  className="w-full"
                  size="sm"
                >
                  Create Order
                </Button>
              </GlassCard>
            </motion.div>
          )}
        </GlassCard>
      </div>
    </motion.div>
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
  const inputRef = useRef<HTMLInputElement>(null)

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
    <div className="flex flex-col h-full">
      {/* Chat header */}
      <div className="p-6 border-b border-white/[0.08]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">AI Agent Chat</p>
            <h3 className="text-2xl font-bold text-white mb-1">Command the agent</h3>
            <p className="text-sm text-gray-400">
              Sign only for money moves. Education and route comparison are free.
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <Badge variant="success" size="md">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
              </span>
              Monad Testnet
            </Badge>
          </div>
        </div>
      </div>

      {/* Chat body */}
      <div className="flex-1 overflow-y-auto p-6">
        {messages.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-2xl mx-auto"
          >
            <GlassCard className="p-6 mb-6">
              <h4 className="text-lg font-semibold text-white mb-2">
                {isConnected ? 'Start with a natural command' : 'Try the agent, then connect'}
              </h4>
              <p className="text-sm text-gray-400 mb-6">
                Ask for guidance, wallet checks, route comparison, or gas timing without signing.
                Monetary actions ask for wallet review.
              </p>

              <div className="grid grid-cols-2 gap-3">
                {SAFETY_SIGNALS.map(([label, detail]) => (
                  <div key={label} className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.08]">
                    <p className="text-xs font-semibold text-white mb-1">{label}</p>
                    <p className="text-xs text-gray-400">{detail}</p>
                  </div>
                ))}
              </div>
            </GlassCard>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {EXAMPLE_COMMANDS.map((cmd, i) => (
                <motion.button
                  key={cmd}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => sendCommand(cmd)}
                  className="text-left p-4 rounded-xl border border-white/[0.08] bg-white/[0.03]
                    hover:bg-white/[0.06] hover:border-primary/20
                    transition-all duration-200 group"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                      <span className="text-sm">💬</span>
                    </div>
                    <p className="text-sm text-gray-300 group-hover:text-white transition-colors leading-relaxed">
                      {cmd}
                    </p>
                  </div>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Messages */}
        <div className="max-w-4xl mx-auto space-y-6">
          <AnimatePresence>
            {messages.map((msg, index) => (
              <MessageBubble
                key={index}
                msg={msg}
                onReview={(plan) => setPendingPlan(plan)}
              />
            ))}
          </AnimatePresence>

          {loading && <TypingIndicator />}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="p-4 border-t border-white/[0.08]">
        <div className="max-w-4xl mx-auto">
          <div className="flex gap-3">
            <input
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && !event.shiftKey && (event.preventDefault(), sendCommand(input))}
              placeholder="Ask the agent to swap, compare routes, or wait for cheaper gas..."
              className="flex-1 px-4 py-3 rounded-xl
                bg-white/[0.04] border border-white/[0.08]
                text-white placeholder:text-gray-500
                backdrop-blur-sm
                transition-all duration-200 ease-out
                focus:outline-none focus:border-primary/50 focus:bg-white/[0.06]
                focus:shadow-[0_0_0_3px_rgba(109,93,252,0.15)]
                disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading}
            />
            <Button
              onClick={() => sendCommand(input)}
              disabled={loading || !input.trim()}
              glow
            >
              Send
            </Button>
          </div>
          <p className="text-xs text-gray-500 mt-2 text-center">
            ArokylAI can make mistakes. Verify important information. Signatures only for monetary actions.
          </p>
        </div>
      </div>

      {/* Modals */}
      {pendingPlan && (
        <SwapConfirmModal plan={pendingPlan} address={address} onClose={() => setPendingPlan(null)} />
      )}
      {pendingOrderCreation && (
        <OrderConfirmModal
          orderCreation={pendingOrderCreation}
          address={address}
          onClose={() => setPendingOrderCreation(null)}
        />
      )}
    </div>
  )
}
