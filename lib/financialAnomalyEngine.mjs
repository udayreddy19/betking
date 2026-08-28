/**
 * Financial anomaly read-model — aggregates existing risk/recon/withdrawal signals.
 * Does not invent balances or auto-freeze funds.
 */

import { queryRead } from '../db/pg.js';

function severityRank(s) {
  const m = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
  return m[String(s || '').toUpperCase()] || 0;
}

/**
 * List financial anomalies from authoritative tables (bounded).
 */
export async function listFinancialAnomalies({ limit = 50, severity = null } = {}) {
  const lim = Math.min(100, Math.max(1, Number(limit) || 50));
  const anomalies = [];

  try {
    const recon = await queryRead(
      `SELECT id, entity_type, entity_id, status, severity, difference, detected_at, notes
       FROM reconciliation_cases
       WHERE status IN ('OPEN', 'INVESTIGATING')
       ORDER BY detected_at DESC
       LIMIT $1`,
      [lim],
    );
    for (const r of recon.rows) {
      anomalies.push({
        id: `recon_${r.id}`,
        type: 'RECONCILIATION_DISCREPANCY',
        severity: String(r.severity || 'MEDIUM').toUpperCase(),
        status: r.status,
        detectedAt: r.detected_at,
        affectedEntity: r.entity_id,
        entityType: r.entity_type || 'unknown',
        evidence: {
          caseId: r.id,
          difference: r.difference,
          notes: r.notes,
        },
        links: {
          finance: '/admin/finance/finance-health',
          customer360: r.entity_type === 'USER' || r.entity_type === 'user'
            ? `/admin/customers/customer-360?userId=${r.entity_id}`
            : null,
        },
      });
    }
  } catch {
    /* table may not exist in all envs */
  }

  try {
    const wd = await queryRead(
      `SELECT withdrawal_id, user_id, amount, status, risk_level, risk_score, risk_signals, created_at
       FROM withdrawals
       WHERE COALESCE(risk_level, '') IN ('HIGH', 'CRITICAL')
          OR status IN ('HELD', 'ON_HOLD', 'PENDING_REVIEW')
       ORDER BY created_at DESC
       LIMIT $1`,
      [lim],
    );
    for (const r of wd.rows) {
      anomalies.push({
        id: `wd_${r.withdrawal_id}`,
        type: 'HIGH_RISK_WITHDRAWAL',
        severity: String(r.risk_level || 'HIGH').toUpperCase(),
        status: r.status,
        detectedAt: r.created_at,
        affectedEntity: r.user_id,
        entityType: 'user',
        evidence: {
          withdrawalId: r.withdrawal_id,
          amount: r.amount,
          riskScore: r.risk_score,
          signals: r.risk_signals,
        },
        links: {
          finance: '/admin/finance/maker-checker',
          risk: '/admin/trading-risk/fraud-signals',
          customer360: `/admin/customers/customer-360?userId=${r.user_id}`,
        },
      });
    }
  } catch {
    /* ignore */
  }

  try {
    const failed = await queryRead(
      `SELECT transaction_id, user_id, type, amount, status, created_at
       FROM transactions
       WHERE status IN ('FAILED', 'FAILURE')
         AND created_at >= NOW() - INTERVAL '7 days'
       ORDER BY created_at DESC
       LIMIT $1`,
      [Math.min(lim, 25)],
    );
    for (const r of failed.rows) {
      anomalies.push({
        id: `txfail_${r.transaction_id}`,
        type: 'TRANSACTION_FAILURE',
        severity: 'MEDIUM',
        status: r.status,
        detectedAt: r.created_at,
        affectedEntity: r.user_id,
        entityType: 'user',
        evidence: {
          transactionId: r.transaction_id,
          type: r.type,
          amount: r.amount,
        },
        links: {
          finance: '/admin/finance/control-center',
          customer360: r.user_id ? `/admin/customers/customer-360?userId=${r.user_id}` : null,
        },
      });
    }
  } catch {
    /* ignore */
  }

  try {
    const promo = await queryRead(
      `SELECT alert_id, user_id, risk_level, status, rule_key, signals, created_at, notes
       FROM promo_abuse_alerts
       WHERE status IN ('OPEN', 'ACKNOWLEDGED')
       ORDER BY created_at DESC
       LIMIT $1`,
      [Math.min(lim, 25)],
    );
    for (const r of promo.rows) {
      anomalies.push({
        id: `promo_${r.alert_id}`,
        type: 'PROMO_ABUSE',
        severity: String(r.risk_level || 'MEDIUM').toUpperCase(),
        status: r.status,
        detectedAt: r.created_at,
        affectedEntity: r.user_id,
        entityType: 'user',
        evidence: {
          alertId: r.alert_id,
          ruleKey: r.rule_key,
          signals: r.signals,
          notes: r.notes,
        },
        links: {
          growth: '/admin/growth/promo-abuse',
          customer360: r.user_id ? `/admin/customers/customer-360?userId=${r.user_id}` : null,
        },
      });
    }
  } catch {
    /* ignore */
  }

  let filtered = anomalies;
  if (severity) {
    const sev = String(severity).toUpperCase();
    filtered = anomalies.filter((a) => a.severity === sev);
  }

  filtered.sort((a, b) => {
    const d = severityRank(b.severity) - severityRank(a.severity);
    if (d !== 0) return d;
    return new Date(b.detectedAt) - new Date(a.detectedAt);
  });

  return {
    success: true,
    count: filtered.length,
    anomalies: filtered.slice(0, lim),
    note: 'Aggregated from reconciliation_cases, high-risk withdrawals, failed transactions, promo abuse. No fabricated sample rows.',
    generatedAt: new Date().toISOString(),
  };
}
