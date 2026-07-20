import type { FastifyPluginAsync } from 'fastify'
import { quoteService } from '../services/QuoteService.js'

export const quotesRoutes: FastifyPluginAsync = async (app) => {
  app.get<{
    Querystring: {
      tokenIn: string; tokenOut: string; amountIn: string
      chainId?: string; tokenInDecimals?: string; tokenOutDecimals?: string
    }
  }>('/', async (req, reply) => {
    const { tokenIn, tokenOut, amountIn,       chainId = '10143', tokenInDecimals = '18', tokenOutDecimals = '18' } = req.query
    if (!tokenIn || !tokenOut || !amountIn) {
      return reply.status(400).send({ error: 'Missing required params: tokenIn, tokenOut, amountIn' })
    }
    const quotes = await quoteService.getAllQuotes({
      tokenIn, tokenOut, amountIn,
      chainId: parseInt(chainId),
      tokenInDecimals: parseInt(tokenInDecimals),
      tokenOutDecimals: parseInt(tokenOutDecimals),
    })
    return { quotes, bestQuote: quotes[0] }
  })
}
