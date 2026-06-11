import type { FastifyRequest } from 'fastify'
import { verifyMessage } from 'viem'

/**
 * Authentication middleware for API requests
 * Verifies that the request is signed by the claimed user address
 *
 * Expected headers:
 * - x-user-address: The Ethereum address claiming to make the request
 * - x-message: The message that was signed (e.g., timestamp or request ID)
 * - x-signature: The signature from the user's wallet
 */

export interface AuthContext {
  address: string // Verified user address (lowercase)
}

export async function verifyAuth(request: FastifyRequest): Promise<AuthContext> {
  const userAddress = request.headers['x-user-address'] as string
  const message = request.headers['x-message'] as string
  const signature = request.headers['x-signature'] as string

  if (!userAddress || !message || !signature) {
    throw new Error('Missing authentication headers: x-user-address, x-message, x-signature required')
  }

  try {
    // Verify the signature using viem
    const isValid = await verifyMessage({
      address: userAddress as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    })

    if (!isValid) {
      throw new Error('Invalid signature')
    }

    return {
      address: userAddress.toLowerCase(),
    }
  } catch (error) {
    throw new Error(`Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Decorator to add authentication to a route
 * Usage: app.get('/:address', { onRequest: withAuth }, async (req, reply) => { ... })
 */
export const withAuth = async (request: FastifyRequest) => {
  try {
    const auth = await verifyAuth(request)
    ;(request as any).auth = auth
  } catch (error) {
    throw {
      statusCode: 401,
      message: error instanceof Error ? error.message : 'Unauthorized',
    }
  }
}
