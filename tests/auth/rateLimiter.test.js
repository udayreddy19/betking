import { describe, it, expect, vi } from 'vitest';
import { createRateLimiter, rateLimitClientKey } from '../../server/middleware/rateLimiter.js';

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

  it('keys on req.ip and ignores spoofed X-Forwarded-For', () => {
    const req = { ip: '10.0.0.8', headers: { 'x-forwarded-for': '1.2.3.4' } };
    expect(rateLimitClientKey(req)).toBe('10.0.0.8');
  });

  it('keeps admin login in a separate bucket from public login', async () => {
    const stamp = Date.now();
    const userLimiter = createRateLimiter({ maxRequests: 1, windowSeconds: 60, prefix: `rl:login_t_${stamp}` });
    const adminLimiter = createRateLimiter({ maxRequests: 1, windowSeconds: 60, prefix: `rl:admin_login_t_${stamp}` });
    const req = { ip: '203.0.113.9', headers: {} };
    const resUser = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };
    const resAdmin = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await userLimiter(req, resUser, next);
    await adminLimiter(req, resAdmin, next);
    expect(next).toHaveBeenCalledTimes(2);

    await userLimiter(req, resUser, next);
    expect(resUser.status).toHaveBeenCalledWith(429);
    expect(resAdmin.status).not.toHaveBeenCalled();
  });
});
