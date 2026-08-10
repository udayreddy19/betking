/**
 * Enterprise Audit Engine — Immutable Audit Trail Architecture
 * Records structured audit events for odds changes, manual overrides, wallet transactions & settlement.
 */

class EnterpriseAuditEngine {
  constructor() {
    this.logs = [];
  }

  /** Record an immutable audit log entry */
  recordEvent({
    who = 'system',
    what = 'action',
    when = new Date().toISOString(),
    before = null,
    after = null,
    reason = '',
    source = 'application',
    referenceId = '',
  }) {
    const entry = {
      auditId: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      who,
      what,
      when,
      before,
      after,
      reason,
      source,
      referenceId,
    };

    this.logs.push(entry);
    return entry;
  }

  /** Query audit log by referenceId or category */
  getLogs({ referenceId, category, limit = 100 } = {}) {
    let result = this.logs;
    if (referenceId) {
      result = result.filter((l) => l.referenceId === referenceId);
    }
    if (category) {
      result = result.filter((l) => l.what.startsWith(category));
    }
    return result.slice(-limit);
  }

  clear() {
    this.logs = [];
  }
}

export const enterpriseAuditEngine = new EnterpriseAuditEngine();
