/**
 * Trading Desk & Visual Heatmap API
 */

import { Router } from 'express';
import { requireRole } from '../../middleware/adminAuth.js';
import { query } from '../../../db/pg.js';
import { generateCricketLiabilityHeatmap } from '../../../lib/tradingHeatmapEngine.mjs';

const router = Router();

// GET /api/admin/trading/heatmap/:matchId — Visual run ladder & exposure heatmap
router.get('/heatmap/:matchId', requireRole('SUPER_ADMIN', 'TRADING_ADMIN', 'RISK_ANALYST'), async (req, res) => {
  try {
    const matchId = req.params.matchId;
    const betsRes = await query(
      `SELECT bet_id, stake, odds, selection_id, selection_name, line_value AS line
       FROM bets
       WHERE match_id = $1 AND status IN ('ACCEPTED', 'PLACED')`,
      [matchId],
    );

    // Get live match score
    const matchRes = await query(
      `SELECT score_home, score_away, overs_completed FROM matches WHERE match_id = $1 OR id = $1 LIMIT 1`,
      [matchId],
    );

    const currentScore = parseInt(matchRes.rows[0]?.score_home || 120, 10);
    const currentOvers = Number(matchRes.rows[0]?.overs_completed || 14.2);

    const heatmap = generateCricketLiabilityHeatmap(betsRes.rows, currentScore, currentOvers);
    res.json({ success: true, matchId, ...heatmap });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
