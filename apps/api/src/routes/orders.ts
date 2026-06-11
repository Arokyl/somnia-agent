import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client'
import { conditionalOrders, users } from '../db/schema'
import { eq } from 'drizzle-orm'
import { withAuth } from '../lib/auth'
import { validateAddress } from '../lib/validation'

export const ordersRoutes: FastifyPluginAsync = async (app) => {
  // Get user's orders (requires authentication)
  app.get<{ Params: { address: string } }>('/:address', { onRequest: withAuth }, async (req, reply) => {
    const auth = (req as any).auth
    let requestedAddress: string
    try {
      requestedAddress = validateAddress(req.params.address)
    } catch (err: any) {
      return reply.code(400).send({ error: err.message })
    }

    // Users can only query their own orders
    if (auth.address !== requestedAddress) {
      return reply.code(403).send({ error: 'Forbidden: can only query own orders' })
    }

    const user = await db.query.users.findFirst({ where: eq(users.address, requestedAddress) })
    if (!user) {
      return { orders: [] }
    }

    return db.query.conditionalOrders.findMany({
      where: eq(conditionalOrders.userId, user.id),
      orderBy: (o, { desc }) => [desc(o.createdAt)],
    })
  })

  // Create conditional order (requires authentication)
  app.post<{ Body: { address: string; tokenIn: string; tokenOut: string; amountIn: string; condition: object; originalCommand: string; expiresAt: string } }>(
    '/',
    { onRequest: withAuth },
    async (req, reply) => {
      const auth = (req as any).auth
      const { address, tokenIn, tokenOut, amountIn, condition, originalCommand, expiresAt } = req.body

      // Verify that the request is for the authenticated user
      if (auth.address !== address.toLowerCase()) {
        return reply.code(403).send({ error: 'Forbidden: can only create orders for own address' })
      }

      // Upsert user using INSERT ... ON CONFLICT to avoid race condition
      let user = await db.query.users.findFirst({ where: eq(users.address, address.toLowerCase()) })
      if (!user) {
        try {
          const [newUser] = await db.insert(users).values({ address: address.toLowerCase() }).returning()
          user = newUser
        } catch (err) {
          // Handle concurrent insert race condition
          user = await db.query.users.findFirst({ where: eq(users.address, address.toLowerCase()) })
          if (!user) throw err
        }
      }

      const [order] = await db.insert(conditionalOrders).values({
        userId: user.id,
        chainId: 50312,
        tokenIn,
        tokenOut,
        amountIn,
        condition: condition as any,
        originalCommand,
        expiresAt: new Date(expiresAt),
        status: 'active',
      }).returning()

      return { order }
    }
  )

  // Cancel order (requires authentication)
  app.delete<{ Params: { orderId: string }; Body: { address: string } }>(
    '/:orderId',
    { onRequest: withAuth },
    async (req, reply) => {
      const auth = (req as any).auth
      const { address } = req.body

      if (auth.address !== address.toLowerCase()) {
        return reply.code(403).send({ error: 'Forbidden: can only cancel own orders' })
      }

      const order = await db.query.conditionalOrders.findFirst({
        where: eq(conditionalOrders.id, req.params.orderId),
      })

      if (!order) {
        return reply.code(404).send({ error: 'Order not found' })
      }

      if (!order.userId) {
        return reply.code(403).send({ error: 'Forbidden: order is missing an owner' })
      }

      const user = await db.query.users.findFirst({
        where: eq(users.id, order.userId),
      })

      if (!user || user.address !== auth.address) {
        return reply.code(403).send({ error: 'Forbidden: order belongs to another user' })
      }

      await db.update(conditionalOrders).set({ status: 'cancelled' }).where(eq(conditionalOrders.id, req.params.orderId))
      return { cancelled: true }
    }
  )
}
