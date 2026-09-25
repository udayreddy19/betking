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

/** POST /api/admin/trading/risk/simulate — same authoritative DB exposure as production */
router.post('/risk/simulate', requireRole('SUPER_ADMIN', 'TRADING_ADMIN', 'RISK_ANALYST'), async (req, res) => {
  try {
    const { simulateBetRisk } = await import('../../../lib/risk/riskSimulation.mjs');
    const result = await simulateBetRisk(req.body || {});
    res.json({ success: true, simulation: result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/** GET /api/admin/trading/exposure/reconcile — compare store vs open bets */
router.get('/exposure/reconcile', requireRole('SUPER_ADMIN', 'TRADING_ADMIN', 'FINANCE_ADMIN'), async (req, res) => {
  try {
    const { reconcileExposureFromOpenBets, AUTHORITATIVE_EXPOSURE_SOURCE } = await import('../../../lib/persistedMarketLiability.mjs');
    const result = await reconcileExposureFromOpenBets({
      matchId: req.query.matchId || null,
      limit: Number(req.query.limit) || 200,
    });
    res.json({ success: true, authoritativeExposureSource: AUTHORITATIVE_EXPOSURE_SOURCE, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/trading/exposure/rebuild
 * Body: { dryRun?: true, matchId?, confirm?: 'REBUILD_EXPOSURE' }
 */
router.post('/exposure/rebuild', requireRole('SUPER_ADMIN', 'FINANCE_ADMIN'), async (req, res) => {
  try {
    const dryRun = req.body?.dryRun !== false; // default dry-run
    if (!dryRun && req.body?.confirm !== 'REBUILD_EXPOSURE') {
      return res.status(400).json({
        success: false,
        error: 'Confirmation required: confirm=REBUILD_EXPOSURE when dryRun=false',
      });
    }
    const { rebuildExposureFromOpenBets } = await import('../../../lib/persistedMarketLiability.mjs');
    const result = await rebuildExposureFromOpenBets({
      dryRun,
      matchId: req.body?.matchId || null,
    });
    try {
      const { logAdminAction } = await import('../../middleware/auditLogger.js');
      await logAdminAction({
        actorId: req.admin?.id || 'finance',
        targetId: req.body?.matchId || 'all',
        action: dryRun ? 'EXPOSURE_REBUILD_DRY_RUN' : 'EXPOSURE_REBUILT',
        details: result,
      });
    } catch { /* ignore */ }
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** GET /api/admin/trading/risk/hierarchy — effective limit layers */
router.get('/risk/hierarchy', requireRole('SUPER_ADMIN', 'TRADING_ADMIN', 'RISK_ANALYST'), async (req, res) => {
  try {
    const { resolveEffectiveRiskLimits, getDefaultRiskHierarchy } = await import('../../../lib/risk/riskHierarchy.mjs');
    const effective = resolveEffectiveRiskLimits({
      sport: req.query.sport,
      competition: req.query.competition,
      matchId: req.query.matchId,
      marketId: req.query.marketId,
      userId: req.query.userId,
    });
    res.json({
      success: true,
      defaults: getDefaultRiskHierarchy(),
      effective,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/trading/risk/desk-tree
 * Drill-down: GLOBAL → SPORT → COMPETITION → EVENT → MARKET using authoritative DB exposure.
 */
router.get('/risk/desk-tree', requireRole('SUPER_ADMIN', 'TRADING_ADMIN', 'RISK_ANALYST'), async (req, res) => {
  try {
    const { getDefaultRiskHierarchy, resolveEffectiveRiskLimits } = await import('../../../lib/risk/riskHierarchy.mjs');
    const { getOpenMatchNetLiability, AUTHORITATIVE_EXPOSURE_SOURCE } = await import('../../../lib/persistedMarketLiability.mjs');
    const { getBetVelocitySnapshot, VELOCITY_DEFAULTS } = await import('../../../lib/risk/betVelocityBreaker.mjs');
    const hierarchy = getDefaultRiskHierarchy();
    const sport = String(req.query.sport || 'cricket').toLowerCase();
    const matchId = req.query.matchId || null;
    const marketId = req.query.marketId || null;
    const competition = req.query.competition || null;
    const userId = req.query.userId || null;

    const effective = resolveEffectiveRiskLimits({
      sport,
      competition,
      matchId,
      marketId,
      userId,
    });

    let currentExposure = 0;
    if (matchId) {
      currentExposure = await getOpenMatchNetLiability(matchId);
    }

    const maxExposure = effective.maxLiability || hierarchy.GLOBAL.maxLiability || 0;
    const remaining = Math.max(0, maxExposure - currentExposure);
    const velocity = getBetVelocitySnapshot(VELOCITY_DEFAULTS);

    const layerStatus = (limit, used) => {
      if (!(limit > 0)) return 'UNLIMITED';
      const ratio = used / limit;
      if (ratio >= 1) return 'CRITICAL';
      if (ratio >= 0.85) return 'HIGH';
      if (ratio >= 0.6) return 'ELEVATED';
      return 'NORMAL';
    };

    res.json({
      success: true,
      authoritativeExposureSource: AUTHORITATIVE_EXPOSURE_SOURCE,
      focus: { sport, competition, matchId, marketId, userId },
      layers: [
        {
          level: 'GLOBAL',
          maxStake: hierarchy.GLOBAL.maxStake,
          maxPayout: hierarchy.GLOBAL.maxPayout,
          maxLiability: hierarchy.GLOBAL.maxLiability,
          currentExposure: matchId ? currentExposure : null,
          remainingCapacity: matchId ? remaining : null,
          velocity,
          status: matchId ? layerStatus(hierarchy.GLOBAL.maxLiability, currentExposure) : 'OK',
        },
        {
          level: 'SPORT',
          key: sport,
          maxStake: hierarchy.SPORT?.[sport]?.maxStake ?? null,
          effectiveMaxStake: effective.maxStake,
          status: 'OK',
        },
        {
          level: 'COMPETITION',
          key: competition,
          maxStake: competition ? (hierarchy.COMPETITION?.[competition]?.maxStake ?? null) : null,
          status: competition ? 'OK' : 'SELECT',
        },
        {
          level: 'EVENT',
          key: matchId,
          currentExposure: matchId ? currentExposure : null,
          maxLiability: effective.maxLiability,
          remainingCapacity: matchId ? remaining : null,
          status: matchId ? layerStatus(effective.maxLiability, currentExposure) : 'SELECT',
        },
        {
          level: 'MARKET',
          key: marketId,
          maxStake: marketId ? (hierarchy.MARKET?.[String(marketId).toLowerCase()]?.maxStake ?? null) : null,
          status: marketId ? 'OK' : 'SELECT',
        },
        {
          level: 'USER',
          key: userId,
          maxStake: effective.layers?.USER?.maxStake ?? hierarchy.USER?.defaultMaxStake,
          status: userId ? 'OK' : 'SELECT',
        },
      ],
      effective,
      velocity,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** GET /api/admin/trading/hardening-status — engines, feeds, velocity, calibration, casino scope */
router.get('/hardening-status', requireRole('SUPER_ADMIN', 'TRADING_ADMIN', 'RISK_ANALYST', 'OPERATIONS_ADMIN'), async (req, res) => {
  try {
    const { getEngineModeStatus } = await import('../../../lib/odds-v4/EngineModeControl.mjs');
    const { getOtherSportsEngineModeStatus } = await import('../../../lib/other-sports-v4/EngineModeControl.mjs');
    const { getEngineFallbackMetrics } = await import('../../../lib/odds-v4/engineDispatch.mjs');
    const { getFeedHealthSnapshot } = await import('../../../lib/feedHealthEngine.mjs');
    const { getBetVelocitySnapshot } = await import('../../../lib/risk/betVelocityBreaker.mjs');
    const { getCalibrationValidationStatus } = await import('../../../lib/odds-v4/calibration/calibrationBridge.mjs');
    const { getCasinoAggregatorStatus } = await import('../../../lib/casinoAggregator.mjs');

    let orphanOpen = 0;
    try {
      const r = await query(
        `SELECT COUNT(*)::int AS c FROM bets
         WHERE UPPER(status) IN ('ACCEPTED','PENDING','OPEN')
           AND settlement_reason ILIKE 'PROVIDER_FINALITY%'`,
      );
      orphanOpen = r.rows[0]?.c || 0;
    } catch { /* ignore */ }

    res.json({
      success: true,
      cricketEngine: getEngineModeStatus(),
      otherSportsEngine: getOtherSportsEngineModeStatus(),
      fallbacks: getEngineFallbackMetrics(),
      feeds: getFeedHealthSnapshot(),
      velocity: getBetVelocitySnapshot(),
      calibration: getCalibrationValidationStatus(),
      casino: getCasinoAggregatorStatus(),
      orphanFlaggedBets: orphanOpen,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
