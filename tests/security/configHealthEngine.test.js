import { describe, it, expect } from 'vitest';
import { getConfigurationHealth } from '../../lib/configHealthEngine.mjs';

describe('configHealthEngine', () => {
  it('flags DEMO_MODE as CRITICAL in production', () => {
    const res = getConfigurationHealth({
      NODE_ENV: 'production',
      DEMO_MODE: '1',
      DATABASE_URL: 'postgres://x',
      JWT_SECRET: 'x'.repeat(40),
      FRONTEND_URL: 'https://oddsyra.com',
      CORS_ORIGIN: 'https://oddsyra.com',
      SMTP_HOST: 'smtp.example',
    });
    expect(res.overall).toBe('CRITICAL');
    expect(res.checks.some((c) => c.id === 'demo_mode' && c.status === 'CRITICAL')).toBe(true);
  });

  it('never returns secret values', () => {
    const secret = 'super-secret-jwt-value-32chars!!';
    const res = getConfigurationHealth({
      NODE_ENV: 'development',
      JWT_SECRET: secret,
      DATABASE_URL: 'postgres://user:pass@localhost/db',
    });
    const blob = JSON.stringify(res);
    expect(blob).not.toContain(secret);
    expect(blob).not.toContain('user:pass');
  });

  it('returns OK when production essentials present and demo off', () => {
    const res = getConfigurationHealth({
      NODE_ENV: 'production',
      DEMO_MODE: '0',
      VITE_DEMO_MODE: '0',
      DATABASE_URL: 'postgres://prod',
      JWT_SECRET: 'x'.repeat(40),
      FRONTEND_URL: 'https://oddsyra.com',
      CORS_ORIGIN: 'https://oddsyra.com',
      SMTP_HOST: 'smtp',
      REDIS_URL: 'redis://localhost',
    });
    expect(res.overall).not.toBe('CRITICAL');
    expect(res.checks.find((c) => c.id === 'demo_mode')?.status).toBe('OK');
  });
});
