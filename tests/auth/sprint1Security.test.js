import { describe, it, expect } from 'vitest';
import { generateTotp, generateTotpSecret, verifyTotp } from '../../lib/totp.mjs';
import { encryptSecret, decryptSecret } from '../../lib/secretBox.mjs';
import { isAdminDevBootstrapAllowed, isProductionRuntime } from '../../lib/adminLoginFlow.mjs';
import { requireCsrfWhenCookies } from '../../server/middleware/csrf.js';
import { wsUrlHasAuthQuery } from '../../lib/websocketEngine.mjs';

describe('Sprint 1 admin TOTP', () => {
  it('verifies a current TOTP code and rejects a wrong code', () => {
    const secret = generateTotpSecret();
    const code = generateTotp(secret);
    expect(verifyTotp(secret, code)).toBe(true);
    expect(verifyTotp(secret, '000000')).toBe(false);
  });

  it('round-trips encrypted MFA secrets', () => {
    const secret = generateTotpSecret();
    const boxed = encryptSecret(secret);
    expect(boxed.ciphertext).not.toBe(secret);
    expect(decryptSecret(boxed)).toBe(secret);
  });
});

describe('Sprint 1 admin bootstrap lock', () => {
  it('never allows passwordless bootstrap in production', () => {
    const prev = process.env.NODE_ENV;
    const prevFlag = process.env.ADMIN_DEV_LOGIN;
    try {
      process.env.NODE_ENV = 'production';
      process.env.ADMIN_DEV_LOGIN = '1';
      expect(isProductionRuntime()).toBe(true);
      expect(isAdminDevBootstrapAllowed()).toBe(false);
    } finally {
      process.env.NODE_ENV = prev;
      process.env.ADMIN_DEV_LOGIN = prevFlag;
    }
  });

  it('allows bootstrap only when ADMIN_DEV_LOGIN=1 outside production', () => {
    const prev = process.env.NODE_ENV;
    const prevFlag = process.env.ADMIN_DEV_LOGIN;
    try {
      process.env.NODE_ENV = 'test';
      process.env.ADMIN_DEV_LOGIN = '1';
      expect(isAdminDevBootstrapAllowed()).toBe(true);
      process.env.ADMIN_DEV_LOGIN = '0';
      expect(isAdminDevBootstrapAllowed()).toBe(false);
    } finally {
      process.env.NODE_ENV = prev;
      process.env.ADMIN_DEV_LOGIN = prevFlag;
    }
  });
});

describe('Sprint 1 CSRF cookie mutations', () => {
  it('rejects refresh-style POSTs when CSRF header does not match cookie', () => {
    const req = {
      method: 'POST',
      cookies: { bk_refresh: 'refresh', bk_csrf: 'cookie-token' },
      headers: { 'x-csrf-token': 'wrong' },
    };
    let statusCode;
    let body;
    const res = {
      status(code) { statusCode = code; return this; },
      json(payload) { body = payload; return this; },
    };
    let nextCalled = false;
    requireCsrfWhenCookies(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(false);
    expect(statusCode).toBe(403);
    expect(body.code).toBe('CSRF_REJECTED');
  });

  it('allows Bearer-only POSTs with no auth cookies', () => {
    const req = { method: 'POST', cookies: {}, headers: {} };
    let nextCalled = false;
    requireCsrfWhenCookies(req, { status() { return this; }, json() { return this; } }, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });
});

describe('Sprint 1 WebSocket query tokens', () => {
  it('flags token query strings that must be rejected', () => {
    expect(wsUrlHasAuthQuery('/ws/support?token=abc')).toBe(true);
    expect(wsUrlHasAuthQuery('/ws/support?access_token=abc')).toBe(true);
    expect(wsUrlHasAuthQuery('/ws/support')).toBe(false);
  });
});
