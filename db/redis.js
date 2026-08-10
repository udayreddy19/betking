import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 200, 2000);
    return delay;
  },
  lazyConnect: true,
});

redis.on('error', (err) => {
  if (process.env.DEBUG_REDIS) {
    console.warn('[Redis Warning]', err.message);
  }
});

redis.on('connect', () => {
  console.log('[Redis] Connected to 127.0.0.1:6379');
});

/**
 * Cache helper to get or set cache keys with TTL
 */
export async function getOrSetCache(key, ttlSeconds, fetchFn) {
  try {
    const cached = await redis.get(key);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (err) {
    // Fall through on cache error
  }

  const freshData = await fetchFn();
  try {
    if (freshData !== undefined && freshData !== null) {
      await redis.set(key, JSON.stringify(freshData), 'EX', ttlSeconds);
    }
  } catch (err) {
    // Ignore cache set error
  }

  return freshData;
}

/**
 * Health Check helper verifying Redis connectivity
 */
export async function checkRedisHealth() {
  try {
    const pingRes = await redis.ping();
    return {
      connected: pingRes === 'PONG',
      status: 'PONG',
    };
  } catch (err) {
    return {
      connected: false,
      error: err.message,
    };
  }
}
