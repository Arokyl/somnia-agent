import { defineChain } from 'viem'
import { mainnet, base, arbitrum } from 'wagmi/chains'
import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { http } from 'wagmi'

const SOMNIA_RPC = process.env.NEXT_PUBLIC_SOMNIA_RPC || 'https://api.infra.testnet.somnia.network/'
const SOMNIA_EXPLORER_URL = process.env.NEXT_PUBLIC_SOMNIA_EXPLORER_URL || 'https://shannon-explorer.somnia.network'

export const somnia = defineChain({
  id: 50312,
  name: 'Somnia',
  nativeCurrency: { name: 'STT', symbol: 'STT', decimals: 18 },
  rpcUrls: {
    default: { http: [SOMNIA_RPC] },
    public: { http: [SOMNIA_RPC] },
  },
  blockExplorers: {
    default: {
      name: 'Somnia Explorer',
      url: SOMNIA_EXPLORER_URL,
    },
  },
  testnet: true,
})

export const wagmiConfig = getDefaultConfig({
  appName: 'Arokyl',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'demo-project-id',
  chains: [somnia, mainnet, base, arbitrum],
  transports: {
    [somnia.id]: http(SOMNIA_RPC),
    [mainnet.id]: http(process.env.NEXT_PUBLIC_ETH_RPC),
    [base.id]: http(process.env.NEXT_PUBLIC_BASE_RPC),
    [arbitrum.id]: http(process.env.NEXT_PUBLIC_ARB_RPC),
  },
  ssr: true,
})

export const SUPPORTED_CHAINS = [somnia, mainnet, base, arbitrum]
