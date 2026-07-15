import './env.js'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import { portfolioRoutes } from './routes/portfolio.js'
import { quotesRoutes } from './routes/quotes.js'
import { gasRoutes } from './routes/gas.js'
import { historyRoutes } from './routes/history.js'
import { ordersRoutes } from './routes/orders.js'
import { connectRedis } from './lib/redis.js'
import { getAllowedOrigins } from './lib/cors.js'
import { getClient } from './lib/rpc.js'
import { db } from './db/client.js'
import { ConditionalOrderKeeper } from './services/OrderKeeper.js'

const app = Fastify({ logger: true })

// Off-chain conditional-order keeper (initialized below if env is configured).
let keeper: ConditionalOrderKeeper | null = null

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

  // Database connectivity check (non-fatal: warn but keep the server up so the
  // rest of the API stays available even if the DB is temporarily unreachable).
  try {
    const { checkDatabaseConnection } = await import('./db/client.js')
    await checkDatabaseConnection()
    app.log.info('Database connection OK')
  } catch (err: any) {
    app.log.warn('Database connection failed: ' + (err?.message || err))
  }

  // Routes
  await app.register(portfolioRoutes, { prefix: '/portfolio' })
  await app.register(quotesRoutes,    { prefix: '/quotes'    })
  await app.register(gasRoutes,       { prefix: '/gas'       })
  await app.register(historyRoutes,   { prefix: '/history'   })
  await app.register(ordersRoutes,    { prefix: '/orders'    })

  // ── Conditional-order keeper (off-chain executor) ────────────────────────
  const keeperPrivateKey = process.env.KEEPER_PRIVATE_KEY
  const registryAddress = process.env.AUTOMATION_REGISTRY_ADDRESS
  if (keeperPrivateKey && registryAddress) {
    try {
      const chainId = parseInt(process.env.KEEPER_CHAIN_ID || process.env.CHAIN_ID || '50312')
      const rpc = getClient(chainId)
      keeper = new ConditionalOrderKeeper(db, rpc, {
        registryAddress: registryAddress as `0x${string}`,
        privateKey: keeperPrivateKey as `0x${string}`,
        chainId,
        executionProxyAddress: process.env.EXECUTION_PROXY_ADDRESS as `0x${string}` | undefined,
        pollIntervalMs: process.env.KEEPER_POLL_INTERVAL_MS
          ? parseInt(process.env.KEEPER_POLL_INTERVAL_MS)
          : undefined,
        defaultAggregatorTarget: process.env.DEFAULT_AGGREGATOR_TARGET as `0x${string}` | undefined,
        defaultAggregatorCalldata: process.env.DEFAULT_AGGREGATOR_CALLDATA as `0x${string}` | undefined,
      })
      keeper.start()
      app.log.info('ConditionalOrderKeeper initialized and started')
    } catch (err: any) {
      app.log.error('Failed to initialize ConditionalOrderKeeper: ' + (err?.message || err))
    }
  } else {
    app.log.info('ConditionalOrderKeeper disabled (set KEEPER_PRIVATE_KEY and AUTOMATION_REGISTRY_ADDRESS to enable)')
  }

  // Health check
  app.get('/health', async () => ({
    ok: true,
    ts: Date.now(),
    keeper: keeper ? keeper.getStatus() : null,
  }))

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
    if (keeper) keeper.stop()
  } catch (err) {
    console.error('Error stopping keeper:', err)
  } finally {
    try {
      await app.close()
    } finally {
      process.exit(0)
    }
  }
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
