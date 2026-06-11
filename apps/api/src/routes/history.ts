import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client'
import { trades, users } from '../db/schema'
import { eq } from 'drizzle-orm'
import { withAuth } from '../lib/auth'
import { validateAddress } from '../lib/validation'

export const historyRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { address: string } }>('/:address', { onRequest: withAuth }, async (req, reply) => {
    const auth = (req as any).auth
    const { address } = req.params

    let validatedAddress: string
    try {
      validatedAddress = validateAddress(address)
    } catch (err: any) {
      return reply.code(400).send({ error: err.message })
    }

    // Users can only query their own history
    if (auth.address !== validatedAddress) {
      return reply.code(403).send({ error: 'Forbidden: can only query own history' })
    }

    const user = await db.query.users.findFirst({
      where: eq(users.address, address.toLowerCase()),
    })
    if (!user) return []

    return db.query.trades.findMany({
      where: eq(trades.userId, user.id),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
      limit: 50,
    })
  })
}
