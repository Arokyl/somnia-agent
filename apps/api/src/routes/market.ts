import type { FastifyPluginAsync } from 'fastify'
import { priceService } from '../services/PriceService.js'
import { marketAnalysisService } from '../services/MarketAnalysisService.js'

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

  app.get<{ Params: { symbol: string }; Querystring: { chainId?: string } }>(
    '/analysis/:symbol',
    async (req, reply) => {
      try {
        const chainId = req.query.chainId ? parseInt(req.query.chainId) : undefined
        const result = await marketAnalysisService.getAnalysis(req.params.symbol, chainId)
        return result
      } catch (error) {
        return reply.code(404).send({
          error: error instanceof Error ? error.message : 'Market analysis unavailable',
        })
      }
    }
  )
}
