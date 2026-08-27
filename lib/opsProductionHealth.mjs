/**
 * Production Health — reuses requestMetrics, devops health, settlement, outbox.
 * Never exposes secrets. Unavailable metrics → null / N/A at API layer.
 */

import { query } from '../db/pg.js';
import { getSystemHealthStatus } from './devopsEngine.mjs';
import { renderPrometheusMetrics } from './requestMetrics.mjs';

function parseHttpCounters(promText) {
  let count4xx = null;
  let count5xx = null;
  let requestCount = 0;
  let totalMs = 0;
  const lines = String(promText || '').split('\n');
  for (const line of lines) {
    if (line.startsWith('http_requests_4xx_total ')) {
      count4xx = Number(line.split(' ')[1]);
    } else if (line.startsWith('http_requests_5xx_total ')) {
      count5xx = Number(line.split(' ')[1]);
    } else if (line.startsWith('http_requests_total{')) {
      const n = Number(line.split(' ').pop());
      if (!Number.isNaN(n)) requestCount += n;
    } else if (line.startsWith('http_request_duration_ms_sum{')) {
      const n = Number(line.split(' ').pop());
      if (!Number.isNaN(n)) totalMs += n;
    }
  }
  return {
    requestCount: requestCount || null,
    error4xx: count4xx,
    error5xx: count5xx,
    avgLatencyMs: requestCount > 0 ? Math.round(totalMs / requestCount) : null,
    p95LatencyMs: null,
  };
}

async function safeCount(sql) {
  try {
    const r = await query(sql);
    return Number(r.rows[0]?.c ?? 0);
  } catch {
    return null;
  }
}

function deriveOverall(parts) {
  if (parts.database === 'DOWN') return 'CRITICAL';
  if (parts.database === 'UNKNOWN' && parts.application === 'UNKNOWN') return 'UNKNOWN';
  if (parts.database === 'DEGRADED' || parts.jobs === 'DEGRADED' || parts.betting === 'DEGRADED') {
    return 'WARNING';
  }
  if (parts.application === 'DEGRADED' || parts.finance === 'WARNING') return 'WARNING';
  if (
    parts.database === 'HEALTHY'
    && (parts.application === 'HEALTHY' || parts.application === 'UNKNOWN')
  ) {
    return 'HEALTHY';
  }
  return parts.database || 'UNKNOWN';
}

