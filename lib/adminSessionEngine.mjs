/**
 * Admin session + login history — extends existing admin_sessions / admin_login_history tables.
 * Does not replace adminAuth JWT; records observability + revoke targets.
 */

import crypto from 'crypto';
import { query } from '../db/pg.js';

function deviceTypeFromUa(ua) {
  const s = String(ua || '');
  if (/Mobile|Android|iPhone/i.test(s)) return 'Mobile';
  if (/iPad|Tablet/i.test(s)) return 'Tablet';
  return 'Desktop';
}

export async function recordAdminLoginAttempt({
  adminId,
  ip,
  userAgent,
  success,
  failureReason = null,
  mfaUsed = false,
}) {
  try {
    await query(
      `INSERT INTO admin_login_history (admin_id, ip_address, user_agent, success, failure_reason, mfa_used)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        String(adminId || 'unknown'),
        String(ip || '0.0.0.0').slice(0, 45),
        userAgent ? String(userAgent).slice(0, 2000) : null,
        Boolean(success),
        failureReason ? String(failureReason).slice(0, 500) : null,
        Boolean(mfaUsed),
      ],
    );
  } catch {
    /* never block login on audit write */
  }
}

export async function createAdminSessionRecord({
  adminId,
  ip,
  userAgent,
  mfaVerified = false,
  sessionId = null,
}) {
  const id = sessionId || `asess_${crypto.randomBytes(16).toString('hex')}`;
  try {
    await query(
      `INSERT INTO admin_sessions (
         session_id, admin_id, ip_address, user_agent, device_type, is_active, mfa_verified, started_at, last_active_at
       ) VALUES ($1, $2, $3, $4, $5, TRUE, $6, NOW(), NOW())
       ON CONFLICT (session_id) DO UPDATE SET
         last_active_at = NOW(),
         is_active = TRUE,
         mfa_verified = EXCLUDED.mfa_verified`,
      [
        id,
        String(adminId),
        String(ip || '0.0.0.0').slice(0, 45),
        userAgent ? String(userAgent).slice(0, 2000) : null,
        deviceTypeFromUa(userAgent),
        Boolean(mfaVerified),
      ],
    );
    return { success: true, sessionId: id };
  } catch (err) {
    return { success: false, sessionId: id, error: err.message };
  }
}

export async function touchAdminSession(sessionId) {
  if (!sessionId) return;
  try {
    await query(
      `UPDATE admin_sessions SET last_active_at = NOW() WHERE session_id = $1 AND is_active = TRUE`,
      [sessionId],
    );
  } catch {
    /* ignore */
  }
}

export async function listActiveAdminSessions({ limit = 100 } = {}) {
  const lim = Math.min(200, Math.max(1, Number(limit) || 100));
  const res = await query(
    `SELECT session_id, admin_id, ip_address, user_agent, device_type, is_active, mfa_verified,
            started_at, last_active_at, terminated_at, terminated_by, termination_reason
     FROM admin_sessions
     WHERE is_active = TRUE
     ORDER BY last_active_at DESC NULLS LAST
     LIMIT $1`,
    [lim],
  );
  return { success: true, sessions: res.rows };
}

/**
 * Detect simple new-IP / new-device signals for an admin (flag-only).
 */
export async function assessAdminSessionRisk({ adminId, ip, userAgent }) {
  const signals = [];
  try {
    const prior = await query(
      `SELECT DISTINCT ip_address FROM admin_sessions
       WHERE admin_id = $1 AND started_at >= NOW() - INTERVAL '30 days'
       LIMIT 50`,
      [adminId],
    );
    const ips = new Set(prior.rows.map((r) => r.ip_address));
    if (ips.size > 0 && ip && !ips.has(String(ip).slice(0, 45))) {
      signals.push({ code: 'NEW_ADMIN_IP', severity: 'MEDIUM', message: 'Admin login from unfamiliar IP (30d)' });
    }
    const devices = await query(
      `SELECT DISTINCT device_type FROM admin_sessions
       WHERE admin_id = $1 AND started_at >= NOW() - INTERVAL '30 days'`,
      [adminId],
    );
    const dts = new Set(devices.rows.map((r) => r.device_type));
    const dt = deviceTypeFromUa(userAgent);
    if (dts.size > 0 && !dts.has(dt)) {
      signals.push({ code: 'NEW_ADMIN_DEVICE_TYPE', severity: 'LOW', message: `New device type: ${dt}` });
    }
  } catch {
    /* ignore */
  }
  const level = signals.some((s) => s.severity === 'HIGH' || s.severity === 'CRITICAL')
    ? 'HIGH'
    : signals.some((s) => s.severity === 'MEDIUM')
      ? 'MEDIUM'
      : signals.length
        ? 'LOW'
        : 'NONE';
  return { success: true, riskLevel: level, signals };
}

export async function revokeAdminSession({ sessionId, terminatedBy, reason }) {
  await query(
    `UPDATE admin_sessions
     SET is_active = FALSE, terminated_at = NOW(), terminated_by = $1, termination_reason = $2
     WHERE session_id = $3 AND is_active = TRUE
     RETURNING session_id`,
    [terminatedBy, reason || 'revoked', sessionId],
  );
  return { success: true, sessionId, status: 'TERMINATED' };
}

export async function revokeAllAdminSessions({ adminId, terminatedBy, reason }) {
  const res = await query(
    `UPDATE admin_sessions
     SET is_active = FALSE, terminated_at = NOW(), terminated_by = $1, termination_reason = $2
     WHERE admin_id = $3 AND is_active = TRUE
     RETURNING session_id`,
    [terminatedBy, reason || 'force_logout', adminId],
  );
  return { success: true, adminId, revoked: res.rowCount || 0 };
}
