/**
 * Admin Customer Support & Bet Dispute Resolution API
 */

import { Router } from 'express';
import { requireRole } from '../../middleware/adminAuth.js';
import { query } from '../../../db/pg.js';
import { resolveBetDispute } from '../../../lib/supportTicketEngine.mjs';
import { logAdminAction } from '../../middleware/auditLogger.js';

const router = Router();

// GET /api/admin/support/disputes — List all disputes with filters
router.get('/disputes', requireRole('SUPER_ADMIN', 'OPERATIONS_ADMIN', 'FINANCE_ADMIN'), async (req, res) => {
  try {
    const { status, limit = 50 } = req.query;
    const conds = [];
    const params = [];
    let i = 1;

    if (status) {
      conds.push(`status = $${i++}`);
      params.push(status);
    }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    params.push(Math.min(100, Number(limit) || 50));

    const result = await query(
      `SELECT * FROM bet_disputes ${where} ORDER BY created_at DESC LIMIT $${i}`,
      params,
    );

    res.json({ success: true, disputes: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/support/disputes/:id/resolve — Resolve dispute
router.post('/disputes/:id/resolve', requireRole('SUPER_ADMIN', 'OPERATIONS_ADMIN', 'FINANCE_ADMIN'), async (req, res) => {
  try {
    const disputeId = req.params.id;
    const { status = 'RESOLVED_UPHELD', notes = '', refundAmount = 0 } = req.body || {};
    const agentId = req.admin?.id || 'admin';

    const result = await resolveBetDispute(disputeId, agentId, status, notes, refundAmount);

    await logAdminAction({
      actorId: agentId,
      targetId: disputeId,
      action: 'BET_DISPUTE_RESOLVED',
      details: { status, notes, refundAmount },
    });

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
