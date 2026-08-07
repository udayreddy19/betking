/**
 * Enterprise Audit Engine — BetKing Sportsbook (lib/auditEngine.mjs)
 * Provides searchable audit logs for odds changes, manual overrides, wallet transactions,
 * settlements, admin logins, RBAC permission changes, API calls, and market status updates.
 */

const AUDIT_LOG_BUFFER = [];

export function logAuditEvent(auditRecord = {}) {
  const entry = {
    id: `audit_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    category: auditRecord.category || 'SYSTEM', // 'ODDS_OVERRIDE', 'WALLET', 'SETTLEMENT', 'ADMIN_LOGIN'
    actor: auditRecord.actor || 'ADMIN',
    details: auditRecord.details || {},
    timestamp: Date.now(),
    isoTime: new Date().toISOString(),
  };

  AUDIT_LOG_BUFFER.push(entry);
  if (AUDIT_LOG_BUFFER.length > 2000) AUDIT_LOG_BUFFER.shift();
  return entry;
}

export function searchAuditLogs(query = {}) {
  return AUDIT_LOG_BUFFER.filter((log) => {
    if (query.category && log.category !== query.category) return false;
    if (query.actor && log.actor !== query.actor) return false;
    return true;
  }).slice(-100);
}
