import express from 'express';
import { requirePermission } from '../../middleware/adminAuth.js';
import {
  buildOddsDebugForMatch,
  listLiveMatchesForAdmin,
} from '../../../lib/adminLiveOps.mjs';

const router = express.Router();

/**
 * GET /api/admin/odds/live-matches
 * Live matches available for odds desk / pricing debug.
 */
router.get('/live-matches', requirePermission('trading', 'odds', 'sports'), async (_req, res) => {
  try {
    const payload = await listLiveMatchesForAdmin({ limit: 60 });
    res.json({ success: true, ...payload });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/odds/:matchId/debug
 * Authoritative V3 pricing debug from real aggregator match state.
 */
router.get('/:matchId/debug', requirePermission('trading', 'odds', 'sports'), async (req, res) => {
  try {
    const payload = await buildOddsDebugForMatch(req.params.matchId, {
      team1: req.query.team1 ? String(req.query.team1) : undefined,
      team2: req.query.team2 ? String(req.query.team2) : undefined,
    });
    res.json(payload);
  } catch (err) {
    res.status(err.statusCode || 500).json({
      success: false,
      error: err.message,
    });
  }
});

export default router;
