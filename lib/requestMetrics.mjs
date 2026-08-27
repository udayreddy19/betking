import { logger } from './logger.mjs';

const counters = new Map();
const MAX_KEYS = 400;

const securityCounters = {
  authFailures: 0,
  authorizationFailures: 0,
  csrfFailures: 0,
};

export function observeSecurityEvent(kind) {
  const k = String(kind || '').toLowerCase();
  if (k === 'auth' || k === 'authentication') securityCounters.authFailures += 1;
  else if (k === 'authorization' || k === 'rbac') securityCounters.authorizationFailures += 1;
  else if (k === 'csrf') securityCounters.csrfFailures += 1;
}

export function getSecurityCounters() {
  return { ...securityCounters };
}

export function resetSecurityCountersForTests() {
  securityCounters.authFailures = 0;
  securityCounters.authorizationFailures = 0;
  securityCounters.csrfFailures = 0;
}

function key(method, route, status) {
  return `${method}|${route}|${status}`;
}

export function observeHttpRequest({ method, route, status, ms }) {
  const k = key(String(method || 'GET').toUpperCase(), route || '/', Number(status) || 0);
  const prev = counters.get(k) || { count: 0, totalMs: 0 };
  prev.count += 1;
  prev.totalMs += Number(ms) || 0;
  counters.set(k, prev);
  if (counters.size > MAX_KEYS) {
    const first = counters.keys().next().value;
    counters.delete(first);
  }
}

function sanitizePath(url) {
  const path = String(url || '/').split('?')[0];
  return path.replace(/\/[0-9a-f-]{8,}/gi, '/:id').slice(0, 160);
}

export function requestMetricsMiddleware(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const route = sanitizePath(req.originalUrl || req.url);
    const ms = Date.now() - start;
    observeHttpRequest({ method: req.method, route, status: res.statusCode, ms });
    if (route !== '/metrics' && route !== '/liveness') {
      logger.info('http_request', {
        method: req.method,
        path: route,
        status: res.statusCode,
        ms,
        correlationId: req.correlationId,
      });
    }
  });
  next();
}

export function renderPrometheusMetrics() {
  const lines = [
    '# TYPE http_requests_total counter',
    '# TYPE http_request_duration_ms_sum counter',
    '# TYPE http_requests_4xx_total counter',
    '# TYPE http_requests_5xx_total counter',
  ];
  let count4xx = 0;
  let count5xx = 0;
  for (const [k, v] of counters.entries()) {
    const [method, route, status] = k.split('|');
    const statusNum = Number(status);
    if (statusNum >= 400 && statusNum < 500) count4xx += v.count;
    if (statusNum >= 500) count5xx += v.count;
    const labels = `method="${method}",route="${route.replace(/"/g, '')}",status="${status}"`;
    lines.push(`http_requests_total{${labels}} ${v.count}`);
    lines.push(`http_request_duration_ms_sum{${labels}} ${v.totalMs}`);
  }
  lines.push(`http_requests_4xx_total ${count4xx}`);
  lines.push(`http_requests_5xx_total ${count5xx}`);
  return `${lines.join('\n')}\n`;
}

/** Append ops gauges from existing health engines (best-effort). */
export async function renderExtendedPrometheusMetrics() {
  const base = renderPrometheusMetrics();
  const extra = [];
  try {
    const { getSettlementWorkerHealth } = await import('./settlement/settlementHealth.mjs');
    const s = await getSettlementWorkerHealth();
    extra.push(`# TYPE settlement_queue_depth gauge`);
    extra.push(`settlement_queue_depth ${Number(s?.pendingJobs ?? s?.queueDepth ?? 0)}`);
    extra.push(`settlement_failed_jobs ${Number(s?.failedJobs ?? 0)}`);
  } catch { /* optional */ }
  try {
    const { query } = await import('../db/pg.js');
    const ob = await query(`SELECT COUNT(*)::int AS c FROM outbox_events WHERE status = 'PENDING'`);
    extra.push(`# TYPE outbox_pending_depth gauge`);
    extra.push(`outbox_pending_depth ${Number(ob.rows[0]?.c || 0)}`);
    const failed = await query(`SELECT COUNT(*)::int AS c FROM outbox_events WHERE status = 'FAILED'`);
    extra.push(`outbox_failed_total ${Number(failed.rows[0]?.c || 0)}`);
  } catch { /* optional */ }
  try {
    const { getFeedHealthSnapshot } = await import('./feedHealthEngine.mjs');
    const feed = getFeedHealthSnapshot();
    const unhealthy = (feed?.providers || []).filter((p) => p.healthStatus === 'UNHEALTHY').length;
    extra.push(`# TYPE feed_providers_unhealthy gauge`);
    extra.push(`feed_providers_unhealthy ${unhealthy}`);
  } catch { /* optional */ }
  try {
    const { getOddsFreshnessConfig } = await import('./oddsFreshnessConfig.mjs');
    const cfg = getOddsFreshnessConfig();
    extra.push(`# TYPE odds_live_stale_threshold_ms gauge`);
    extra.push(`odds_live_stale_threshold_ms ${cfg.liveStaleThresholdMs}`);
  } catch { /* optional */ }
  return `${base}${extra.length ? `${extra.join('\n')}\n` : ''}`;
}

export function resetRequestMetricsForTests() {
  counters.clear();
}
