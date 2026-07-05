import type { FastifyPluginAsync } from 'fastify'
import { portfolioService } from '../services/PortfolioService.js'
import { withAuth } from '../lib/auth.js'
import { validateAddress, validateChainId } from '../lib/validation.js'

export const portfolioRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { address: string }; Querystring: { chainId?: string } }>(  
    '/:address',
    { onRequest: withAuth },
    async (req, reply) => {
      const auth = (req as any).auth
      const { address } = req.params
      const chainId = parseInt(req.query.chainId || '50312')
      
      try {
        // Validate address format
        const validatedAddress = validateAddress(address)
        
        // Validate chain ID
        validateChainId(chainId)
        
        // Users can only query their own portfolio
        if (auth.address !== validatedAddress) {
          return reply.code(403).send({ error: 'Forbidden: can only query own portfolio' })
        }
        
        return portfolioService.getPortfolio(validatedAddress, chainId)
      } catch (err) {
        return reply.code(400).send({ error: err instanceof Error ? err.message : 'Invalid request' })
      }
    }
  )
}
