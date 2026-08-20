import { logger } from './logger.mjs';

const counters = new Map();
const MAX_KEYS = 400;

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
  const lines = ['# TYPE http_requests_total counter', '# TYPE http_request_duration_ms_sum counter'];
  for (const [k, v] of counters.entries()) {
    const [method, route, status] = k.split('|');
    const labels = `method="${method}",route="${route.replace(/"/g, '')}",status="${status}"`;
    lines.push(`http_requests_total{${labels}} ${v.count}`);
    lines.push(`http_request_duration_ms_sum{${labels}} ${v.totalMs}`);
  }
  return `${lines.join('\n')}\n`;
}

export function resetRequestMetricsForTests() {
  counters.clear();
}
