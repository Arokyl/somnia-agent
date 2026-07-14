import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client.js'
import { trades, users } from '../db/schema.js'
import { desc, eq } from 'drizzle-orm'
import { validateAddress } from '../lib/validation.js'

export const historyRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { address: string } }>('/:address', async (req, reply) => {
    const { address } = req.params

    let validatedAddress: string
    try {
      validatedAddress = validateAddress(address)
    } catch (err: any) {
      return reply.code(400).send({ error: err.message })
    }

    const user = await db.query.users.findFirst({
      where: eq(users.address, validatedAddress),
    })
    if (!user) return []

    return db.query.trades.findMany({
      where: eq(trades.userId, user.id),
      orderBy: [desc(trades.createdAt)],
      limit: 50,
    })
  })
}
