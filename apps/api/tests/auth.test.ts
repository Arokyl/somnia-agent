import { describe, it, expect, beforeAll } from 'vitest'
import { privateKeyToAccount } from 'viem/accounts'
import {
  verifyAuth,
  parseAuthMessage,
  nonceStore,
  NonceStore,
  generateNonce,
  HttpError,
  MESSAGE_TTL_MS,
  type AuthMessage,
} from '../src/lib/auth.js'

// Well-known Anvil/Hardhat test key — safe to use only in tests.
const TEST_PK = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const account = privateKeyToAccount(TEST_PK)

async function signedHeaders(overrides: Partial<AuthMessage> = {}) {
  const message: AuthMessage = {
    address: account.address,
    nonce: generateNonce(),
    timestamp: Date.now(),
    ...overrides,
  }
  const raw = JSON.stringify(message)
  const signature = await account.signMessage({ message: raw })
  return {
    'x-user-address': message.address,
    'x-message': raw,
    'x-signature': signature,
  }
}

function fakeRequest(headers: Record<string, string>) {
  return { headers } as any
}

describe('parseAuthMessage', () => {
  it('parses a valid JSON message', () => {
    const msg = { address: account.address, nonce: 'abc', timestamp: 123 }
    expect(parseAuthMessage(JSON.stringify(msg))).toEqual(msg)
  })

  it('throws HttpError on malformed JSON', () => {
    expect(() => parseAuthMessage('not json')).toThrow(HttpError)
  })

  it('throws HttpError when fields are missing/typed wrong', () => {
    expect(() => parseAuthMessage(JSON.stringify({ address: account.address }))).toThrow(HttpError)
    expect(() =>
      parseAuthMessage(JSON.stringify({ address: account.address, nonce: 1, timestamp: Date.now() }))
    ).toThrow(HttpError)
  })
})

describe('NonceStore', () => {
  it('rejects a nonce after it is consumed', () => {
    const store = new NonceStore()
    const key = '0xabc:nonce1'
    expect(store.has(key)).toBe(false)
    store.consume(key)
    expect(store.has(key)).toBe(true)
  })
})

describe('verifyAuth', () => {
  beforeAll(() => {
    // ensure a clean slate so nonces from prior tests don't interfere
    const store = nonceStore as any
    store.used = new Map()
  })

  it('accepts a fresh, validly signed message', async () => {
    const req = fakeRequest(await signedHeaders())
    const ctx = await verifyAuth(req)
    expect(ctx.address).toBe(account.address.toLowerCase())
  })

  it('rejects a message with a mismatched header address', async () => {
    const headers = await signedHeaders()
    const req = fakeRequest({ ...headers, 'x-user-address': '0x0000000000000000000000000000000000000002' })
    await expect(verifyAuth(req)).rejects.toThrow(HttpError)
  })

  it('rejects an expired message (>5 minutes old)', async () => {
    const headers = await signedHeaders({ timestamp: Date.now() - MESSAGE_TTL_MS - 60_000 })
    const req = fakeRequest(headers)
    await expect(verifyAuth(req)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('rejects a future-dated message (>5 minutes ahead)', async () => {
    const headers = await signedHeaders({ timestamp: Date.now() + MESSAGE_TTL_MS + 60_000 })
    const req = fakeRequest(headers)
    await expect(verifyAuth(req)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('rejects a replayed (already-used) nonce', async () => {
    const headers = await signedHeaders()
    const req1 = fakeRequest(headers)
    await verifyAuth(req1) // first use succeeds and consumes the nonce

    const req2 = fakeRequest(headers) // replay same headers
    await expect(verifyAuth(req2)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('rejects an invalid signature', async () => {
    const headers = await signedHeaders()
    const req = fakeRequest({ ...headers, 'x-signature': '0xdeadbeef' })
    await expect(verifyAuth(req)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('rejects missing headers', async () => {
    await expect(verifyAuth(fakeRequest({}))).rejects.toMatchObject({ statusCode: 401 })
  })
})
