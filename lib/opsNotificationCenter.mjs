/**
 * Ops Notification Center — extends admin_notifications + preferences.
 * Dedupes against open alerts via raiseOpsAlert / notification_id linkage.
 */

import crypto from 'crypto';
import { query } from '../db/pg.js';
import { raiseOpsAlert, ensureOpsAlertSchema } from './opsAlertEngine.mjs';

async function ensurePrefs() {
  await query(`
    CREATE TABLE IF NOT EXISTS ops_notification_preferences (
      admin_id VARCHAR(64) PRIMARY KEY,
      critical_alerts BOOLEAN DEFAULT TRUE,
      high_alerts BOOLEAN DEFAULT TRUE,
      financial_alerts BOOLEAN DEFAULT TRUE,
      security_alerts BOOLEAN DEFAULT TRUE,
      betting_alerts BOOLEAN DEFAULT TRUE,
      promotion_alerts BOOLEAN DEFAULT TRUE,
      system_alerts BOOLEAN DEFAULT TRUE,
      channel_in_app BOOLEAN DEFAULT TRUE,
      channel_email BOOLEAN DEFAULT FALSE,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `).catch(() => null);
}

export async function getNotificationPreferences(adminId) {
  await ensurePrefs();
  const res = await query(
    `SELECT * FROM ops_notification_preferences WHERE admin_id = $1`,
    [adminId],
  ).catch(() => ({ rows: [] }));
  if (res.rows[0]) return { success: true, preferences: res.rows[0] };
  return {
    success: true,
    preferences: {
      admin_id: adminId,
      critical_alerts: true,
      high_alerts: true,
      financial_alerts: true,
      security_alerts: true,
      betting_alerts: true,
      promotion_alerts: true,
      system_alerts: true,
      channel_in_app: true,
      channel_email: false,
    },
  };
}

export async function updateNotificationPreferences(adminId, patch = {}) {
  await ensurePrefs();
  await query(
    `INSERT INTO ops_notification_preferences (
       admin_id, critical_alerts, high_alerts, financial_alerts, security_alerts,
       betting_alerts, promotion_alerts, system_alerts, channel_in_app, channel_email, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
     ON CONFLICT (admin_id) DO UPDATE SET
       critical_alerts = COALESCE($2, ops_notification_preferences.critical_alerts),
       high_alerts = COALESCE($3, ops_notification_preferences.high_alerts),
       financial_alerts = COALESCE($4, ops_notification_preferences.financial_alerts),
       security_alerts = COALESCE($5, ops_notification_preferences.security_alerts),
       betting_alerts = COALESCE($6, ops_notification_preferences.betting_alerts),
       promotion_alerts = COALESCE($7, ops_notification_preferences.promotion_alerts),
       system_alerts = COALESCE($8, ops_notification_preferences.system_alerts),
       channel_in_app = COALESCE($9, ops_notification_preferences.channel_in_app),
       channel_email = COALESCE($10, ops_notification_preferences.channel_email),
       updated_at = NOW()`,
    [
      adminId,
      patch.criticalAlerts ?? patch.critical_alerts ?? null,
      patch.highAlerts ?? patch.high_alerts ?? null,
      patch.financialAlerts ?? patch.financial_alerts ?? null,
      patch.securityAlerts ?? patch.security_alerts ?? null,
      patch.bettingAlerts ?? patch.betting_alerts ?? null,
      patch.promotionAlerts ?? patch.promotion_alerts ?? null,
      patch.systemAlerts ?? patch.system_alerts ?? null,
      patch.channelInApp ?? patch.channel_in_app ?? null,
      patch.channelEmail ?? patch.channel_email ?? null,
    ],
  );
  return getNotificationPreferences(adminId);
}

/**
 * Fan-out ops notification to admin inbox. Soft / fail-safe.
 * Uses raiseOpsAlert which already dedupes — for per-admin copies use recipientAdminId.
 */
