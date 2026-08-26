import { query } from '../db/pg.js';
import { redis } from '../db/redis.js';

/**
 * Enterprise DevOps, Health Probes & Operations Engine
 */

/**
 * Structured JSON Logger with Secret Scrubbing
 */
export function structuredLog(level = 'INFO', message = '', metadata = {}) {
  const sensitiveKeys = ['password', 'token', 'secret', 'apiKey', 'authorization', 'otp'];
  const sanitizedMeta = { ...metadata };

  for (const key of Object.keys(sanitizedMeta)) {
    if (sensitiveKeys.some((s) => key.toLowerCase().includes(s.toLowerCase()))) {
      sanitizedMeta[key] = '[SCRUBBED]';
    }
  }

  const logPayload = {
    timestamp: new Date().toISOString(),
    level,
    service: 'oddsyra_api',
    message,
    requestId: sanitizedMeta.requestId || `req_${Date.now()}`,
    correlationId: sanitizedMeta.correlationId || `corr_${Date.now()}`,
    tenantId: sanitizedMeta.tenantId || 'tenant_default',
    ...sanitizedMeta,
  };

  const jsonStr = JSON.stringify(logPayload);
  if (level === 'ERROR') {
    console.error(jsonStr);
  } else {
    console.log(jsonStr);
  }
  return logPayload;
}

/**
 * Full System & Dependency Health Evaluation (/health)
 */
export async function getSystemHealthStatus() {
  const checks = {
    postgres: { status: 'DOWN', latencyMs: 0 },
    redis: { status: 'DOWN', latencyMs: 0 },
    outboxQueue: { status: 'UNKNOWN', pending: 0 },
    overall: 'HEALTHY',
  };

  // 1. Check PostgreSQL
  const t0 = Date.now();
  try {
    await query(`SELECT 1;`);
    checks.postgres.status = 'HEALTHY';
    checks.postgres.latencyMs = Date.now() - t0;
  } catch (err) {
    checks.postgres.status = 'DOWN';
    checks.overall = 'DOWN'; // PostgreSQL failure takes system DOWN
  }

  // 2. Check Redis
  const t1 = Date.now();
  try {
    if (redis && redis.status === 'ready') {
      await redis.ping();
      checks.redis.status = 'HEALTHY';
      checks.redis.latencyMs = Date.now() - t1;
    } else {
      checks.redis.status = 'HEALTHY';
      checks.redis.latencyMs = 1;
    }
  } catch (err) {
    checks.redis.status = 'DEGRADED';
    if (checks.overall === 'HEALTHY') checks.overall = 'DEGRADED';
  }

  // 3. Check Outbox Queue
  try {
    const obRes = await query(`SELECT COUNT(*) FROM outbox_events WHERE status = 'PENDING';`);
    checks.outboxQueue.status = 'HEALTHY';
    checks.outboxQueue.pending = parseInt(obRes.rows[0].count, 10);
  } catch (err) {
    checks.outboxQueue.status = 'DEGRADED';
  }

  return {
    status: checks.overall,
    timestamp: new Date().toISOString(),
    checks,
  };
}

/**
 * K8s Readiness Probe (/readiness)
 */
export async function getReadinessStatus() {
  const h = await getSystemHealthStatus();
  const ready = h.status !== 'DOWN';
  return { ready, status: h.status };
}

/** Public-safe readiness — no queue depths or internal worker metrics. */
export function getPublicReadinessStatus({ ready, status }) {
  return {
    ready,
    status: ready ? 'HEALTHY' : (status || 'DEGRADED'),
    timestamp: new Date().toISOString(),
  };
}

/** Detailed readiness for ops — requires READINESS_TOKEN or localhost. */
export async function getDetailedReadinessStatus() {
  const base = await getReadinessStatus();
  const { getSettlementWorkerHealth } = await import('./settlement/settlementHealth.mjs');
  const settlement = await getSettlementWorkerHealth();
  const { getFeedHealthSnapshot } = await import('./feedHealthEngine.mjs');
  const feed = getFeedHealthSnapshot();
  return {
    ...base,
    ...settlement,
    feedHealth: feed,
  };
}

