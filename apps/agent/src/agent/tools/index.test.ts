import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAuthHeaders } from './index'

test('buildAuthHeaders returns signed-wallet headers when auth context is present', () => {
  const headers = buildAuthHeaders({
    address: '0x1234',
    message: 'Arokyl auth',
    signature: '0xabc',
  })

  assert.deepEqual(headers, {
    'x-user-address': '0x1234',
    'x-message': 'Arokyl auth',
    'x-signature': '0xabc',
  })
})

test('buildAuthHeaders returns empty headers when auth context is missing', () => {
  assert.deepEqual(buildAuthHeaders(undefined), {})
})
