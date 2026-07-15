import { NextRequest, NextResponse } from 'next/server'

const AUTH_HEADERS = ['x-user-address', 'x-message', 'x-signature']

export async function PATCH(req: NextRequest) {
  const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL
  if (!apiUrl) {
    return NextResponse.json({ error: 'API service is not configured' }, { status: 503 })
  }

  try {
    const body = await req.json()
    const { orderId } = body
    if (!orderId) {
      return NextResponse.json({ error: 'Missing orderId' }, { status: 400 })
    }

    const headers = new Headers({ 'Content-Type': 'application/json' })
    for (const header of AUTH_HEADERS) {
      const value = req.headers.get(header)
      if (value) headers.set(header, value)
    }

    const res = await fetch(`${apiUrl}/orders/${encodeURIComponent(orderId)}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
    })

    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update order' },
      { status: 502 }
    )
  }
}