export async function notifyOpsAdmin({
  recipientAdminId = 'admin',
  title,
  message,
  severity = 'WARNING',
  type = 'SYSTEM',
  entityType = null,
  entityId = null,
  metadata = {},
  dedupeKey = null,
} = {}) {
  try {
    await ensureOpsAlertSchema();
    const prefs = await getNotificationPreferences(recipientAdminId);
    const p = prefs.preferences || {};
    const sev = String(severity).toUpperCase();
    const cat = String(type).toUpperCase();
    if (sev === 'CRITICAL' && p.critical_alerts === false) return { recorded: false, skipped: 'prefs' };
    if (sev === 'HIGH' && p.high_alerts === false) return { recorded: false, skipped: 'prefs' };
    if (cat === 'FINANCIAL' && p.financial_alerts === false) return { recorded: false, skipped: 'prefs' };
    if (cat === 'SECURITY' && p.security_alerts === false) return { recorded: false, skipped: 'prefs' };
    if (cat === 'BETTING' && p.betting_alerts === false) return { recorded: false, skipped: 'prefs' };
    if (cat === 'PROMOTION' && p.promotion_alerts === false) return { recorded: false, skipped: 'prefs' };
    if (cat === 'SYSTEM' && p.system_alerts === false) return { recorded: false, skipped: 'prefs' };
    if (p.channel_in_app === false) return { recorded: false, skipped: 'channel' };

    return raiseOpsAlert({
      title,
      message,
      severity: sev,
      category: cat,
      source: 'notification_center',
      entityType,
      entityId,
      dedupeKey: dedupeKey || `notif:${recipientAdminId}:${cat}:${entityType}:${entityId}:${String(title).slice(0, 40)}`,
      metadata,
      adminId: recipientAdminId,
      soft: true,
    });
  } catch (err) {
    return { recorded: false, error: err.message };
  }
}

export async function listOpsNotifications({
  adminId = 'admin',
  severity = null,
  type = null,
  unreadOnly = false,
  limit = 50,
  offset = 0,
} = {}) {
  await ensureOpsAlertSchema();
  const params = [adminId];
  const conds = [`(admin_id = $1 OR admin_id = 'admin')`];
  if (severity) {
    params.push(String(severity).toUpperCase());
    conds.push(`UPPER(COALESCE(severity, priority,'')) = $${params.length}`);
  }
  if (type) {
    params.push(String(type).toUpperCase());
    conds.push(`UPPER(COALESCE(category,'')) = $${params.length}`);
  }
  if (unreadOnly) {
    conds.push(`is_read = FALSE`);
  }
  const where = `WHERE ${conds.join(' AND ')}`;
  params.push(Math.min(200, Math.max(1, Number(limit) || 50)));
  params.push(Math.max(0, Number(offset) || 0));
  const res = await query(
    `SELECT * FROM admin_notifications ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  const unread = await query(
    `SELECT COUNT(*)::int AS c FROM admin_notifications
     WHERE (admin_id = $1 OR admin_id = 'admin') AND is_read = FALSE`,
    [adminId],
  ).catch(() => ({ rows: [{ c: 0 }] }));
  return {
    success: true,
    notifications: res.rows,
    unreadCount: Number(unread.rows[0]?.c || 0),
    count: res.rows.length,
  };
}

export async function markNotificationRead(notificationId, adminId, read = true) {
  const res = await query(
    `UPDATE admin_notifications SET is_read = $3
     WHERE notification_id = $1 AND (admin_id = $2 OR admin_id = 'admin')
     RETURNING notification_id, is_read`,
    [notificationId, adminId, !!read],
  );
  if (!res.rows[0]) {
    throw Object.assign(new Error('Notification not found'), { status: 404 });
  }
  try {
    const { logAdminAction } = await import('../server/middleware/auditLogger.js');
    await logAdminAction({
      actorId: adminId,
      targetId: notificationId,
      action: read ? 'OPS_NOTIFICATION_READ' : 'OPS_NOTIFICATION_UNREAD',
      details: {},
    });
  } catch { /* soft */ }
  return { success: true, notification: res.rows[0] };
}

export async function markAllNotificationsRead(adminId) {
  await query(
    `UPDATE admin_notifications SET is_read = TRUE
     WHERE (admin_id = $1 OR admin_id = 'admin') AND is_read = FALSE`,
    [adminId],
  );
  try {
    const { logAdminAction } = await import('../server/middleware/auditLogger.js');
    await logAdminAction({
      actorId: adminId,
      targetId: adminId,
      action: 'OPS_NOTIFICATIONS_READ_ALL',
      details: {},
    });
  } catch { /* soft */ }
  return { success: true };
}

/** Retention helper — never deletes open incidents; soft-deletes old resolved alerts/notifs. */
export async function pruneOpsNotifications({ olderThanDays = 90 } = {}) {
  const days = Math.max(7, Number(olderThanDays) || 90);
  const res = await query(
    `DELETE FROM admin_notifications
     WHERE UPPER(COALESCE(status,'OPEN')) IN ('RESOLVED','DISMISSED')
       AND created_at < NOW() - ($1 || ' days')::interval
     RETURNING notification_id`,
    [String(days)],
  ).catch(() => ({ rows: [] }));
  return { success: true, pruned: res.rows.length };
}

export function newNotificationId() {
  return `anot_${crypto.randomBytes(8).toString('hex')}`;
}
