'use client'

import { motion } from 'framer-motion'
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
          return (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="px-5 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.1] text-gray-400 font-medium text-sm"
              disabled
            >
              Connect
            </motion.button>
          )
        }

        if (!connected) {
          return (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={openConnectModal}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary to-accent text-white font-semibold text-sm shadow-[0_8px_24px_rgba(109,93,252,0.3)] hover:shadow-[0_12px_32px_rgba(109,93,252,0.45)] transition-all"
            >
              Connect Wallet
            </motion.button>
          )
        }

        if (chain.unsupported) {
          return (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={openChainModal}
              className="px-5 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 font-medium text-sm hover:bg-red-500/20 transition-all"
            >
              Switch Network
            </motion.button>
          )
        }

        return (
          <div className="flex items-center gap-2">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={openChainModal}
              className="px-4 py-2 rounded-xl bg-white/[0.06] border border-white/[0.1] text-gray-300 font-medium text-sm hover:bg-white/[0.1] hover:border-white/[0.2] hover:text-white transition-all"
            >
              {chain.name}
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={openAccountModal}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-primary to-accent text-white font-semibold text-sm shadow-[0_8px_24px_rgba(109,93,252,0.3)] hover:shadow-[0_12px_32px_rgba(109,93,252,0.45)] transition-all"
            >
              {account.displayName}
            </motion.button>
          </div>
        )
      }}
    </ConnectButton.Custom>
  )
}
