import { describe, it, expect, vi } from 'vitest';
import { createRateLimiter } from '../../server/middleware/rateLimiter.js';

describe('Phase 1 Rate Limiter Tests', () => {
  it('should allow requests within threshold limit', async () => {
    const limiter = createRateLimiter({ maxRequests: 5, windowSeconds: 60, prefix: `test_allow_${Date.now()}` });
    const req = { ip: `127.0.0.${Math.floor(Math.random() * 200)}`, headers: {} };
    const res = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await limiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);

    await limiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('should block requests that exceed threshold limit with HTTP 429', async () => {
    const limiter = createRateLimiter({ maxRequests: 2, windowSeconds: 60, prefix: `test_exceed_${Date.now()}` });
    const req = { ip: `192.168.1.${Math.floor(Math.random() * 200)}`, headers: {} };
    const res = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await limiter(req, res, next); // 1
    await limiter(req, res, next); // 2
    await limiter(req, res, next); // 3 (exceeded)

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'RATE_LIMIT_EXCEEDED',
    }));
  });
});
