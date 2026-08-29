import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import { createServer } from 'node:http';
import { adminAuth, requirePermission, generateAdminToken, ADMIN_ROLES } from '../../server/middleware/adminAuth.js';
import apiExplorerRouter from '../../server/routes/admin/apiExplorer.js';
import { API_REGISTRY, getApiById, listSafeRefreshIds } from '../../lib/apiRegistry.mjs';
import { listExplorerApis, testExplorerApi } from '../../lib/api-explorer/service.mjs';
import { runSafeApiTest } from '../../lib/api-explorer/runTest.mjs';
import { sanitizeExplorerPayload, isSensitiveKey, looksLikeSecretValue, assertNoSecrets } from '../../lib/api-explorer/sanitize.mjs';
import { withTimeout } from '../../lib/api-explorer/timeout.mjs';
import { ERROR_CODES } from '../../lib/api-explorer/errorCodes.mjs';
import { allowIndividualTest, allowRefreshAll } from '../../lib/api-explorer/rateLimit.mjs';
import { testOddsEngineV3, SANDBOX_MATCH_ID } from '../../lib/api-explorer/tests/oddsEngineTest.mjs';
import { testPostgres } from '../../lib/api-explorer/tests/postgresTest.mjs';
import { testRedis } from '../../lib/api-explorer/tests/redisTest.mjs';
import { testJwt } from '../../lib/api-explorer/tests/jwtTest.mjs';
import { testKycVendorPlaceholder, testInternalKycEngine } from '../../lib/api-explorer/tests/kycTest.mjs';
import { _resetMemoryForTests } from '../../lib/api-explorer/healthStore.mjs';

async function listen(app) {
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function explorerApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/api-explorer', adminAuth, apiExplorerRouter);
  return app;
}

