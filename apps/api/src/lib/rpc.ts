import { createPublicClient, http, defineChain } from 'viem'
import { mainnet, base, arbitrum } from 'viem/chains'

const SOMNIA_RPC = process.env.SOMNIA_RPC || process.env.NEXT_PUBLIC_SOMNIA_RPC || 'https://api.infra.testnet.somnia.network/'
const SOMNIA_RPC_FALLBACK = process.env.SOMNIA_RPC_FALLBACK || process.env.NEXT_PUBLIC_SOMNIA_RPC_FALLBACK

type RpcClient = {
  getGasPrice: ReturnType<typeof createPublicClient>['getGasPrice']
  getBlock: ReturnType<typeof createPublicClient>['getBlock']
  getFeeHistory: ReturnType<typeof createPublicClient>['getFeeHistory']
  getBalance: ReturnType<typeof createPublicClient>['getBalance']
  readContract: ReturnType<typeof createPublicClient>['readContract']
}

function createFailoverClient(chain: ReturnType<typeof defineChain>, urls: Array<string | undefined>): RpcClient {
  const validUrls = urls.filter(Boolean) as string[]
  if (validUrls.length === 0) {
    throw new Error(`No RPC URLs configured for chain ${chain.id}`)
  }

  const primaryClient = createPublicClient({ chain, transport: http(validUrls[0]) })
  const fallbackClients = validUrls.slice(1).map((url) => createPublicClient({ chain, transport: http(url) }))

  if (fallbackClients.length === 0) return primaryClient as unknown as RpcClient

  return new Proxy(primaryClient, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      if (typeof value !== 'function') return value

      return async (...args: unknown[]) => {
        try {
          return await (value as (...args: unknown[]) => Promise<unknown>)(...args)
        } catch (error) {
          for (const fallback of fallbackClients) {
            const fallbackValue = Reflect.get(fallback, prop)
            if (typeof fallbackValue !== 'function') continue
            try {
              return await (fallbackValue as (...args: unknown[]) => Promise<unknown>)(...args)
            } catch {
              // try next fallback
            }
          }
          throw error
        }
      }
    },
  }) as unknown as RpcClient
}

export const somnia = defineChain({
  id: 50312,
  name: 'Somnia',
  nativeCurrency: { name: 'STT', symbol: 'STT', decimals: 18 },
  rpcUrls: {
    default: { http: [SOMNIA_RPC] },
  },
})

export const clients: Record<number, RpcClient> = {
  [somnia.id]: createFailoverClient(somnia, [
    SOMNIA_RPC,
    SOMNIA_RPC_FALLBACK,
  ]),
  [mainnet.id]: createFailoverClient(mainnet, [
    process.env.NEXT_PUBLIC_ETH_RPC,
    process.env.NEXT_PUBLIC_ETH_RPC_FALLBACK,
  ]),
  [base.id]: createFailoverClient(base, [
    process.env.NEXT_PUBLIC_BASE_RPC,
    process.env.NEXT_PUBLIC_BASE_RPC_FALLBACK,
  ]),
  [arbitrum.id]: createFailoverClient(arbitrum, [
    process.env.NEXT_PUBLIC_ARB_RPC,
    process.env.NEXT_PUBLIC_ARB_RPC_FALLBACK,
  ]),
}

export function getClient(chainId: number) {
  const client = clients[chainId]
  if (!client) throw new Error(`Unsupported chainId: ${chainId}`)
  return client
}
