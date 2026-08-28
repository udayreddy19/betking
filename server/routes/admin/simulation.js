/**
 * Match Odds Simulation & Stress Testing API
 */

import { Router } from 'express';
import { requireRole } from '../../middleware/adminAuth.js';
import { runMatchOddsStressTest } from '../../../lib/oddsStressTester.mjs';

const router = Router();

// POST /api/admin/simulation/stress-test — Run synthetic match replay
router.post('/stress-test', requireRole('SUPER_ADMIN', 'TRADING_ADMIN'), (req, res) => {
  try {
    const { totalBalls = 12, matchState = {} } = req.body || {};
    const result = runMatchOddsStressTest(matchState, Math.min(60, Number(totalBalls) || 12));
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