describe('Admin API Explorer', () => {
  beforeEach(() => {
    _resetMemoryForTests();
  });

  it('loads the API registry with expected categories and integrations', async () => {
    expect(API_REGISTRY.length).toBeGreaterThan(20);
    expect(getApiById('cricbuzz')).toBeTruthy();
    expect(getApiById('odds-engine-v3').fetchMode).toBe('SAFE_TEST');
    expect(getApiById('razorpay').requiresConfig).toContain('RAZORPAY_KEY_SECRET');
    expect(getApiById('kyc-cashfree')).toBeTruthy();
    expect(getApiById('football-mock').mock).toBe(true);
    expect(getApiById('sportradar').unused).toBe(true);

    const listed = await listExplorerApis();
    expect(listed.apis.length).toBe(API_REGISTRY.length);
    expect(listed.summary.total).toBe(API_REGISTRY.length);
    expect(listed.categories.some((c) => c.id === 'SPORTS_DATA')).toBe(true);
    expect(listed.apis.every((a) => !JSON.stringify(a).includes('rzp_live_'))).toBe(true);
  });

  it('does not include external sports providers in refresh-all', () => {
    const ids = listSafeRefreshIds();
    expect(ids).toContain('postgres');
    expect(ids).toContain('odds-engine-v3');
    expect(ids).not.toContain('cricbuzz');
    expect(ids).not.toContain('tencric');
    expect(ids).not.toContain('razorpay');
  });

  it('rejects unauthenticated explorer requests', async () => {
    const { url, close } = await listen(explorerApp());
    try {
      const res = await fetch(`${url}/api/admin/api-explorer/apis`);
      expect(res.status).toBe(401);
    } finally {
      await close();
    }
  });

  it('denies non-admin explorer access', async () => {
    const token = generateAdminToken('support_1', ADMIN_ROLES.SUPPORT_AGENT);
    const { url, close } = await listen(explorerApp());
    try {
      const res = await fetch(`${url}/api/admin/api-explorer/apis`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(403);
    } finally {
      await close();
    }
  });

  it('allows SUPER_ADMIN to list APIs', async () => {
    const token = generateAdminToken('super_1', ADMIN_ROLES.SUPER_ADMIN);
    const { url, close } = await listen(explorerApp());
    try {
      const res = await fetch(`${url}/api/admin/api-explorer/apis`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.apis)).toBe(true);
    } finally {
      await close();
    }
  });

  it('enforces requirePermission for SUPPORT_AGENT', () => {
    const req = { admin: { role: ADMIN_ROLES.SUPPORT_AGENT } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    requirePermission('api-explorer', 'operations')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('reports missing configuration without faking success', async () => {
    const result = await testKycVendorPlaceholder('kyc-cashfree');
    expect(result.success).toBe(false);
    expect(result.error.code).toBe(ERROR_CODES.NOT_CONFIGURED);
    expect(result.healthStatus).toBe('NOT_CONFIGURED');
    expect(result.summary.panVerification).toBe('NOT_CONFIGURED');
  });

  it('runs a successful safe JWT test without returning a token', async () => {
    const result = await testJwt();
    expect(result.success).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/eyJ[A-Za-z0-9_-]+\./);
    expect(result.summary.tokenReturned).toBe(false);
  });

  it('runs OddsEngineV3 in sandbox test mode only', async () => {
    const result = await testOddsEngineV3();
    expect(result.success).toBe(true);
    expect(result.summary.sandbox).toBe(true);
    expect(result.summary.matchId).toBe(SANDBOX_MATCH_ID);
    expect(result.summary.marketCount).toBeGreaterThan(0);
    expect(result.summary.pipeline.length).toBeGreaterThan(3);
  });

  it('runs PostgreSQL and Redis health tests without exposing credentials', async () => {
    const pg = await testPostgres();
    const redis = await testRedis();
    const blob = JSON.stringify({ pg, redis });
    expect(blob).not.toMatch(/postgresql:\/\/[^:]+:[^@]+@/);
    expect(blob).not.toMatch(/oddsyra_dev_pass/);
    expect(pg).toHaveProperty('success');
    expect(redis).toHaveProperty('success');
    expect(['HEALTHY', 'SLOW', 'FAILED', 'NOT_CONFIGURED']).toContain(pg.healthStatus);
    expect(['HEALTHY', 'SLOW', 'FAILED', 'NOT_CONFIGURED']).toContain(redis.healthStatus);
  });

  it('times out hanging provider calls', async () => {
    const hanging = new Promise(() => {});
    await expect(withTimeout(hanging, 30)).rejects.toMatchObject({ code: ERROR_CODES.TIMEOUT });
  });

  it('redacts secrets, tokens, and KYC fields from explorer payloads', () => {
    const dirty = {
      apiKey: 'sk_live_abc',
      RAZORPAY_KEY_SECRET: 'supersecret',
      authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb',
      cookie: 'sid=abc',
      aadhaar: '123412341234',
      pan: 'ABCDE1234F',
      nested: { password: 'hunter2', ok: true },
      url: 'postgresql://user:hunter2@localhost/db',
    };
    const clean = sanitizeExplorerPayload(dirty);
    expect(clean.apiKey).toBe('••••••••');
    expect(clean.RAZORPAY_KEY_SECRET).toBe('••••••••');
    expect(clean.authorization).toBe('••••••••');
    expect(clean.aadhaar).toBe('••••••••');
    expect(clean.pan).toBe('••••••••');
    expect(clean.nested.password).toBe('••••••••');
    expect(clean.nested.ok).toBe(true);
    expect(looksLikeSecretValue('rzp_live_abc123')).toBe(true);
    expect(isSensitiveKey('webhook_secret')).toBe(true);
    expect(assertNoSecrets(clean)).toBe(true);
  });

  it('internal KYC test never returns Aadhaar or PAN values', async () => {
    const result = await testInternalKycEngine();
    expect(result.success).toBe(true);
    const blob = JSON.stringify(result);
    expect(blob).not.toMatch(/[A-Z]{5}[0-9]{4}[A-Z]/);
    expect(blob).not.toMatch(/123412341234/);
  });

  it('rate-limits individual tests per admin', async () => {
    const adminId = `rl_test_${Math.random().toString(36).slice(2)}`;
    let blocked = false;
    for (let i = 0; i < 12; i += 1) {
      const slot = await allowIndividualTest(adminId);
      if (!slot.allowed) {
        blocked = true;
        expect(slot.limit).toBe(10);
        break;
      }
    }
    expect(blocked).toBe(true);
  });

  it('rate-limits refresh-all to once per window', async () => {
    const adminId = `rl_refresh_${Math.random().toString(36).slice(2)}`;
    const first = await allowRefreshAll(adminId);
    const second = await allowRefreshAll(adminId);
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);
  });

  it('unknown API ids are not executable', async () => {
    const result = await runSafeApiTest('not-a-real-api');
    expect(result.success).toBe(false);
    expect(result.error.code).toBe(ERROR_CODES.UNKNOWN_API);
  });

  it('refresh-all only runs safe handlers', async () => {
    const ids = listSafeRefreshIds();
    expect(ids.every((id) => getApiById(id).includeInRefreshAll)).toBe(true);
    expect(ids).not.toContain('internal-bets');
    expect(ids).not.toContain('internal-wallet');
  });

  it('persists a health check and returns history', async () => {
    const { httpStatus, body } = await testExplorerApi('jwt', { adminId: 'admin_unit' });
    expect(httpStatus).toBe(200);
    expect(body.success).toBe(true);
    const listed = await listExplorerApis();
    const jwt = listed.apis.find((a) => a.id === 'jwt');
    expect(jwt.lastChecked).toBeTruthy();
  });
});
