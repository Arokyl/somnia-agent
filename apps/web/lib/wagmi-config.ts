import { defineChain } from 'viem'
import { mainnet, base, arbitrum } from 'wagmi/chains'
import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { http } from 'wagmi'

const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://testnet-rpc.monad.xyz'
const MONAD_EXPLORER_URL = process.env.NEXT_PUBLIC_MONAD_EXPLORER_URL || 'https://testnet.monadvision.com'

export const monad = defineChain({
  id: 10143,
  name: 'Monad',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: { http: [MONAD_RPC] },
    public: { http: [MONAD_RPC] },
  },
  blockExplorers: {
    default: {
      name: 'Monad Explorer',
      url: MONAD_EXPLORER_URL,
    },
  },
  testnet: true,
})

export const wagmiConfig = getDefaultConfig({
  appName: 'Arokyl',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'demo-project-id',
  chains: [monad, mainnet, base, arbitrum],
  transports: {
    [monad.id]: http(MONAD_RPC),
    [mainnet.id]: http(process.env.NEXT_PUBLIC_ETH_RPC),
    [base.id]: http(process.env.NEXT_PUBLIC_BASE_RPC),
    [arbitrum.id]: http(process.env.NEXT_PUBLIC_ARB_RPC),
  },
  ssr: true,
})

export const SUPPORTED_CHAINS = [monad, mainnet, base, arbitrum]