export async function buildProductionHealth() {
  const sys = await getSystemHealthStatus().catch(() => null);
  const http = parseHttpCounters(renderPrometheusMetrics());

  let settlement = null;
  try {
    const { getSettlementWorkerHealth } = await import('./settlement/settlementHealth.mjs');
    settlement = await getSettlementWorkerHealth();
  } catch {
    settlement = null;
  }

  let feed = null;
  try {
    const { getFeedHealthSnapshot } = await import('./feedHealthEngine.mjs');
    feed = getFeedHealthSnapshot();
  } catch {
    feed = null;
  }

  const [
    outboxPending,
    outboxFailed,
    outboxProcessed,
    wdPending,
    wdFailed,
    reconOpen,
    depositFailToday,
    betFailToday,
    openCritical,
  ] = await Promise.all([
    safeCount(`SELECT COUNT(*)::int AS c FROM outbox_events WHERE UPPER(status)='PENDING'`),
    safeCount(`SELECT COUNT(*)::int AS c FROM outbox_events WHERE UPPER(status) IN ('FAILED','DEAD_LETTER')`),
    safeCount(`SELECT COUNT(*)::int AS c FROM outbox_events WHERE UPPER(status) IN ('PROCESSED','COMPLETED')`),
    safeCount(
      `SELECT COUNT(*)::int AS c FROM withdrawals
       WHERE UPPER(status) IN ('PENDING_REVIEW','HOLD','PENDING_CHECKER')`,
    ),
    safeCount(
      `SELECT COUNT(*)::int AS c FROM withdrawals
       WHERE UPPER(status) IN ('FAILED','REJECTED')
         AND COALESCE(updated_at, created_at) >= NOW() - INTERVAL '1 hour'`,
    ),
    safeCount(`SELECT COUNT(*)::int AS c FROM reconciliation_cases WHERE UPPER(status)='OPEN'`),
    safeCount(
      `SELECT COUNT(*)::int AS c FROM transactions
       WHERE UPPER(type) IN ('DEPOSIT','CREDIT') AND UPPER(status) IN ('FAILED','FAILURE')
         AND created_at >= date_trunc('day', NOW())`,
    ),
    safeCount(
      `SELECT COUNT(*)::int AS c FROM bets
       WHERE UPPER(status) IN ('REJECTED','FAILED') AND created_at >= date_trunc('day', NOW())`,
    ),
    safeCount(
      `SELECT COUNT(*)::int AS c FROM admin_notifications
       WHERE UPPER(COALESCE(status,'OPEN'))='OPEN'
         AND UPPER(COALESCE(severity,''))='CRITICAL'`,
    ),
  ]);

  const pgStatus = sys?.checks?.postgres?.status || 'UNKNOWN';
  const dbLatency = sys?.checks?.postgres?.latencyMs ?? null;

  let migrationStatus = null;
  try {
    const m = await query(
      `SELECT COUNT(*)::int AS c FROM schema_migrations`,
    ).catch(() => query(`SELECT COUNT(*)::int AS c FROM migrations`));
    migrationStatus = m?.rows?.[0]?.c != null ? `${m.rows[0].c} applied` : 'N/A';
  } catch {
    migrationStatus = 'N/A';
  }

  const jobsStatus = outboxFailed != null && outboxFailed > 10
    ? 'DEGRADED'
    : outboxPending != null && outboxPending > 200
      ? 'WARNING'
      : outboxPending == null
        ? 'UNKNOWN'
        : 'HEALTHY';

  const bettingStatus = (settlement?.failedJobs > 0 || (feed?.providers || []).some((p) => p.healthStatus === 'UNHEALTHY'))
    ? 'DEGRADED'
    : settlement || feed
      ? 'HEALTHY'
      : 'UNKNOWN';

  const financeStatus = (reconOpen > 0 || (wdFailed != null && wdFailed > 5))
    ? 'WARNING'
    : 'HEALTHY';

  const appStatus = http.error5xx != null && http.error5xx > 20
    ? 'DEGRADED'
    : 'HEALTHY';

  const parts = {
    application: appStatus,
    database: pgStatus === 'DOWN' ? 'DOWN' : pgStatus === 'HEALTHY' ? 'HEALTHY' : pgStatus || 'UNKNOWN',
    jobs: jobsStatus,
    betting: bettingStatus,
    finance: financeStatus,
  };

  const overall = deriveOverall(parts);

  let securityCounters = {
    failedAuthentication: null,
    authorizationFailures: null,
    csrfFailures: null,
  };
  try {
    const { getSecurityCounters } = await import('./requestMetrics.mjs');
    const sc = getSecurityCounters();
    securityCounters = {
      failedAuthentication: sc.authFailures,
      authorizationFailures: sc.authorizationFailures,
      csrfFailures: sc.csrfFailures,
    };
  } catch {
    /* leave nulls */
  }

  return {
    success: true,
    overall,
    lastUpdated: new Date().toISOString(),
    application: {
      uptimeSeconds: typeof process.uptime === 'function' ? Math.round(process.uptime()) : null,
      requestCount: http.requestCount,
      errorCount: http.error4xx != null && http.error5xx != null
        ? http.error4xx + http.error5xx
        : null,
      errorRate: http.requestCount
        ? Number((((http.error4xx || 0) + (http.error5xx || 0)) / http.requestCount).toFixed(4))
        : null,
      averageLatencyMs: http.avgLatencyMs,
      p95LatencyMs: http.p95LatencyMs,
      count5xx: http.error5xx,
      count4xx: http.error4xx,
      status: appStatus,
    },
    database: {
      connectionStatus: pgStatus,
      connectionPoolStatus: null,
      queryErrors: null,
      latencyMs: dbLatency,
      migrationStatus,
      redisStatus: sys?.checks?.redis?.status ?? null,
      status: parts.database,
    },
    backgroundJobs: {
      pending: outboxPending,
      failed: outboxFailed,
      completed: outboxProcessed,
      active: sys?.checks?.outboxQueue?.pending ?? outboxPending,
      retryCount: null,
      status: jobsStatus,
    },
    betting: {
      betPlacementFailuresToday: betFailToday,
      settlementPending: settlement?.pendingJobs ?? settlement?.queueDepth ?? null,
      settlementFailed: settlement?.failedJobs ?? null,
      oddsFreshness: feed?.overallStatus || feed?.status || null,
      status: bettingStatus,
    },
    finance: {
      withdrawalFailuresRecent: wdFailed,
      pendingWithdrawals: wdPending,
      reconciliationDiscrepancies: reconOpen,
      depositFailuresToday: depositFailToday,
      status: financeStatus,
    },
    security: {
      ...securityCounters,
      suspiciousAdminActions: null,
      openCriticalAlerts: openCritical,
      note: 'Process-local counters since process start. Null = unavailable.',
    },
    note: 'Real metrics only. Null fields are unavailable — display as N/A. No secrets exposed.',
  };
}
