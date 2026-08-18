import { describe, it, expect } from 'vitest';
import {
  getLivenessStatus,
  getReadinessStatus,
  getSystemHealthStatus,
  structuredLog,
  validateProductionEnvironment,
  createProductionIncident,
} from '../../lib/devopsEngine.mjs';

describe('Phase 15 DevOps, Health Probes & Operations Tests', () => {
  it('Liveness probe returns alive: true with ISO timestamp', () => {
    const liveness = getLivenessStatus();
    expect(liveness.alive).toBe(true);
    expect(liveness.timestamp).toBeDefined();
  });

  it('System health status evaluates PostgreSQL, Redis, outbox queue', async () => {
    const health = await getSystemHealthStatus();
    expect(health.status).toBeDefined();
    expect(health.checks.postgres).toBeDefined();
    expect(health.checks.redis).toBeDefined();
    expect(health.checks.outboxQueue).toBeDefined();
  });

  it('Readiness probe evaluates system health status', async () => {
    const readiness = await getReadinessStatus();
    expect(readiness.ready).toBe(true);
  });

  it('Structured JSON log automatically scrubs sensitive keys (password, token, apiKey)', () => {
    const log = structuredLog('INFO', 'User login attempt', {
      user_id: 'usr_123',
      password: 'SuperSecretPassword123!',
      apiKey: 'bk_live_secret_key',
    });

    expect(log.password).toBe('[SCRUBBED]');
    expect(log.apiKey).toBe('[SCRUBBED]');
    expect(log.user_id).toBe('usr_123');
  });

  it('Production startup environment validator fails fast when required production secrets are missing', () => {
    expect(() =>
      validateProductionEnvironment({ NODE_ENV: 'production' })
    ).toThrow('PRODUCTION_STARTUP_ERROR');

    const valid = validateProductionEnvironment({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://usr:pass@localhost:5432/db',
      JWT_SECRET: 'secret',
      FRONTEND_URL: 'https://oddsyra.com',
      CORS_ORIGIN: 'https://oddsyra.com',
      RAZORPAY_KEY_ID: 'rzp_live_test',
      RAZORPAY_KEY_SECRET: 'secret',
      RAZORPAY_WEBHOOK_SECRET: 'wh_secret',
      SMTP_HOST: 'smtp.example.com',
      SMTP_USER: 'user',
      SMTP_PASSWORD: 'pass',
    });
    expect(valid.valid).toBe(true);
  });

  it('rejects example Razorpay webhook and JWT secrets in production', () => {
    const base = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://usr:pass@localhost:5432/db',
      FRONTEND_URL: 'https://oddsyra.com',
      CORS_ORIGIN: 'https://oddsyra.com',
      RAZORPAY_KEY_ID: 'rzp_live_test',
      RAZORPAY_KEY_SECRET: 'secret',
      SMTP_HOST: 'smtp.example.com',
      SMTP_USER: 'user',
      SMTP_PASSWORD: 'pass',
    };
    expect(() =>
      validateProductionEnvironment({
        ...base,
        JWT_SECRET: 'oddsyra_jwt_secret_dev_key_2026',
        RAZORPAY_WEBHOOK_SECRET: 'wh_secret',
      })
    ).toThrow('Unsafe JWT_SECRET');
    expect(() =>
      validateProductionEnvironment({
        ...base,
        JWT_SECRET: 'a-real-production-secret',
        RAZORPAY_WEBHOOK_SECRET: 'oddsyra_wh_secret_2026',
      })
    ).toThrow('Unsafe RAZORPAY_WEBHOOK_SECRET');
  });

  it('Incident logger creates SEV-1/SEV-2 incident record', async () => {
    const inc = await createProductionIncident({
      title: 'Database connection latency spike',
      severity: 'SEV-2',
      service: 'oddsyra_api',
      rootCause: 'Transient network jitter',
    });

    expect(inc.success).toBe(true);
    expect(inc.incidentId).toContain('inc_');
    expect(inc.severity).toBe('SEV-2');
  });
});
