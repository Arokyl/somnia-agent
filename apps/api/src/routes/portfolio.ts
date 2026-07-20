import type { FastifyPluginAsync } from 'fastify'
import { portfolioService } from '../services/PortfolioService.js'
import { validateAddress, validateChainId } from '../lib/validation.js'

export const portfolioRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { address: string }; Querystring: { chainId?: string } }>(  
    '/:address',
    async (req, reply) => {
      const { address } = req.params
      const chainId = parseInt(req.query.chainId || '10143')
      
      try {
        // Validate address format
        const validatedAddress = validateAddress(address)
        
        // Validate chain ID
        validateChainId(chainId)
        
        return portfolioService.getPortfolio(validatedAddress, chainId)
      } catch (err) {
        return reply.code(400).send({ error: err instanceof Error ? err.message : 'Invalid request' })
      }
    }
  )
}
