/**
 * Phase 8: Admin Security Center API Routes
 */
import { Router } from 'express';
import { requireRole } from '../../middleware/adminAuth.js';
import { logAdminAction } from '../../middleware/auditLogger.js';
const router = Router();
let pgQuery = null;
async function getQuery() { if (!pgQuery) { const m = await import('../../../db/pg.js'); pgQuery = m.query; } return pgQuery; }

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
