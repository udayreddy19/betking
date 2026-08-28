/**
 * User-Facing Customer Support & Bet Dispute Routes
 */

import { Router } from 'express';
import { query } from '../../db/pg.js';
import { createBetDispute } from '../../lib/supportTicketEngine.mjs';

const router = Router();

function getUserId(req) {
  return req.user?.id || req.user?.userId || req.headers['x-user-id'] || 'guest_user';
}

// POST /api/support/disputes — User opens a dispute for a settled bet
router.post('/disputes', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { betId, reason } = req.body || {};
    if (!betId) return res.status(400).json({ error: 'betId is required' });

    const result = await createBetDispute(userId, betId, reason);
    res.status(201).json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/support/disputes — List user disputes
router.get('/disputes', async (req, res) => {
  try {
    const userId = getUserId(req);
    const result = await query(
      `SELECT * FROM bet_disputes WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    );
    res.json({ success: true, disputes: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
