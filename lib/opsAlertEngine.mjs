/**
 * Ops Alert Engine — extends admin_notifications (no parallel alert platform).
 * FAIL-SAFE: never throw into financial/betting hot paths. Callers should still try/catch.
 */

import crypto from 'crypto';
import { query } from '../db/pg.js';
import { broadcastWsMessage } from './websocketEngine.mjs';

const DEFAULT_COOLDOWN_SEC = 600;

export async function ensureOpsAlertSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS admin_notifications (
      notification_id VARCHAR(64) PRIMARY KEY,
      admin_id VARCHAR(64) NOT NULL,
      title VARCHAR(255) NOT NULL,
      message TEXT,
      category VARCHAR(64) DEFAULT 'INFO',
      priority VARCHAR(16) DEFAULT 'NORMAL',
      action_type VARCHAR(64),
      action_target_type VARCHAR(64),
      action_target_id VARCHAR(128),
      action_label VARCHAR(64),
      is_read BOOLEAN DEFAULT FALSE,
      is_actioned BOOLEAN DEFAULT FALSE,
      action_note TEXT,
      tenant_id VARCHAR(64) DEFAULT 'oddsyra_in',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `).catch(() => null);
  const cols = [
    `ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'OPEN'`,
    `ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS severity VARCHAR(16) DEFAULT 'WARNING'`,
    `ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS dedupe_key VARCHAR(160)`,
    `ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS occurrence_count INT DEFAULT 1`,
    `ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS source VARCHAR(64)`,
    `ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS entity_type VARCHAR(64)`,
    `ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS entity_id VARCHAR(128)`,
    `ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS acknowledged_by VARCHAR(64)`,
    `ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ`,
    `ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS resolved_by VARCHAR(64)`,
    `ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ`,
    `ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS last_occurrence_at TIMESTAMPTZ`,
    `ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb`,
  ];
  for (const sql of cols) {
    await query(sql).catch(() => null);
  }
}

function mapSeverity(sev) {
  const s = String(sev || 'WARNING').toUpperCase();
  if (['INFO', 'WARNING', 'HIGH', 'CRITICAL'].includes(s)) return s;
  if (s === 'NORMAL' || s === 'LOW') return 'INFO';
  return 'WARNING';
}

/**
 * Raise or bump an ops alert. Returns { recorded, alertId, bumped }.
 * Never throws for normal DB issues when soft=true (default).
 */
export async function raiseOpsAlert({
  title,
  message,
  severity = 'WARNING',
  category = 'SYSTEM',
  source = 'ops',
  entityType = null,
  entityId = null,
  dedupeKey = null,
  metadata = {},
  actionType = null,
  actionTargetType = null,
  actionTargetId = null,
  actionLabel = null,
  adminId = 'admin',
  cooldownSeconds = DEFAULT_COOLDOWN_SEC,
  soft = true,
} = {}) {
  try {
    await ensureOpsAlertSchema();
    const sev = mapSeverity(severity);
    const key = dedupeKey
      || [category, source, entityType || 'x', entityId || 'x', String(title || '').slice(0, 40)]
        .join(':')
        .slice(0, 160);

    // Dedupe: bump open alert within cooldown
    const existing = await query(
      `SELECT notification_id, occurrence_count, last_occurrence_at, created_at
       FROM admin_notifications
       WHERE dedupe_key = $1
         AND UPPER(COALESCE(status,'OPEN')) = 'OPEN'
       ORDER BY created_at DESC
       LIMIT 1`,
      [key],
    ).catch(() => ({ rows: [] }));

    const open = existing.rows[0];
    if (open) {
      const last = new Date(open.last_occurrence_at || open.created_at).getTime();
      const within = Date.now() - last < (Number(cooldownSeconds) || DEFAULT_COOLDOWN_SEC) * 1000;
      if (within) {
        await query(
          `UPDATE admin_notifications SET
             occurrence_count = COALESCE(occurrence_count,1) + 1,
             last_occurrence_at = NOW(),
             message = $2,
             severity = $3,
             metadata = COALESCE(metadata,'{}'::jsonb) || $4::jsonb
           WHERE notification_id = $1`,
          [open.notification_id, message || open.message, sev, JSON.stringify(metadata || {})],
        ).catch(() => null);
        return {
          recorded: true,
          bumped: true,
          alertId: open.notification_id,
          occurrenceCount: Number(open.occurrence_count || 1) + 1,
        };
      }
    }

    const id = `anot_${crypto.randomBytes(8).toString('hex')}`;
    await query(
      `INSERT INTO admin_notifications (
         notification_id, admin_id, title, message, category, priority,
         action_type, action_target_type, action_target_id, action_label,
         status, severity, dedupe_key, occurrence_count, source,
         entity_type, entity_id, last_occurrence_at, metadata, created_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,
         $7,$8,$9,$10,
         'OPEN',$11,$12,1,$13,
         $14,$15,NOW(),$16::jsonb,NOW()
       )`,
      [
        id,
        adminId || 'admin',
        String(title || 'Ops alert').slice(0, 255),
        message || null,
        String(category || 'SYSTEM').slice(0, 64),
        sev === 'CRITICAL' || sev === 'HIGH' ? 'HIGH' : 'NORMAL',
        actionType,
        actionTargetType || entityType,
        actionTargetId || entityId,
        actionLabel,
        sev,
        key,
        String(source || 'ops').slice(0, 64),
        entityType,
        entityId,
        JSON.stringify(metadata || {}),
      ],
    );

    try {
      broadcastWsMessage('admin.alert.created', {
        notificationId: id,
        title,
        message,
        severity: sev,
        category,
        entityType,
        entityId,
        timestamp: new Date().toISOString(),
      });
    } catch { /* non-blocking */ }

    return { recorded: true, bumped: false, alertId: id, occurrenceCount: 1 };
  } catch (err) {
    if (!soft) throw err;
    return { recorded: false, error: err.message };
  }
}

export async function listOpsAlerts({
  status = null,
  severity = null,
  category = null,
  limit = 50,
  offset = 0,
} = {}) {
  await ensureOpsAlertSchema();
  const params = [];
  const conds = [];
  if (status) {
    params.push(String(status).toUpperCase());
    conds.push(`UPPER(COALESCE(status,'OPEN')) = $${params.length}`);
  }
  if (severity) {
    params.push(String(severity).toUpperCase());
    conds.push(`UPPER(COALESCE(severity, priority, 'WARNING')) = $${params.length}`);
  }
  if (category) {
    params.push(String(category).toUpperCase());
    conds.push(`UPPER(COALESCE(category,'')) = $${params.length}`);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  params.push(Math.min(200, Math.max(1, Number(limit) || 50)));
  params.push(Math.max(0, Number(offset) || 0));
  const res = await query(
    `SELECT * FROM admin_notifications
     ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { success: true, alerts: res.rows, count: res.rows.length };
}

