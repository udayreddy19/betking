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

  it('Production startup environment validator fails fast when DATABASE_URL or JWT_SECRET is missing', () => {
    expect(() =>
      validateProductionEnvironment({ NODE_ENV: 'production' })
    ).toThrow('PRODUCTION_STARTUP_ERROR: Missing required secrets: DATABASE_URL, JWT_SECRET');

    const valid = validateProductionEnvironment({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://usr:pass@localhost:5432/db',
      JWT_SECRET: 'secret',
    });
    expect(valid.valid).toBe(true);
  });

  it('Incident logger creates SEV-1/SEV-2 incident record', async () => {
    const inc = await createProductionIncident({
      title: 'Database connection latency spike',
      severity: 'SEV-2',
      service: 'betking_api',
      rootCause: 'Transient network jitter',
    });

    expect(inc.success).toBe(true);
    expect(inc.incidentId).toContain('inc_');
    expect(inc.severity).toBe('SEV-2');
  });
});
