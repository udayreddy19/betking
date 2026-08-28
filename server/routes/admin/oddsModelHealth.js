/**
 * Admin Odds Model Health & Calibration API (server/routes/admin/oddsModelHealth.js)
 * 
 * Provides internal telemetry endpoints for:
 * - Odds Model Calibration (Brier Score, Log-Loss, Drift)
 * - Historical Replay Engine
 * - Odds Quality & Inconsistency Audits
 */

import express from 'express';
import { calculateCalibrationMetrics } from '../../../lib/odds-v3/calibration/calibrationEngine.mjs';
import { replayHistoricalOdds } from '../../../lib/odds-v3/replay/historicalReplayEngine.mjs';

const router = express.Router();

/**
 * GET /api/admin/odds-model/health
 * Returns overall calibration statistics and model versions
 */
router.get('/health', async (req, res) => {
  try {
    const sport = req.query.sport;
    const metrics = calculateCalibrationMetrics({ sport });
    
    return res.json({
      success: true,
      data: {
        timestamp: new Date().toISOString(),
        models: {
          cricket: 'v3_parametric_physics',
          soccer: 'dixon_coles_v1',
          tennis: 'tennis_markov_v1',
          basketball: 'basketball_pace_v1',
        },
        calibration: metrics,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/odds-model/replay
 * Replays historical match state to verify pricing determinism
 */
router.post('/replay', async (req, res) => {
  try {
    const { historicalEvent, configOverride } = req.body || {};
    if (!historicalEvent?.matchState) {
      return res.status(400).json({ success: false, error: 'historicalEvent.matchState is required' });
    }

    const result = replayHistoricalOdds(historicalEvent, configOverride);
    return res.json({ success: true, data: result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