export async function transitionOpsAlert(alertId, {
  status,
  adminId = 'admin',
  note = null,
} = {}) {
  const next = String(status || '').toUpperCase();
  if (!['ACKNOWLEDGED', 'RESOLVED', 'DISMISSED', 'OPEN'].includes(next)) {
    throw Object.assign(new Error('Invalid alert status'), { status: 400, code: 'INVALID_STATUS' });
  }
  await ensureOpsAlertSchema();
  const sets = [
    'status = $1',
    'is_read = TRUE',
    'action_note = COALESCE($3, action_note)',
  ];
  const params = [next, alertId, note];
  if (next === 'ACKNOWLEDGED') {
    sets.push('acknowledged_by = $4', 'acknowledged_at = NOW()', 'is_actioned = FALSE');
    params.push(adminId);
  } else if (next === 'RESOLVED' || next === 'DISMISSED') {
    sets.push('resolved_by = $4', 'resolved_at = NOW()', 'is_actioned = TRUE');
    params.push(adminId);
  } else {
    params.push(adminId);
  }
  const res = await query(
    `UPDATE admin_notifications SET ${sets.join(', ')}
     WHERE notification_id = $2
     RETURNING *`,
    params,
  );
  if (!res.rows[0]) throw Object.assign(new Error('Alert not found'), { status: 404 });
  return { success: true, alert: res.rows[0] };
}

export async function listOpsAlertRules() {
  const res = await query(
    `SELECT * FROM ops_alert_rules ORDER BY category, rule_key`,
  ).catch(() => ({ rows: [] }));
  return { success: true, rules: res.rows };
}

export async function updateOpsAlertRule(ruleId, patch = {}) {
  const res = await query(
    `UPDATE ops_alert_rules SET
       threshold_count = COALESCE($2, threshold_count),
       window_seconds = COALESCE($3, window_seconds),
       cooldown_seconds = COALESCE($4, cooldown_seconds),
       severity = COALESCE($5, severity),
       enabled = COALESCE($6, enabled),
       updated_at = NOW()
     WHERE rule_id = $1 OR rule_key = $1
     RETURNING *`,
    [
      ruleId,
      patch.thresholdCount ?? null,
      patch.windowSeconds ?? null,
      patch.cooldownSeconds ?? null,
      patch.severity ? String(patch.severity).toUpperCase() : null,
      typeof patch.enabled === 'boolean' ? patch.enabled : null,
    ],
  );
  if (!res.rows[0]) throw Object.assign(new Error('Rule not found'), { status: 404 });
  return { success: true, rule: res.rows[0] };
}

/**
 * Evaluate a few threshold rules from aggregate counts (lightweight, indexed-friendly).
 * Non-blocking for callers.
 */
