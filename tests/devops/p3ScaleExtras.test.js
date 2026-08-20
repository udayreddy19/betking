import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { generateAccessToken, verifyAccessToken } from '../../server/auth/tokenService.js';
import { generateAdminToken, verifyAdminToken, ADMIN_ROLES } from '../../server/middleware/adminAuth.js';
import { isSmsConfigured, isWebPushConfigured, dispatchNotificationChannel } from '../../lib/notificationChannels.mjs';
import { isReadReplicaConfigured } from '../../db/pg.js';
import { observeHttpRequest, renderPrometheusMetrics, resetRequestMetricsForTests } from '../../lib/requestMetrics.mjs';

describe('P3 JWT library', () => {
  it('round-trips user and admin HS256 tokens via jsonwebtoken', () => {
    const access = generateAccessToken('usr_p3', 'USER', 'oddsyra_in');
    const decoded = verifyAccessToken(access);
    expect(decoded.sub).toBe('usr_p3');
    expect(decoded.type).toBe('access');
    expect(verifyAccessToken('not-a-jwt')).toBeNull();

    const admin = generateAdminToken('admin_p3', ADMIN_ROLES.SUPER_ADMIN);
    const adminDecoded = verifyAdminToken(admin);
    expect(adminDecoded.sub).toBe('admin_p3');
    expect(adminDecoded.type).toBe('admin');
  });
});

describe('P3 replica, metrics, notify, flags', () => {
  it('does not require a replica URL locally', () => {
    expect(isReadReplicaConfigured()).toBe(false);
  });

  it('records HTTP metrics without query strings or secrets', () => {
    resetRequestMetricsForTests();
    observeHttpRequest({ method: 'GET', route: '/api/bets/mine', status: 200, ms: 12 });
    const text = renderPrometheusMetrics();
    expect(text).toContain('http_requests_total');
    expect(text).toContain('/api/bets/mine');
    expect(text.includes('Authorization')).toBe(false);
  });

  it('keeps SMS and web push off until credentials exist', async () => {
    expect(isSmsConfigured()).toBe(false);
    expect(isWebPushConfigured()).toBe(false);
    const sms = await dispatchNotificationChannel('SMS', '9999999999', 'hello');
    expect(sms.skipped).toBe(true);
    expect(sms.reason).toBe('EMAIL_FAILOVER_NOT_MONITORED');
    const inn = await dispatchNotificationChannel('IN_APP', 'u1', 'hello');
    expect(inn.delivered).toBe(true);
  });

  it('keeps fantasy join and casino gated in source', () => {
    const flags = fs.readFileSync(path.resolve(process.cwd(), 'src/utils/featureFlags.js'), 'utf8');
    expect(flags).toContain('FANTASY_JOIN_ENABLED');
    expect(flags).toContain('CASINO_ENABLED = DEMO_MODE');
  });

  it('wires replica reads, metrics, nginx timings, and jsonwebtoken', () => {
    const pg = fs.readFileSync(path.resolve(process.cwd(), 'db/pg.js'), 'utf8');
    expect(pg).toContain('DATABASE_READ_URL');
    expect(pg).toContain('export async function queryRead');

    const index = fs.readFileSync(path.resolve(process.cwd(), 'server/index.js'), 'utf8');
    expect(index).toContain("app.get('/metrics'");

    const nginx = fs.readFileSync(path.resolve(process.cwd(), 'nginx/nginx.conf'), 'utf8');
    expect(nginx).toContain('rt=$request_time');
    expect(nginx).toContain('stub_status');
    expect(nginx).toContain('Cache-Control "no-store');

    const jwtLib = fs.readFileSync(path.resolve(process.cwd(), 'lib/jwtHs256.mjs'), 'utf8');
    expect(jwtLib).toContain("from 'jsonwebtoken'");
  });
});
