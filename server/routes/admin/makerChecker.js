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

// GET /maker-checker/pending — pending approvals
router.get('/pending', async (req, res) => {
  try {
    const q = await getQuery();
    const result = await q("SELECT * FROM maker_checker_requests WHERE status = 'PENDING_APPROVAL' ORDER BY created_at DESC");
    res.json({ pending: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /maker-checker/submit — submit a maker-checker request
router.post('/submit', async (req, res) => {
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

// POST /maker-checker/:id/approve — checker approves
router.post('/:id/approve', async (req, res) => {
  try {
    const q = await getQuery();
    const reqRow = await q('SELECT * FROM maker_checker_requests WHERE id = $1', [req.params.id]);
    if (reqRow.rows.length === 0) return res.status(404).json({ error: 'Request not found' });
    const mcReq = reqRow.rows[0];
    if (mcReq.status !== 'PENDING_APPROVAL') return res.status(400).json({ error: `Request is already ${mcReq.status}` });
    if (mcReq.maker_id === req.admin.id) return res.status(403).json({ error: 'MAKER_CHECKER: You cannot approve your own request', code: 'SELF_APPROVAL_PROHIBITED' });

    await q("UPDATE maker_checker_requests SET status = 'APPROVED', checker_id = $1, approved_at = NOW() WHERE id = $2", [req.admin.id, req.params.id]);
    await logAdminAction({ actorId: req.admin.id, targetId: req.params.id, action: 'MAKER_CHECKER_APPROVED', details: { actionType: mcReq.action_type } });
    res.json({ requestId: req.params.id, status: 'APPROVED', checkerId: req.admin.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /maker-checker/:id/reject — checker rejects
router.post('/:id/reject', async (req, res) => {
  try {
    const q = await getQuery();
    if (!req.body.reason) return res.status(400).json({ error: 'Rejection reason is required' });
    const reqRow = await q('SELECT * FROM maker_checker_requests WHERE id = $1', [req.params.id]);
    if (reqRow.rows.length === 0) return res.status(404).json({ error: 'Request not found' });
    if (reqRow.rows[0].maker_id === req.admin.id) return res.status(403).json({ error: 'MAKER_CHECKER: You cannot reject your own request' });

    await q("UPDATE maker_checker_requests SET status = 'REJECTED', checker_id = $1, rejection_reason = $2 WHERE id = $3", [req.admin.id, req.body.reason, req.params.id]);
    await logAdminAction({ actorId: req.admin.id, targetId: req.params.id, action: 'MAKER_CHECKER_REJECTED', details: { reason: req.body.reason } });
    res.json({ requestId: req.params.id, status: 'REJECTED', reason: req.body.reason });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
