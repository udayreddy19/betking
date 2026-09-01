/**
 * Reusable Rate Limiter Middleware — OddsYra Sportsbook Platform
 *
 * Redis sliding window with in-memory fallback. Used by auth HTTP middleware
 * and the developer public API (authenticateApiKey).
 */

import { checkRedisHealth, redis } from '../../db/redis.js';

const memoryRateLimitMap = new Map();

if (process.env.NODE_ENV !== 'test') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of memoryRateLimitMap.entries()) {
      const valid = timestamps.filter((ts) => now - ts < 15 * 60 * 1000);
      if (valid.length === 0) memoryRateLimitMap.delete(key);
      else memoryRateLimitMap.set(key, valid);
    }
  }, 5 * 60 * 1000).unref?.();
}

/**
 * Consume one slot in a sliding window.
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
  const base = { limit: maxRequests, windowSeconds, retryAfterSeconds };

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
      const remaining = Math.max(0, maxRequests - count);
      if (count > maxRequests) {
        return { allowed: false, count, remaining: 0, ...base };
      }
      return { allowed: true, count, remaining, ...base };
    }
  } catch {
    // memory fallback
  }

  const timestamps = (memoryRateLimitMap.get(redisKey) || []).filter((ts) => now - ts < windowMs);
  if (timestamps.length >= maxRequests) {
    return { allowed: false, count: timestamps.length, remaining: 0, ...base };
  }
  timestamps.push(now);
  memoryRateLimitMap.set(redisKey, timestamps);
  const count = timestamps.length;
  return { allowed: true, count, remaining: Math.max(0, maxRequests - count), ...base };
}

/**
 * Client identity for rate-limit keys. Express `trust proxy` is 1, so req.ip
 * is the leftmost trusted hop. Do not fall back to spoofable X-Forwarded-For.
 */
export function rateLimitClientKey(req) {
  return String(req?.ip || 'unknown_ip');
}

export function createRateLimiter({
  windowSeconds = parseInt(process.env.AUTH_RATE_LIMIT_WINDOW, 10) || 60,
  maxRequests = 10,
  prefix = 'rl',
  keyGenerator = rateLimitClientKey,
} = {}) {
  return async (req, res, next) => {
    const clientKey = keyGenerator(req);
    const result = await consumeRateLimitSlot({
      key: clientKey,
      windowSeconds,
      maxRequests,
      prefix,
    });
    if (!result.allowed) {
      res.setHeader('Retry-After', result.retryAfterSeconds);
      return res.status(429).json({
        error: 'Too many requests. Please try again later.',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfterSeconds: result.retryAfterSeconds,
        limit: maxRequests,
        windowSeconds,
      });
    }
    return next();
  };
}

export const loginRateLimiter = createRateLimiter({
  prefix: 'rl:login',
  maxRequests: parseInt(process.env.AUTH_LOGIN_RATE_LIMIT, 10) || 5,
  windowSeconds: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW, 10) || 60,
});

/** Admin password + MFA share this bucket, not the public login bucket. */
export const adminLoginRateLimiter = createRateLimiter({
  prefix: 'rl:admin_login',
  maxRequests: parseInt(process.env.AUTH_ADMIN_LOGIN_RATE_LIMIT, 10) || 20,
  windowSeconds: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW, 10) || 60,
});

export const registerRateLimiter = createRateLimiter({
  prefix: 'rl:register',
  maxRequests: parseInt(process.env.AUTH_REGISTER_RATE_LIMIT, 10) || 10,
  windowSeconds: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW, 10) || 60,
});

export const forgotPasswordRateLimiter = createRateLimiter({
  prefix: 'rl:forgot_password',
  maxRequests: 3,
  windowSeconds: 15 * 60,
});

/** Stricter limit — password reset uses a 6-digit code. */
export const resetPasswordRateLimiter = createRateLimiter({
  prefix: 'rl:reset_password',
  maxRequests: 5,
  windowSeconds: 15 * 60,
});

export const verifyEmailRateLimiter = createRateLimiter({
  prefix: 'rl:verify_email',
  maxRequests: 5,
  windowSeconds: 15 * 60,
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

/** Admin API read traffic */
export const adminApiRateLimiter = createRateLimiter({
  prefix: 'rl:admin_api',
  maxRequests: parseInt(process.env.ADMIN_API_RATE_LIMIT, 10) || 120,
  windowSeconds: 60,
  keyGenerator: (req) => `admin:${req.admin?.id || rateLimitClientKey(req)}`,
});

/** Sensitive admin mutations (finance / security / config) */
export const adminMutationRateLimiter = createRateLimiter({
  prefix: 'rl:admin_mut',
  maxRequests: parseInt(process.env.ADMIN_MUTATION_RATE_LIMIT, 10) || 30,
  windowSeconds: 60,
  keyGenerator: (req) => `adminmut:${req.admin?.id || rateLimitClientKey(req)}`,
});
