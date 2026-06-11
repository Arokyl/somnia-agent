'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'

export default function WalletButton() {
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        mounted,
        openAccountModal,
        openChainModal,
        openConnectModal,
      }) => {
        const ready = mounted
        const connected = ready && account && chain

        if (!ready) {
          return <button className="wallet-action" disabled>Connect</button>
        }

        if (!connected) {
          return (
            <button type="button" className="wallet-action" onClick={openConnectModal}>
              Connect wallet
            </button>
          )
        }

        if (chain.unsupported) {
          return (
            <button type="button" className="wallet-action warning-action" onClick={openChainModal}>
              Switch network
            </button>
          )
        }

        return (
          <div className="wallet-group">
            <button type="button" className="network-action" onClick={openChainModal}>
              {chain.name}
            </button>
            <button type="button" className="wallet-action" onClick={openAccountModal}>
              {account.displayName}
            </button>
          </div>
        )
      }}
    </ConnectButton.Custom>
  )
}
