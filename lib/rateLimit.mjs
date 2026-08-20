/**
 * Redis-first sliding-window rate limit. In-memory fallback if Redis is down.
 */
import { checkRedisHealth, redis } from '../db/redis.js';

const memoryRateLimitMap = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of memoryRateLimitMap.entries()) {
    const valid = timestamps.filter((ts) => now - ts < 15 * 60 * 1000);
    if (valid.length === 0) memoryRateLimitMap.delete(key);
    else memoryRateLimitMap.set(key, valid);
  }
}, 5 * 60 * 1000).unref?.();

/**
 * @returns {Promise<{ allowed: boolean, count: number, remaining: number, retryAfterSeconds: number, limit: number, windowSeconds: number }>}
 */
export async function consumeRateLimitSlot({
  key,
  windowSeconds = 60,
  maxRequests = 10,
  prefix = 'rl',
} = {}) {
  const windowMs = windowSeconds * 1000;
  const now = Date.now();
  const redisKey = `${prefix}:${key}`;
  const retryAfterSeconds = Math.ceil(windowSeconds);
  const limit = maxRequests;

  try {
    const redisHealth = await checkRedisHealth();
    if (redisHealth.connected) {
      const tx = redis.multi();
      tx.zremrangebyscore(redisKey, 0, now - windowMs);
      tx.zadd(redisKey, now, `${now}-${Math.random()}`);
      tx.zcard(redisKey);
      tx.expire(redisKey, windowSeconds);
      const results = await tx.exec();
      const count = Number(results[2][1]);
      const remaining = Math.max(0, limit - count);
      return {
        allowed: count <= maxRequests,
        count,
        remaining,
        retryAfterSeconds,
        limit,
        windowSeconds,
      };
    }
  } catch {
    // memory fallback
  }

  const memKey = redisKey;
  const timestamps = memoryRateLimitMap.get(memKey) || [];
  const validTimestamps = timestamps.filter((ts) => now - ts < windowMs);
  validTimestamps.push(now);
  memoryRateLimitMap.set(memKey, validTimestamps);
  const count = validTimestamps.length;
  return {
    allowed: count <= maxRequests,
    count,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds,
    limit,
    windowSeconds,
  };
}