export async function evaluateOpsThresholds() {
  const results = [];
  try {
    const rules = await listOpsAlertRules();
    for (const rule of rules.rules || []) {
      if (!rule.enabled) continue;
      const key = String(rule.rule_key || '');
      let count = 0;
      let entityType = null;
      let entityId = null;
      if (key === 'RECONCILIATION_DISCREPANCY') {
        const r = await query(
          `SELECT COUNT(*)::int AS c FROM reconciliation_cases WHERE UPPER(status)='OPEN'`,
        ).catch(() => ({ rows: [{ c: 0 }] }));
        count = Number(r.rows[0]?.c || 0);
      } else if (key === 'OUTBOX_BACKLOG') {
        const r = await query(
          `SELECT COUNT(*)::int AS c FROM outbox_events WHERE UPPER(status)='PENDING'`,
        ).catch(() => ({ rows: [{ c: 0 }] }));
        count = Number(r.rows[0]?.c || 0);
      } else if (key === 'WITHDRAWAL_HIGH_RISK_CLUSTER') {
        const win = Number(rule.window_seconds || 900);
        const r = await query(
          `SELECT COUNT(*)::int AS c FROM withdrawals
           WHERE UPPER(COALESCE(risk_level,'')) IN ('HIGH','CRITICAL')
             AND created_at > NOW() - ($1::int * INTERVAL '1 second')`,
          [win],
        ).catch(() => ({ rows: [{ c: 0 }] }));
        count = Number(r.rows[0]?.c || 0);
      } else if (key === 'PROMO_ABUSE_SPIKE') {
        const win = Number(rule.window_seconds || 600);
        const r = await query(
          `SELECT COUNT(*)::int AS c FROM promo_abuse_alerts
           WHERE created_at > NOW() - ($1::int * INTERVAL '1 second')`,
          [win],
        ).catch(() => ({ rows: [{ c: 0 }] }));
        count = Number(r.rows[0]?.c || 0);
      } else if (key === 'SETTLEMENT_FAILURE_SPIKE') {
        const win = Number(rule.window_seconds || 300);
        const r = await query(
          `SELECT COUNT(*)::int AS c FROM settlement_jobs
           WHERE UPPER(COALESCE(status,'')) IN ('FAILED','DEAD')
             AND COALESCE(updated_at, created_at) > NOW() - ($1::int * INTERVAL '1 second')`,
          [win],
        ).catch(() => ({ rows: [{ c: 0 }] }));
        count = Number(r.rows[0]?.c || 0);
      } else if (key === 'TOTALS_LIABILITY_HIGH') {
        const threshold = Number(rule.threshold_count || 40000);
        const r = await query(
          `SELECT match_id,
                  COALESCE(SUM(
                    COALESCE(potential_profit, stake * GREATEST(COALESCE(accepted_odds, odds, 1) - 1, 0))
                  ), 0)::float AS liability
           FROM bets
           WHERE status IN ('ACCEPTED', 'PENDING', 'OPEN')
             AND (
               LOWER(COALESCE(market_id, '')) LIKE '%team_total%'
               OR LOWER(COALESCE(market_id, '')) LIKE '%match_total%'
               OR LOWER(COALESCE(market_id, '')) LIKE '%innings_total%'
             )
           GROUP BY match_id
           HAVING COALESCE(SUM(
             COALESCE(potential_profit, stake * GREATEST(COALESCE(accepted_odds, odds, 1) - 1, 0))
           ), 0) >= $1
           ORDER BY liability DESC
           LIMIT 5`,
          [threshold],
        ).catch(() => ({ rows: [] }));
        for (const row of r.rows) {
          const liability = Number(row.liability || 0);
          const raised = await raiseOpsAlert({
            title: rule.title,
            message: `Match ${row.match_id} totals open liability ₹${liability.toFixed(0)} (threshold ₹${threshold})`,
            severity: rule.severity,
            category: rule.category,
            source: 'ops_alert_rules',
            dedupeKey: `rule:TOTALS_LIABILITY_HIGH:${row.match_id}`,
            metadata: { matchId: row.match_id, liability, ruleKey: rule.rule_key },
            cooldownSeconds: Number(rule.cooldown_seconds || DEFAULT_COOLDOWN_SEC),
            entityType: 'match',
            entityId: row.match_id,
          });
          results.push({ ruleKey: key, matchId: row.match_id, liability, ...raised });
        }
        continue;
      } else {
        continue;
      }
      if (count >= Number(rule.threshold_count || 1)) {
        const raised = await raiseOpsAlert({
          title: rule.title,
          message: `${rule.title}: count=${count} (threshold ${rule.threshold_count})`,
          severity: rule.severity,
          category: rule.category,
          source: 'ops_alert_rules',
          dedupeKey: `rule:${rule.rule_key}`,
          metadata: { count, ruleKey: rule.rule_key },
          cooldownSeconds: Number(rule.cooldown_seconds || DEFAULT_COOLDOWN_SEC),
          entityType,
          entityId,
        });
        results.push({ ruleKey: key, count, ...raised });
      }
    }
  } catch (err) {
    results.push({ error: err.message });
  }
  return { success: true, results };
}
