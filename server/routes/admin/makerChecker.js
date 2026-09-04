/**
 * Phase 9: Two-Person Control (Maker-Checker) API Routes
 * Extends existing maker_checker_requests table
 */
import { Router } from 'express';
import { requireRole } from '../../middleware/adminAuth.js';
import { logAdminAction } from '../../middleware/auditLogger.js';
const router = Router();
let pgQuery = null;
async function getQuery() { if (!pgQuery) { const m = await import('../../../db/pg.js'); pgQuery = m.query; } return pgQuery; }
function genId(p) { return `${p}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`; }

const EXTENDED_ACTION_TYPES = [
  'WALLET_ADJUSTMENT','ACCOUNT_RELEASE','SETTLEMENT_CORRECTION','WITHDRAWAL_OVERRIDE',
  'GLOBAL_CONFIG','PRODUCTION_RULES','MASS_RESTRICTION','GLOBAL_BETTING_PAUSE','CRITICAL_FEATURE_FLAGS',
  'MANUAL_CREDIT','MANUAL_DEBIT','REFUND','BONUS_ADJUSTMENT',
];

const makerCheckerRoles = requireRole('SUPER_ADMIN', 'FINANCE_ADMIN', 'OPERATIONS_ADMIN');

// GET /maker-checker/pending — pending approvals
router.get('/pending', makerCheckerRoles, async (req, res) => {
  try {
    const q = await getQuery();
    const result = await q("SELECT * FROM maker_checker_requests WHERE status = 'PENDING_APPROVAL' ORDER BY created_at DESC");
    res.json({ pending: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /maker-checker/submit — submit a maker-checker request
router.post('/submit', makerCheckerRoles, async (req, res) => {
  try {
    const q = await getQuery();
    const { actionType, targetEntityType, targetEntityId, requestPayload, reason } = req.body;
    if (!actionType) return res.status(400).json({ error: 'actionType is required' });
    if (!reason) return res.status(400).json({ error: 'reason is required for maker-checker requests' });

    const requestId = genId('mc');
    await q(
      `INSERT INTO maker_checker_requests (id, action_type, target_entity_type, target_entity_id, request_payload, status, maker_id)
       VALUES ($1, $2, $3, $4, $5, 'PENDING_APPROVAL', $6)`,
      [requestId, actionType, targetEntityType || 'system', targetEntityId || 'N/A', JSON.stringify({ ...requestPayload, reason }), req.admin.id]
    );
    await logAdminAction({ actorId: req.admin.id, targetId: requestId, action: 'MAKER_CHECKER_SUBMITTED', details: { actionType, reason } });
    res.status(201).json({ requestId, actionType, status: 'PENDING_APPROVAL', makerId: req.admin.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /maker-checker/:id/approve — checker approves and executes the action
router.post('/:id/approve', makerCheckerRoles, async (req, res) => {
  try {
    const { makerCheckerEngine } = await import('../../../lib/makerCheckerEngine.mjs');
    const result = await makerCheckerEngine.approveRequest(req.params.id, req.admin.id);
    await logAdminAction({
      actorId: req.admin.id,
      targetId: req.params.id,
      action: 'MAKER_CHECKER_APPROVED',
      details: { status: result.status },
    });
    res.json({ requestId: req.params.id, status: 'APPROVED', checkerId: req.admin.id, ...result });
  } catch (err) {
    const status = /SELF_APPROVAL|cannot approve/i.test(err.message) ? 403
      : /not found/i.test(err.message) ? 404
      : /already/i.test(err.message) ? 400
      : 500;
    res.status(status).json({ error: err.message, code: status === 403 ? 'SELF_APPROVAL_PROHIBITED' : undefined });
  }
});

// POST /maker-checker/:id/reject — checker rejects
router.post('/:id/reject', makerCheckerRoles, async (req, res) => {
  try {
    if (!req.body.reason) return res.status(400).json({ error: 'Rejection reason is required' });
    const { makerCheckerEngine } = await import('../../../lib/makerCheckerEngine.mjs');
    const result = await makerCheckerEngine.rejectRequest(req.params.id, req.body.reason, req.admin.id);
    await logAdminAction({
      actorId: req.admin.id,
      targetId: req.params.id,
      action: 'MAKER_CHECKER_REJECTED',
      details: { reason: req.body.reason },
    });
    res.json({ requestId: req.params.id, status: 'REJECTED', reason: req.body.reason, ...result });
  } catch (err) {
    const status = /cannot reject|SELF_APPROVAL/i.test(err.message) ? 403
      : /not found/i.test(err.message) ? 404
      : 500;
    res.status(status).json({ error: err.message });
  }
});

export default router;
