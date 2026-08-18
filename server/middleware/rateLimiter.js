/**
 * Reusable Rate Limiter Middleware — OddsYra Sportsbook Platform
 * 
 * Supports configurable window sizes, request thresholds per IP/key,
 * Redis caching integration with safe in-memory fallback.
 */

import { checkRedisHealth, redis } from '../../db/redis.js';

// In-memory fallback sliding window map (ip:endpoint -> timestamp[])
const memoryRateLimitMap = new Map();

/**
 * Cleanup expired in-memory rate limit entries periodically
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of memoryRateLimitMap.entries()) {
    const valid = timestamps.filter(ts => now - ts < 15 * 60 * 1000);
    if (valid.length === 0) {
      memoryRateLimitMap.delete(key);
    } else {
      memoryRateLimitMap.set(key, valid);
    }
  }
}, 5 * 60 * 1000);

/**
 * Configurable rate limiter factory middleware
 */
export function createRateLimiter({
  windowSeconds = parseInt(process.env.AUTH_RATE_LIMIT_WINDOW) || 60,
  maxRequests = 10,
  prefix = 'rl',
  keyGenerator = (req) => req.ip || req.headers['x-forwarded-for'] || 'unknown_ip',
} = {}) {
  return async (req, res, next) => {
    const clientKey = keyGenerator(req);
    const windowMs = windowSeconds * 1000;
    const now = Date.now();
    const redisKey = `${prefix}:${clientKey}`;

    // Attempt Redis sliding window rate limiting
    try {
      const redisHealth = await checkRedisHealth();
      if (redisHealth.connected) {
        const tx = redis.multi();
        tx.zremrangebyscore(redisKey, 0, now - windowMs);
        tx.zadd(redisKey, now, `${now}-${Math.random()}`);
        tx.zcard(redisKey);
        tx.expire(redisKey, windowSeconds);
        const results = await tx.exec();

        const requestCount = results[2][1];
        if (requestCount > maxRequests) {
          const retryAfterSeconds = Math.ceil(windowSeconds);
          res.setHeader('Retry-After', retryAfterSeconds);
          return res.status(429).json({
            error: 'Too many requests. Please try again later.',
            code: 'RATE_LIMIT_EXCEEDED',
            retryAfterSeconds,
            limit: maxRequests,
            windowSeconds,
          });
        }
        return next();
      }
    } catch (err) {
      // Fall through to in-memory check if Redis fails
    }

    // In-memory sliding window fallback
    const key = `${prefix}:${clientKey}`;
    const timestamps = memoryRateLimitMap.get(key) || [];
    const validTimestamps = timestamps.filter(ts => now - ts < windowMs);

    if (validTimestamps.length >= maxRequests) {
      const retryAfterSeconds = Math.ceil(windowSeconds);
      res.setHeader('Retry-After', retryAfterSeconds);
      return res.status(429).json({
        error: 'Too many requests. Please try again later.',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfterSeconds,
        limit: maxRequests,
        windowSeconds,
      });
    }

    validTimestamps.push(now);
    memoryRateLimitMap.set(key, validTimestamps);
    return next();
  };
}

/** Pre-configured rate limiters for authentication endpoints */
export const loginRateLimiter = createRateLimiter({
  prefix: 'rl:login',
  maxRequests: parseInt(process.env.AUTH_LOGIN_RATE_LIMIT) || 5,
  windowSeconds: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW) || 60,
});

export const registerRateLimiter = createRateLimiter({
  prefix: 'rl:register',
  maxRequests: parseInt(process.env.AUTH_REGISTER_RATE_LIMIT) || 10,
  windowSeconds: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW) || 60,
});

export const forgotPasswordRateLimiter = createRateLimiter({
  prefix: 'rl:forgot_password',
  maxRequests: 3,
  windowSeconds: 15 * 60, // 15 minutes
});

export const verifyEmailRateLimiter = createRateLimiter({
  prefix: 'rl:verify_email',
  maxRequests: 5,
  windowSeconds: 15 * 60, // 15 minutes
});

export const authGeneralRateLimiter = createRateLimiter({
  prefix: 'rl:auth_general',
  maxRequests: 10,
  windowSeconds: 60,
});

export const rewardsClaimRateLimiter = createRateLimiter({
  prefix: 'rl:rewards_claim',
  maxRequests: 10,
  windowSeconds: 60,
});

