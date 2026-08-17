import { describe, expect, it } from 'vitest';
import { requireAuth } from '../../server/middleware/userAuth.js';

describe('protected money routes middleware', () => {
  it('returns 401 without bearer token', () => {
    const req = { headers: {}, cookies: {} };
    const res = {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      },
    };
    let nextCalled = false;

    requireAuth(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('AUTH_REQUIRED');
  });
});
