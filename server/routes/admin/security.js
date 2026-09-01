/**
 * Phase 8: Admin Security Center API Routes
 */
import { Router } from 'express';
import { requireRole, ADMIN_ROLES } from '../../middleware/adminAuth.js';
import { logAdminAction } from '../../middleware/auditLogger.js';
import { hashPassword, verifyPassword } from '../../auth/passwordHasher.js';
import { isAdminMfaEnforced } from '../../../lib/adminMfa.mjs';
const router = Router();
let pgQuery = null;
async function getQuery() { if (!pgQuery) { const m = await import('../../../db/pg.js'); pgQuery = m.query; } return pgQuery; }

function parseAdminEmails() {
  return String(process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || '')
    .split(/[,;\s]+/)
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

// ── ADMIN USER MANAGEMENT (SUPER ADMIN) ──

// GET /security/admin-users — list all admin users
router.get('/admin-users', requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const q = await getQuery();
    const adminEmails = parseAdminEmails();
    const result = await q(
      `SELECT 
         u.user_id,
         u.email,
         u.first_name,
         u.last_name,
         u.role,
         u.status,
         u.last_login_at,
         u.failed_login_attempts,
         u.locked_until,
         u.created_at,
         u.updated_at,
         p.display_name,
         COALESCE(m.enabled, false) AS mfa_enabled,
         m.enrolled_at AS mfa_enrolled_at,
         m.last_used_at AS mfa_last_used_at
       FROM users u
       LEFT JOIN user_profiles p ON u.user_id = p.user_id
       LEFT JOIN admin_mfa m ON u.user_id = m.user_id
       WHERE UPPER(u.role) IN ('ADMIN', 'SUPER_ADMIN', 'SUPERADMIN', 'FINANCE_ADMIN', 'TRADING_ADMIN', 'SUPPORT_AGENT', 'RISK_ANALYST', 'MARKETING_ADMIN', 'OPERATIONS_ADMIN')
          OR LOWER(u.email) = ANY($1)
       ORDER BY u.created_at DESC`,
      [adminEmails.length ? adminEmails : ['__none__']],
    );
    res.json({
      success: true,
      admins: result.rows,
      mfaEnforced: isAdminMfaEnforced(),
      missingTotp: result.rows.filter((r) => !r.mfa_enabled).map((r) => r.user_id),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /security/admin-users — create new admin user
router.post('/admin-users', requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const q = await getQuery();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const firstName = String(req.body?.firstName || '').trim();
    const lastName = String(req.body?.lastName || '').trim();
    const requestedRole = String(req.body?.role || 'SUPER_ADMIN').toUpperCase();
    const status = String(req.body?.status || 'ACTIVE').toUpperCase();

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email address is required' });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    const validRoles = Object.values(ADMIN_ROLES).concat(['ADMIN', 'SUPER_ADMIN']);
    const role = validRoles.includes(requestedRole) ? requestedRole : ADMIN_ROLES.SUPER_ADMIN;

    const existing = await q('SELECT user_id, role, email FROM users WHERE email = $1', [email]);
    let userId;
    const passwordHash = await hashPassword(password);

    if (existing.rows[0]) {
      const user = existing.rows[0];
      userId = user.user_id;
      await q(
        `UPDATE users
         SET password_hash = $2, role = $3, status = $4,
             first_name = COALESCE(NULLIF($5, ''), first_name),
             last_name = COALESCE(NULLIF($6, ''), last_name),
             failed_login_attempts = 0, locked_until = NULL,
             email_verified_at = COALESCE(email_verified_at, NOW()),
             updated_at = NOW()
         WHERE user_id = $1`,
        [userId, passwordHash, role, status, firstName, lastName],
      );
    } else {
      userId = `usr_admin_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      await q(
        `INSERT INTO users (
           user_id, email, password_hash, first_name, last_name,
           country, currency, role, status, email_verified_at
         ) VALUES ($1, $2, $3, $4, $5, 'India', 'INR', $6, $7, NOW())`,
        [userId, email, passwordHash, firstName || 'Admin', lastName || 'User', role, status],
      );
    }

    const displayName = `${firstName} ${lastName}`.trim() || 'Admin User';
    await q(
      `INSERT INTO user_profiles (user_id, display_name, account_status)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET display_name = $2, account_status = $3`,
      [userId, displayName, status],
    );

    await q(
      `INSERT INTO wallets (wallet_id, user_id, balance, bonus_balance, currency)
       VALUES ($1, $2, 0.00, 0.00, 'INR')
       ON CONFLICT (user_id) DO NOTHING`,
      [`wal_${userId}`, userId],
    );

    await q(
      `INSERT INTO admin_privilege_changes (admin_id, change_type, new_value, changed_by, reason)
       VALUES ($1, 'ROLE_CHANGE', $2, $3, 'Created / bootstrapped admin user')`,
      [userId, role, req.admin?.id || 'SUPER_ADMIN'],
    );

    await logAdminAction({
      actorId: req.admin?.id || 'SUPER_ADMIN',
      targetId: userId,
      action: 'ADMIN_USER_CREATED',
      details: { email, role, firstName, lastName, status },
    });

    res.status(201).json({
      success: true,
      message: 'Admin account created successfully',
      admin: {
        userId,
        email,
        firstName,
        lastName,
        displayName,
        role,
        status,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /security/admin-users/:id — update admin details, email, password, role, MFA reset
router.put('/admin-users/:id', requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const q = await getQuery();
    const targetId = req.params.id;
    const existing = await q(
      `SELECT u.user_id, u.email, u.role, u.status, u.first_name, u.last_name, p.display_name
       FROM users u
       LEFT JOIN user_profiles p ON u.user_id = p.user_id
       WHERE u.user_id = $1 OR u.email = $1`,
      [targetId],
    );

    if (!existing.rows[0]) {
      return res.status(404).json({ error: 'Admin user not found' });
    }

    const current = existing.rows[0];
    const userId = current.user_id;

    const {
      email,
      firstName,
      lastName,
      displayName,
      role,
      status,
      password,
      resetMfa,
    } = req.body || {};

    const updates = [];
    const params = [userId];
    let paramIndex = 2;

    // 1. Email change
    if (email && email.trim().toLowerCase() !== current.email.toLowerCase()) {
      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail.includes('@')) {
        return res.status(400).json({ error: 'Invalid email address format' });
      }
      const emailCheck = await q('SELECT user_id FROM users WHERE email = $1 AND user_id != $2', [cleanEmail, userId]);
      if (emailCheck.rows[0]) {
        return res.status(400).json({ error: 'Email is already in use by another user' });
      }
      updates.push(`email = $${paramIndex++}`);
      params.push(cleanEmail);

      await q(
        `INSERT INTO admin_privilege_changes (admin_id, change_type, old_value, new_value, changed_by, reason)
         VALUES ($1, 'EMAIL_CHANGE', $2, $3, $4, 'Super Admin updated admin email')`,
        [userId, current.email, cleanEmail, req.admin?.id || 'SUPER_ADMIN'],
      );
    }

    // 2. Name changes
    if (firstName !== undefined) {
      updates.push(`first_name = $${paramIndex++}`);
      params.push(String(firstName).trim());
    }
    if (lastName !== undefined) {
      updates.push(`last_name = $${paramIndex++}`);
      params.push(String(lastName).trim());
    }

    // 3. Role change
    if (role && role !== current.role) {
      const validRoles = Object.values(ADMIN_ROLES).concat(['ADMIN']);
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: `Invalid role. Allowed: ${validRoles.join(', ')}` });
      }
      updates.push(`role = $${paramIndex++}`);
      params.push(role);

      await q(
        `INSERT INTO admin_privilege_changes (admin_id, change_type, old_value, new_value, changed_by, reason)
         VALUES ($1, 'ROLE_CHANGE', $2, $3, $4, 'Super Admin changed role')`,
        [userId, current.role, role, req.admin?.id || 'SUPER_ADMIN'],
      );
    }

    // 4. Status change
    if (status && status !== current.status) {
      const validStatuses = ['ACTIVE', 'SUSPENDED', 'LOCKED'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Allowed: ${validStatuses.join(', ')}` });
      }
      updates.push(`status = $${paramIndex++}`);
      params.push(status);

      await q(
        `INSERT INTO admin_privilege_changes (admin_id, change_type, old_value, new_value, changed_by, reason)
         VALUES ($1, $2, $3, $4, $5, 'Super Admin changed account status')`,
        [
          userId,
          status === 'ACTIVE' ? 'ACCOUNT_ENABLE' : 'ACCOUNT_DISABLE',
          current.status,
          status,
          req.admin?.id || 'SUPER_ADMIN',
        ],
      );
    }

    // 5. Password reset
    if (password) {
      if (password.length < 8) {
        return res.status(400).json({ error: 'New password must be at least 8 characters long' });
      }
      const newHash = await hashPassword(password);
      updates.push(`password_hash = $${paramIndex++}`);
      params.push(newHash);
      updates.push(`failed_login_attempts = 0`);
      updates.push(`locked_until = NULL`);

      await q(
        `INSERT INTO admin_privilege_changes (admin_id, change_type, new_value, changed_by, reason)
         VALUES ($1, 'PASSWORD_RESET', 'Password updated by Super Admin', $2, 'Super Admin password change')`,
        [userId, req.admin?.id || 'SUPER_ADMIN'],
      );
    }

    if (updates.length > 0) {
      updates.push(`updated_at = NOW()`);
      await q(`UPDATE users SET ${updates.join(', ')} WHERE user_id = $1`, params);
    }

    // 6. Update user_profiles display name & status
    const newDisp = displayName !== undefined
      ? displayName
      : `${firstName || current.first_name || ''} ${lastName || current.last_name || ''}`.trim();
    if (newDisp || status) {
      await q(
        `INSERT INTO user_profiles (user_id, display_name, account_status)
         VALUES ($1, $2, COALESCE($3, 'ACTIVE'))
         ON CONFLICT (user_id) DO UPDATE SET
           display_name = COALESCE(NULLIF($2, ''), user_profiles.display_name),
           account_status = COALESCE($3, user_profiles.account_status),
           updated_at = NOW()`,
        [userId, newDisp, status || current.status],
      );
    }

    // 7. Reset MFA if requested
    if (resetMfa) {
      await q(
        `UPDATE admin_mfa
         SET enabled = FALSE, enrolled_at = NULL, updated_at = NOW()
         WHERE user_id = $1`,
        [userId],
      );
      await q(
        `INSERT INTO admin_privilege_changes (admin_id, change_type, new_value, changed_by, reason)
         VALUES ($1, 'MFA_RESET', 'MFA reset by Super Admin', $2, 'Super Admin requested MFA re-enrollment')`,
        [userId, req.admin?.id || 'SUPER_ADMIN'],
      );
    }

    await logAdminAction({
      actorId: req.admin?.id || 'SUPER_ADMIN',
      targetId: userId,
      action: 'ADMIN_USER_UPDATED',
      details: {
        emailChanged: !!email,
        passwordChanged: !!password,
        roleChanged: !!role,
        statusChanged: !!status,
        mfaReset: !!resetMfa,
      },
    });

    const refreshed = await q(
      `SELECT u.user_id, u.email, u.first_name, u.last_name, u.role, u.status, u.updated_at,
              p.display_name, COALESCE(m.enabled, false) AS mfa_enabled
       FROM users u
       LEFT JOIN user_profiles p ON u.user_id = p.user_id
       LEFT JOIN admin_mfa m ON u.user_id = m.user_id
       WHERE u.user_id = $1`,
      [userId],
    );

    res.json({
      success: true,
      message: 'Admin details updated successfully',
      admin: refreshed.rows[0],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /security/me — current logged in admin profile
router.get('/me', async (req, res) => {
  try {
    const q = await getQuery();
    const adminId = req.admin?.id;
    const result = await q(
      `SELECT u.user_id, u.email, u.first_name, u.last_name, u.role, u.status, u.created_at, u.last_login_at,
              p.display_name, COALESCE(m.enabled, false) AS mfa_enabled
       FROM users u
       LEFT JOIN user_profiles p ON u.user_id = p.user_id
       LEFT JOIN admin_mfa m ON u.user_id = m.user_id
       WHERE u.user_id = $1 OR u.email = $1`,
      [adminId],
    );
    if (!result.rows[0]) {
      return res.json({
        user_id: adminId,
        email: adminId.includes('@') ? adminId : 'admin@oddsyra.com',
        role: req.admin?.role || 'SUPER_ADMIN',
        display_name: 'Admin Operator',
        mfa_enabled: false,
      });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /security/me — current admin self update (name, email, password)
router.put('/me', async (req, res) => {
  try {
    const q = await getQuery();
    const adminId = req.admin?.id;
    const { email, firstName, lastName, displayName, currentPassword, newPassword } = req.body || {};

    const existing = await q(
      `SELECT user_id, email, password_hash, first_name, last_name FROM users WHERE user_id = $1 OR email = $1`,
      [adminId],
    );

    if (!existing.rows[0]) {
      return res.status(404).json({ error: 'User record not found' });
    }

    const user = existing.rows[0];
    const userId = user.user_id;

    // Check current password if attempting to change password
    if (newPassword) {
      if (newPassword.length < 8) {
        return res.status(400).json({ error: 'New password must be at least 8 characters' });
      }
      if (user.password_hash && currentPassword) {
        const check = await verifyPassword(currentPassword, user.password_hash);
        if (!check.valid) {
          return res.status(400).json({ error: 'Current password incorrect' });
        }
      }
      const newHash = await hashPassword(newPassword);
      await q('UPDATE users SET password_hash = $2, updated_at = NOW() WHERE user_id = $1', [userId, newHash]);
    }

    if (email && email.trim().toLowerCase() !== user.email.toLowerCase()) {
      const cleanEmail = email.trim().toLowerCase();
      const check = await q('SELECT user_id FROM users WHERE email = $1 AND user_id != $2', [cleanEmail, userId]);
      if (check.rows[0]) {
        return res.status(400).json({ error: 'Email already in use' });
      }
      await q('UPDATE users SET email = $2, updated_at = NOW() WHERE user_id = $1', [userId, cleanEmail]);
    }

    if (firstName !== undefined || lastName !== undefined) {
      await q(
        `UPDATE users
         SET first_name = COALESCE(NULLIF($2, ''), first_name),
             last_name = COALESCE(NULLIF($3, ''), last_name),
             updated_at = NOW()
         WHERE user_id = $1`,
        [userId, firstName, lastName],
      );
    }

    const newDisplay = displayName || `${firstName || user.first_name || ''} ${lastName || user.last_name || ''}`.trim();
    if (newDisplay) {
      await q(
        `INSERT INTO user_profiles (user_id, display_name)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET display_name = $2, updated_at = NOW()`,
        [userId, newDisplay],
      );
    }

    await logAdminAction({
      actorId: userId,
      targetId: userId,
      action: 'ADMIN_SELF_PROFILE_UPDATED',
      details: { emailUpdated: !!email, passwordUpdated: !!newPassword },
    });

    res.json({ success: true, message: 'Profile updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /security/sessions — active admin sessions
router.get('/sessions', requireRole('SUPER_ADMIN', 'OPERATIONS_ADMIN'), async (req, res) => {
  try {
    const q = await getQuery();
    const result = await q('SELECT * FROM admin_sessions WHERE is_active = TRUE ORDER BY last_active_at DESC');
    res.json({ sessions: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /security/logins — login history
router.get('/logins', requireRole('SUPER_ADMIN', 'OPERATIONS_ADMIN'), async (req, res) => {
  try {
    const q = await getQuery();
    const { adminId, success, page = 1, limit = 50 } = req.query;
    const conds = []; const params = []; let i = 1;
    if (adminId) { conds.push(`admin_id = $${i++}`); params.push(adminId); }
    if (success !== undefined) { conds.push(`success = $${i++}`); params.push(success === 'true'); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const result = await q(`SELECT * FROM admin_login_history ${where} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i++}`, [...params, parseInt(limit), offset]);
    res.json({ logins: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /security/sessions/:id/terminate — terminate a session
router.post('/sessions/:id/terminate', requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const q = await getQuery();
    if (!req.body.reason) return res.status(400).json({ error: 'Reason is required' });
    await q("UPDATE admin_sessions SET is_active = FALSE, terminated_at = NOW(), terminated_by = $1, termination_reason = $2 WHERE session_id = $3",
      [req.admin.id, req.body.reason, req.params.id]);
    await logAdminAction({ actorId: req.admin.id, targetId: req.params.id, action: 'SESSION_TERMINATED', details: { reason: req.body.reason } });
    res.json({ sessionId: req.params.id, status: 'TERMINATED' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /security/force-logout/:adminId — force logout
router.post('/force-logout/:adminId', requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const q = await getQuery();
    if (!req.body.reason) return res.status(400).json({ error: 'Reason is required' });
    await q("UPDATE admin_sessions SET is_active = FALSE, terminated_at = NOW(), terminated_by = $1, termination_reason = $2 WHERE admin_id = $3 AND is_active = TRUE",
      [req.admin.id, req.body.reason, req.params.adminId]);
    await logAdminAction({ actorId: req.admin.id, targetId: req.params.adminId, action: 'ADMIN_FORCE_LOGOUT', details: { reason: req.body.reason } });
    res.json({ adminId: req.params.adminId, status: 'FORCE_LOGGED_OUT' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /security/privilege-changes — privilege change history
router.get('/privilege-changes', requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const q = await getQuery();
    const result = await q('SELECT * FROM admin_privilege_changes ORDER BY created_at DESC LIMIT 100');
    res.json({ changes: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/** GET /security/config-health — safe env/config status (no secret values) */
router.get('/config-health', requireRole('SUPER_ADMIN', 'OPERATIONS_ADMIN'), async (req, res) => {
  try {
    const { getConfigurationHealth } = await import('../../../lib/configHealthEngine.mjs');
    res.json(getConfigurationHealth());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /security/audit-center — filtered append-only audit explorer */
router.get('/audit-center', requireRole('SUPER_ADMIN', 'OPERATIONS_ADMIN', 'FINANCE_ADMIN'), async (req, res) => {
  try {
    const q = await getQuery();
    const {
      adminId, action, resource, riskLevel, ip, requestId, q: search,
      from, to, page = 1, limit = 50,
    } = req.query;
    const conds = [];
    const params = [];
    let i = 1;
    if (adminId) { conds.push(`actor_id = $${i++}`); params.push(adminId); }
    if (req.query.betId) {
      conds.push(`(target_id::text ILIKE $${i} OR details::text ILIKE $${i})`);
      params.push(`%${req.query.betId}%`);
      i += 1;
    }
    if (action) { conds.push(`action ILIKE $${i++}`); params.push(`%${action}%`); }
    if (resource) { conds.push(`(target_id::text ILIKE $${i} OR details::text ILIKE $${i})`); params.push(`%${resource}%`); i += 1; }
    if (riskLevel) { conds.push(`risk_level = $${i++}`); params.push(String(riskLevel).toUpperCase()); }
    if (ip) { conds.push(`ip_address = $${i++}`); params.push(ip); }
    if (requestId) { conds.push(`request_id = $${i++}`); params.push(requestId); }
    if (search) {
      conds.push(`(action ILIKE $${i} OR details::text ILIKE $${i} OR actor_id ILIKE $${i} OR target_id::text ILIKE $${i})`);
      params.push(`%${search}%`);
      i += 1;
    }
    if (from) { conds.push(`created_at >= $${i++}::timestamptz`); params.push(from); }
    if (to) { conds.push(`created_at <= $${i++}::timestamptz`); params.push(to); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const lim = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (Math.max(1, parseInt(page, 10) || 1) - 1) * lim;
    const result = await q(
      `SELECT event_id, actor_id, target_id, action, details, created_at,
              ip_address, user_agent, request_id, risk_level
       FROM audit_events
       ${where}
       ORDER BY created_at DESC
       LIMIT $${i++} OFFSET $${i++}`,
      [...params, lim, offset],
    ).catch(async () => q(
      `SELECT event_id, actor_id, target_id, action, details, created_at
       FROM audit_events ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, lim, offset],
    ));
    res.json({
      success: true,
      events: result.rows,
      page: parseInt(page, 10) || 1,
      limit: lim,
      appendOnly: true,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

