import { isAddress } from 'viem'

/**
 * Validates and normalizes an Ethereum address
 * @throws Error if address is invalid
 */
export function validateAddress(address: unknown): string {
  if (typeof address !== 'string') {
    throw new Error('Address must be a string')
  }

  if (!isAddress(address)) {
    throw new Error('Invalid Ethereum address format')
  }

  return address.toLowerCase()
}

/**
 * Validates a chain ID
 * @throws Error if chainId is invalid
 */
export function validateChainId(chainId: number): void {
  const SUPPORTED_CHAINS = [50312, 1, 8453] // Somnia testnet, Ethereum, Base
  if (!SUPPORTED_CHAINS.includes(chainId)) {
    throw new Error(`Unsupported chain ID: ${chainId}. Supported: ${SUPPORTED_CHAINS.join(', ')}`)
  }
}
