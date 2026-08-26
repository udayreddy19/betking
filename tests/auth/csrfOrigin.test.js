import { describe, it, expect } from 'vitest';
import { originAllowed, requireCsrfWhenCookies } from '../../server/middleware/csrf.js';

describe('CSRF origin validation for cookie sessions', () => {
  it('skips origin check for bearer-only requests (no refresh cookie)', () => {
    const req = { cookies: {}, headers: {} };
    expect(originAllowed(req)).toBe(true);
  });

  it('accepts allowed Origin when refresh cookie present', () => {
    process.env.CORS_ORIGIN = 'https://oddsyra.com';
    process.env.NODE_ENV = 'test';
    const req = {
      cookies: { bk_refresh: 'tok' },
      headers: { origin: 'https://oddsyra.com' },
    };
    expect(originAllowed(req)).toBe(true);
  });

  it('rejects disallowed Origin when refresh cookie present', () => {
    process.env.CORS_ORIGIN = 'https://oddsyra.com';
    process.env.NODE_ENV = 'production';
    const req = {
      cookies: { bk_refresh: 'tok' },
      headers: { origin: 'https://evil.example' },
    };
    expect(originAllowed(req)).toBe(false);
  });

  it('requireCsrfWhenCookies rejects bad origin after CSRF match', () => {
    process.env.CORS_ORIGIN = 'https://oddsyra.com';
    process.env.NODE_ENV = 'production';
    const token = 'abc123csrf';
    const req = {
      method: 'POST',
      cookies: { bk_refresh: 'tok', bk_csrf: token },
      headers: { 'x-csrf-token': token, origin: 'https://evil.example' },
    };
    const res = {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = payload; return this; },
    };
    let nextCalled = false;
    requireCsrfWhenCookies(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('ORIGIN_REJECTED');
  });
});
