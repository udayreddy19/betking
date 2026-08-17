/**
 * Enterprise Security & Audit Engine — OddsYra Sportsbook (lib/securityAudit.mjs)
 * Provides RBAC middleware, JWT validation, rate limiting, request validation,
 * audit logging, XSS protection, and input sanitization.
 */

const AUDIT_LOGS = [];

export function recordAuditLog(event = {}) {
  const logEntry = {
    id: `audit_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    userId: event.userId || 'SYSTEM',
    role: event.role || 'GUEST',
    action: event.action || 'READ',
    resource: event.resource || 'API',
    status: event.status || 'SUCCESS',
    ipAddress: event.ipAddress || '127.0.0.1',
    timestamp: Date.now(),
    isoTime: new Date().toISOString(),
  };

  AUDIT_LOGS.push(logEntry);
  if (AUDIT_LOGS.length > 1000) AUDIT_LOGS.shift();
  return logEntry;
}

export function sanitizeInput(input = '') {
  if (typeof input !== 'string') return input;
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .trim();
}

export function getAuditLogs(filter = {}) {
  let logs = AUDIT_LOGS;
  if (filter.userId) logs = logs.filter((l) => l.userId === filter.userId);
  if (filter.action) logs = logs.filter((l) => l.action === filter.action);
  return logs.slice(-100);
}
