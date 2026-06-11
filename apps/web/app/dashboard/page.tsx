'use client'

import Image from 'next/image'
import { useAccount } from 'wagmi'
import CommandBar from '@/components/CommandBar'
import WalletButton from '@/components/WalletButton'

const statusItems = [
  ['Network', 'Somnia testnet'],
  ['Mode', 'Wallet-reviewed execution'],
  ['Routing', 'Odos demo fallback'],
]

const recentIntents = [
  'Swap 0.1 STT to USDC when gas is cheap',
  'Compare routes before I sign',
  'Queue the trade below 8 gwei',
]

export default function Dashboard() {
  const { address, isConnected } = useAccount()
  const demoAddress = address ?? '0xDemo000000000000000000000000000000000000'
  const shortAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Not connected'

  return (
    <main className="chat-app-shell">
      <header className="chat-app-header">
        <div className="brand-mark">
          <Image
            src="/somnia-agent-logo.png"
            alt="Somnia Agent logo"
            width={40}
            height={40}
            className="brand-logo"
            priority
          />
          <span>Somnia Agent</span>
        </div>
        <WalletButton />
      </header>

      <div className="chat-layout">
        <aside className="chat-sidebar" aria-label="Agent context">
          <section className="sidebar-section">
            <p className="eyebrow">Wallet</p>
            <h1 className="sidebar-title">{isConnected ? shortAddress : 'Connect to trade'}</h1>
            <p className="sidebar-copy">
              {isConnected
                ? 'The agent can prepare plans for this wallet. You approve every transaction before anything is sent.'
                : 'You can try the agent in demo mode now, then connect your wallet when you are ready to review a transaction.'}
            </p>
          </section>

          <section className="sidebar-section">
            <p className="eyebrow">Session</p>
            <div className="sidebar-list">
              {statusItems.map(([label, value]) => (
                <div className="sidebar-row" key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
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
    </main>
  )
}
