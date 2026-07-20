import { Redis } from 'ioredis'

export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  lazyConnect: true,
  retryStrategy: () => null,
})

let redisAvailable = false

redis.on('error', () => {
  redisAvailable = false
})

export async function connectRedis() {
  await redis.connect()
  redisAvailable = true
  return redis
}

export async function cacheGet(key: string) {
  if (!redisAvailable) return null
  try {
    return await redis.get(key)
  } catch {
    redisAvailable = false
    return null
  }
}

export async function cacheSetex(key: string, ttl: number, value: string) {
  if (!redisAvailable) return
  try {
    await redis.setex(key, ttl, value)
  } catch {
    redisAvailable = false
  }
}

export const CACHE_TTL = {
  GAS: 15,        // seconds
  QUOTE: 30,
  PORTFOLIO: 60,
  PRICE: 120,     // 2 minutes — reduce external API pressure
  SESSION: 86400, // 24h
}
