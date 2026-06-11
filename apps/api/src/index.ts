import './env'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import { portfolioRoutes } from './routes/portfolio'
import { quotesRoutes } from './routes/quotes'
import { gasRoutes } from './routes/gas'
import { historyRoutes } from './routes/history'
import { ordersRoutes } from './routes/orders'
import { connectRedis } from './lib/redis'
import { getAllowedOrigins } from './lib/cors'

const app = Fastify({ logger: true })

async function main() {
  // Plugins
  await app.register(cors, { origin: getAllowedOrigins() })

  const rateLimitOptions: any = {
    max: 60,
    timeWindow: '1 minute',
  }

  try {
    rateLimitOptions.redis = await connectRedis()
    app.log.info('Redis connected for rate limiting')
  } catch (err: any) {
    app.log.warn('Redis unavailable, using in-memory rate limiter: ' + (err?.message || err))
  }

  await app.register(rateLimit, rateLimitOptions)

  // Routes
  await app.register(portfolioRoutes, { prefix: '/portfolio' })
  await app.register(quotesRoutes,    { prefix: '/quotes'    })
  await app.register(gasRoutes,       { prefix: '/gas'       })
  await app.register(historyRoutes,   { prefix: '/history'   })
  await app.register(ordersRoutes,    { prefix: '/orders'    })

  // Health check
  app.get('/health', async () => ({ ok: true, ts: Date.now() }))

  // Global error handler (fixes unhandled rejections)
  app.setErrorHandler((error, request, reply) => {
    app.log.error(error)
    const statusCode = error.statusCode || 500
    const message = error.message || 'Internal Server Error'
    reply.code(statusCode).send({ error: message })
  })

  const port = parseInt(process.env.PORT || process.env.API_PORT || '3001')
  await app.listen({ port, host: '0.0.0.0' })
  console.log(`API running on port ${port}`)
}

async function shutdown() {
  try {
    await app.close()
  } finally {
    process.exit(0)
  }
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
