'use client'

import Image from 'next/image'
import { useAccount } from 'wagmi'
import CommandBar from '@/components/CommandBar'
import WalletButton from '@/components/WalletButton'

const statusItems = [
  ['Network', 'Somnia testnet', 'Live execution context'],
  ['Mode', 'Action-reviewed', 'Sign only for value moves'],
  ['Routing', 'Agent assisted', 'Plans before action'],
]

const recentIntents = [
  'Hello, give me a quick orientation',
  'Check my wallet and suggest improvements',
  'Swap 0.1 STT to USDC when gas is cheap',
  'Compare routes without signing',
]

const trustSignals = ['No auto-execution', 'Sign only for monetary actions', 'Plain-language risk notes']

export default function Dashboard() {
  const { address, isConnected } = useAccount()
  const demoAddress = address ?? '0xDemo000000000000000000000000000000000000'
  const shortAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Not connected'

  return (
    <main className="chat-app-shell">
      <div className="motion-field" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <header className="chat-app-header">
        <div className="brand-mark">
          <Image
            src="/somnia-agent-logo.png"
            alt="Arokyl logo"
            width={40}
            height={40}
            className="brand-logo"
            priority
          />
          <span>Arokyl</span>
        </div>
        <WalletButton />
      </header>

      <div className="chat-layout">
        <aside className="chat-sidebar" aria-label="Agent context">
          <section className="sidebar-section command-orb-section">
            <div className="command-orb" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <p className="eyebrow">Agent State</p>
            <h1 className="sidebar-title">Calm execution intelligence</h1>
            <p className="sidebar-copy">
              Conversational guidance, route planning, and wallet review are separated so every answer feels clear before it becomes actionable.
            </p>
          </section>

          <section className="sidebar-section">
            <p className="eyebrow">Wallet</p>
            <h1 className="sidebar-title">{isConnected ? shortAddress : 'Connect to trade'}</h1>
            <p className="sidebar-copy">
              {isConnected
                ? 'The agent can inspect public wallet context and prepare plans. You only sign for swaps, orders, transfers, and approvals.'
                : 'Connect your wallet to personalize the chat. Signatures are only requested for monetary actions.'}
            </p>
          </section>

          <section className="sidebar-section">
            <p className="eyebrow">Session</p>
            <div className="sidebar-list">
              {statusItems.map(([label, value, note]) => (
                <div className="sidebar-row" key={label}>
                  <span>
                    {label}
                    <small>{note}</small>
                  </span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="sidebar-section trust-section">
            <p className="eyebrow">Guardrails</p>
            <div className="trust-list">
              {trustSignals.map((signal) => (
                <span key={signal}>{signal}</span>
              ))}
            </div>
          </section>

          <section className="sidebar-section">
            <p className="eyebrow">Try Next</p>
            <div className="intent-list">
              {recentIntents.map((intent) => (
                <p key={intent}>{intent}</p>
              ))}
            </div>
          </section>
        </aside>

        <CommandBar address={demoAddress} />
      </div>

      <a className="floating-agent-launcher" href="#somnia-agent-chat" aria-label="Open Arokyl">
        <Image
          src="/somnia-agent-logo.png"
          alt=""
          width={44}
          height={44}
          className="floating-agent-logo"
        />
        <span aria-hidden="true" />
      </a>
    </main>
  )
}
