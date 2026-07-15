import type { FastifyRequest, FastifyError } from 'fastify'
import { verifyMessage } from 'viem'
import { randomBytes } from 'node:crypto'

/**
 * Authentication middleware for API requests
 * Verifies that the request is signed by the claimed user address.
 *
 * The `x-message` header must be a JSON string with the following shape:
 *   { "address": "0x...", "nonce": "<unique>", "timestamp": <ms epoch> }
 *
 * The wallet signs this exact JSON string. The API:
 *   1. verifies the signature recovers `address`
 *   2. rejects messages older than MESSAGE_TTL_MS (replay window)
 *   3. rejects a `nonce` that has already been used (replay protection)
 *
 * Expected headers:
 * - x-user-address: The Ethereum address claiming to make the request
 * - x-message:      The JSON string that was signed (see above)
 * - x-signature:    The signature from the user's wallet
 */

// Messages older than this (in either direction) are rejected.
export const MESSAGE_TTL_MS = 5 * 60 * 1000 // 5 minutes

export interface AuthMessage {
  address: string
  nonce: string
  timestamp: number
}

export interface AuthContext {
  address: string // Verified user address (lowercase)
}

/**
 * Thrown by auth helpers. It is a real Error instance with a `statusCode`
 * (FastifyError-compatible) so Fastify's error handler can read it reliably.
 */
export class HttpError extends Error implements FastifyError {
  statusCode: number
  code: string
  constructor(statusCode: number, message: string, code?: string) {
    super(message)
    this.name = 'HttpError'
    this.statusCode = statusCode
    this.code = code ?? `HTTP_ERROR_${statusCode}`
  }
}

/**
 * In-memory nonce store with a TTL. Tracks (address:nonce) pairs that have
 * already been consumed so a captured signature cannot be replayed.
 *
 * NOTE: in-memory state is per-process. For multi-instance deployments, back
 * this with Redis (e.g. SET NX with a TTL) instead. The API surface here
 * (has/consume) maps directly onto Redis primitives.
 */
export class NonceStore {
  private used = new Map<string, number>()
  private ttlMs: number

  constructor(ttlMs = 10 * 60 * 1000) {
    this.ttlMs = ttlMs
  }

  has(key: string): boolean {
    this.prune()
    return this.used.has(key)
  }

  consume(key: string): void {
    this.used.set(key, Date.now() + this.ttlMs)
    this.prune()
  }

  private prune(): void {
    const now = Date.now()
    for (const [k, exp] of this.used) {
      if (exp < now) this.used.delete(k)
    }
  }
}

export const nonceStore = new NonceStore()

/** Generate a random nonce for clients to embed in their signed message. */
export function generateNonce(): string {
  return randomBytes(16).toString('hex')
}

/**
 * Parse and structurally validate the signed message JSON.
 * Throws HttpError(401) on any malformation.
 */
export function parseAuthMessage(raw: string): AuthMessage {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new HttpError(401, 'Malformed authentication message; expected JSON {address, nonce, timestamp}')
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new HttpError(401, 'Malformed authentication message')
  }

  const { address, nonce, timestamp } = parsed as Record<string, unknown>
  if (typeof address !== 'string' || typeof nonce !== 'string' || typeof timestamp !== 'number') {
    throw new HttpError(
      401,
      'Authentication message must include string "address", string "nonce", and numeric "timestamp"'
    )
  }

  return { address, nonce, timestamp }
}

export async function verifyAuth(request: FastifyRequest): Promise<AuthContext> {
  const userAddress = request.headers['x-user-address'] as string | undefined
  const rawMessage = request.headers['x-message'] as string | undefined
  const signature = request.headers['x-signature'] as string | undefined

  if (!userAddress || !rawMessage || !signature) {
    throw new HttpError(
      401,
      'Missing authentication headers: x-user-address, x-message, x-signature required'
    )
  }

  const message = parseAuthMessage(rawMessage)

  // The address inside the signed payload must match the claimed header address.
  if (message.address.toLowerCase() !== userAddress.toLowerCase()) {
    throw new HttpError(401, 'Address in message does not match x-user-address header')
  }

  // Reject expired / future-dated messages (captured-signature replay window).
  const skew = Math.abs(Date.now() - message.timestamp)
  if (skew > MESSAGE_TTL_MS) {
    throw new HttpError(401, 'Authentication message expired (older than 5 minutes)')
  }

  // Replay protection: each (address, nonce) may be used only once.
  const nonceKey = `${message.address.toLowerCase()}:${message.nonce}`
  if (nonceStore.has(nonceKey)) {
    throw new HttpError(401, 'Nonce already used (replay detected)')
  }

  let isValid = false
  try {
    isValid = await verifyMessage({
      address: message.address as `0x${string}`,
      message: rawMessage,
      signature: signature as `0x${string}`,
    })
  } catch (error) {
    throw new HttpError(401, `Signature verification failed: ${error instanceof Error ? error.message : 'unknown error'}`)
  }

  if (!isValid) {
    throw new HttpError(401, 'Invalid signature')
  }

  // Mark the nonce as consumed only after a successful, valid signature.
  nonceStore.consume(nonceKey)

  return {
    address: message.address.toLowerCase(),
  }
}

/**
 * Decorator to add authentication to a route.
 * Usage: app.get('/:address', { onRequest: withAuth }, async (req, reply) => { ... })
 */
export const withAuth = async (request: FastifyRequest) => {
  const auth = await verifyAuth(request)
  ;(request as any).auth = auth
}
