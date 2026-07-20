import type { FastifyPluginAsync } from 'fastify'
import { priceService } from '../services/PriceService.js'

export const marketRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { symbol: string } }>('/price/:symbol', async (req, reply) => {
    try {
      const result = await priceService.getMarketPrice(req.params.symbol)
      return result
    } catch (error) {
      return reply.code(404).send({
        error: error instanceof Error ? error.message : 'Price unavailable',
      })
    }
  })
}