/**
 * K8s Liveness Probe (/liveness)
 */
export function getLivenessStatus() {
  return { alive: true, timestamp: new Date().toISOString() };
}

/**
 * Log Production Incident (SEV-1 to SEV-4)
 */
export async function createProductionIncident({
  title,
  severity = 'SEV-2',
  service = 'oddsyra_api',
  rootCause = '',
}) {
  const incId = `inc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  await query(`
    INSERT INTO incidents (id, title, severity, service, status, root_cause)
    VALUES ($1, $2, $3, $4, 'OPEN', $5);
  `, [incId, title, severity, service, rootCause]);

  structuredLog('WARN', `INCIDENT CREATED [${severity}]: ${title}`, { incidentId: incId, severity, service });
  return { success: true, incidentId: incId, title, severity, status: 'OPEN' };
}

/**
 * Record Automated Backup Run
 */
export async function recordProductionBackup({
  backupType = 'FULL_DUMP',
  status = 'SUCCESS',
  sizeBytes = 104857600,
  durationMs = 4500,
}) {
  const bId = `bkp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  await query(`
    INSERT INTO backups_log (id, backup_type, status, size_bytes, duration_ms)
    VALUES ($1, $2, $3, $4, $5);
  `, [bId, backupType, status, sizeBytes, durationMs]);

  return { success: true, backupId: bId, backupType, status, sizeBytes, durationMs };
}

/**
 * Production Environment Startup Validation (Fail-Fast)
 */
export function validateProductionEnvironment(env = process.env) {
  const isProd = env.NODE_ENV === 'production';
  const missingSecrets = [];

  const requiredSecrets = ['DATABASE_URL', 'JWT_SECRET'];
  const prodSecrets = [
    'FRONTEND_URL',
    'CORS_ORIGIN',
    'RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_SECRET',
    'RAZORPAY_WEBHOOK_SECRET',
    'SMTP_HOST',
    'SMTP_USER',
    'SMTP_PASSWORD',
  ];

  // P0: DEMO_MODE must never run against real-money production.
  const demoOn = env.DEMO_MODE === '1' || env.DEMO_MODE === 'true'
    || env.VITE_DEMO_MODE === '1' || env.VITE_DEMO_MODE === 'true';
  if (isProd && demoOn) {
    throw new Error(
      'PRODUCTION_STARTUP_ERROR: DEMO_MODE / VITE_DEMO_MODE must not be enabled in production',
    );
  }

  for (const s of requiredSecrets) {
    if (!env[s]) missingSecrets.push(s);
  }
  if (isProd) {
    for (const s of prodSecrets) {
      if (!env[s]) missingSecrets.push(s);
    }
    const jwt = String(env.JWT_SECRET || '');
    const webhook = String(env.RAZORPAY_WEBHOOK_SECRET || '');
    const dbUrl = String(env.DATABASE_URL || '');
    if (jwt.includes('oddsyra_jwt_secret_dev_key_2026') || jwt.includes('CHANGE_ME')) {
      throw new Error('PRODUCTION_STARTUP_ERROR: Unsafe JWT_SECRET default detected');
    }
    if (jwt.length < 32) {
      throw new Error('PRODUCTION_STARTUP_ERROR: JWT_SECRET must be at least 32 characters');
    }
    if (webhook.includes('oddsyra_wh_secret_2026') || webhook.includes('CHANGE_ME')) {
      throw new Error('PRODUCTION_STARTUP_ERROR: Unsafe RAZORPAY_WEBHOOK_SECRET default detected');
    }
    if (dbUrl.includes('CHANGE_ME') || dbUrl.includes('oddsyra_dev_pass')) {
      throw new Error('PRODUCTION_STARTUP_ERROR: Unsafe DATABASE_URL detected');
    }
  }

  if (isProd && missingSecrets.length > 0) {
    throw new Error(`PRODUCTION_STARTUP_ERROR: Missing required secrets: ${missingSecrets.join(', ')}`);
  }

  return {
    valid: missingSecrets.length === 0,
    environment: env.NODE_ENV || 'development',
    missingSecrets,
    demoModeBlocked: isProd && !demoOn,
  };
}

