import { describe, it, expect, vi, beforeAll } from 'vitest'
import Fastify from 'fastify'
import { privateKeyToAccount } from 'viem/accounts'
import { ordersRoutes } from '../src/routes/orders.js'
import { generateNonce } from '../src/lib/auth.js'
import type { AuthMessage } from '../src/lib/auth.js'

// Mock the DB layer so we can exercise the route handlers without a database.
// vi.mock is hoisted, so the mock functions must be created via vi.hoisted.
const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
}))

vi.mock('../src/db/client.js', () => ({
  db: {
    query: {
      users: { findFirst: mocks.findFirst },
      conditionalOrders: { findFirst: mocks.findFirst, findMany: mocks.findMany },
    },
    update: mocks.update,
  },
}))

vi.mock('../src/db/schema.js', () => ({
  users: { address: 'address' },
  conditionalOrders: { id: 'id', userId: 'userId' },
}))

const TEST_PK = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const account = privateKeyToAccount(TEST_PK)
const OTHER_ADDRESS = '0x0000000000000000000000000000000000000002'

async function authHeaders(overrides: Partial<AuthMessage> = {}) {
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

describe('orders route — address validation', () => {
  let app: Fastify.FastifyInstance

  beforeAll(async () => {
    app = Fastify()
    app.register(ordersRoutes)
    await app.ready()
  })

  it('returns 400 when the cancel body address is not a valid address', async () => {
    const headers = await authHeaders()
    const res = await app.inject({
      method: 'DELETE',
      url: '/some-order-id',
      headers,
      payload: { address: 'not-a-valid-address' },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toMatch(/Invalid Ethereum address/i)
  })

  it('returns 403 when the cancel body address does not match the authenticated user', async () => {
    const headers = await authHeaders()
    const res = await app.inject({
      method: 'DELETE',
      url: '/some-order-id',
      headers,
      payload: { address: OTHER_ADDRESS },
    })
    expect(res.statusCode).toBe(403)
  })

  it('passes address validation for the authenticated user (reaches DB lookup)', async () => {
    mocks.findFirst.mockResolvedValueOnce(null) // no order found -> 404
    const headers = await authHeaders()
    const res = await app.inject({
      method: 'DELETE',
      url: '/some-order-id',
      headers,
      payload: { address: account.address },
    })
    // Validation passed; the handler proceeded to the DB lookup and returned 404.
    expect(res.statusCode).toBe(404)
    expect(mocks.findFirst).toHaveBeenCalled()
  })
})
