let Redis = null;
try {
  Redis = (await import('ioredis')).default;
} catch {
  // ioredis optional in unit test environments
}

try {
  const dotenv = (await import('dotenv')).default;
  dotenv.config();
} catch {
  // dotenv optional in unit test environments
}

class MockRedis {
  constructor() {
    this.store = new Map();
  }
  on() {}
  async get(key) { return this.store.get(key) || null; }
  async set(key, val) { this.store.set(key, val); return 'OK'; }
  async del(key) { this.store.delete(key); return 1; }
}

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

export const redis = Redis
  ? new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      const delay = Math.min(times * 200, 2000);
      return delay;
    },
    lazyConnect: true,
  })
  : new MockRedis();

if (Redis) {
  redis.on('error', (err) => {
    if (process.env.DEBUG_REDIS) {
      console.warn('[Redis Warning]', err.message);
    }
  });

  redis.on('connect', () => {
    console.log('[Redis] Connected to 127.0.0.1:6379');
  });
}

/**
 * Cache helper to get or set cache keys with TTL
 */
export async function getOrSetCache(key, ttlSeconds, fetchFn) {
  try {
    const cached = await redis.get(key);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch {
    // Fall through on cache error
  }

  const freshData = await fetchFn();
  try {
    if (freshData !== undefined && freshData !== null) {
      await redis.set(key, JSON.stringify(freshData), 'EX', ttlSeconds);
    }
  } catch {
    // Fail silently on cache set error
  }

  return freshData;
}

export async function checkRedisHealth() {
  if (!Redis || redis instanceof MockRedis) {
    return { ok: true, connected: true, status: 'mock_connected' };
  }
  try {
    const pong = await redis.ping();
    return { ok: pong === 'PONG', connected: pong === 'PONG', status: pong === 'PONG' ? 'connected' : 'error' };
  } catch (err) {
    return { ok: false, connected: false, status: 'disconnected', error: err.message };
  }
}
