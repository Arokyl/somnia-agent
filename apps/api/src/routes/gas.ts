import type { FastifyPluginAsync } from 'fastify'
import { gasService } from '../services/GasService.js'

export const gasRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { chainId: string } }>('/:chainId', async (req, reply) => {
    const chainId = parseInt(req.params.chainId)
    if (isNaN(chainId)) return reply.status(400).send({ error: 'Invalid chainId' })
    const assessment = await gasService.assess(chainId)
    return assessment
  })
}
