/**
 * Responsible Gaming API Routes
 */

import { Router } from 'express';
import { query } from '../../db/pg.js';
import { checkSelfExclusionStatus, applySelfExclusion, validateDepositLimit } from '../../lib/responsibleGamingEngine.mjs';
import { requireAuth } from '../middleware/userAuth.js';

const router = Router();

/** Identity only from JWT (req.user set by requireAuth). No header spoofing. */
function getUserId(req) {
  return req.user?.userId || req.user?.id || null;
}

// GET /api/responsible-gaming/status — User exclusion and limit status
router.get('/status', requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const exclusion = await checkSelfExclusionStatus(userId);
    const limitsRes = await query(
      `SELECT daily_limit, weekly_limit, monthly_limit, pending_daily_limit, pending_limit_effective_at
       FROM user_deposit_limits WHERE user_id = $1`,
      [userId],
    );

    res.json({
      success: true,
      userId,
      exclusion,
      limits: limitsRes.rows[0] || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/responsible-gaming/self-exclude — Request self-exclusion
router.post('/self-exclude', requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { durationType = '24H', reason } = req.body || {};
    const result = await applySelfExclusion(userId, durationType, reason);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/responsible-gaming/deposit-limits — Set or request change to deposit limits
router.post('/deposit-limits', requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { dailyLimit, weeklyLimit, monthlyLimit } = req.body || {};
    const id = `lim_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    await query(
      `INSERT INTO user_deposit_limits (id, user_id, daily_limit, weekly_limit, monthly_limit)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE
       SET daily_limit = EXCLUDED.daily_limit,
           weekly_limit = EXCLUDED.weekly_limit,
           monthly_limit = EXCLUDED.monthly_limit,
           updated_at = NOW()`,
      [id, userId, dailyLimit || null, weeklyLimit || null, monthlyLimit || null],
    );

    res.json({ success: true, userId, dailyLimit, weeklyLimit, monthlyLimit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
