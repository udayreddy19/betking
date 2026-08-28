import express from 'express';
import { calculateCalibrationMetrics } from '../../../lib/odds-v3/calibration/calibrationEngine.mjs';
import { replayHistoricalOdds } from '../../../lib/odds-v3/replay/historicalReplayEngine.mjs';
import { evaluateModelDrift } from '../../../lib/odds-v3/telemetry/driftDetector.mjs';
import { analyzeOddsMovement } from '../../../lib/odds-v3/telemetry/oddsMovementAnalyzer.mjs';
import { analyzeProviderDivergence } from '../../../lib/odds-v3/telemetry/providerDivergenceAnalyzer.mjs';
import { queryObservations, getObservationStats } from '../../../lib/odds-v3/telemetry/oddsObservationStore.mjs';
import { evaluateShadowPricing } from '../../../lib/odds-v3/canary/shadowPricingEngine.mjs';
import { runHistoricalBacktest } from '../../../lib/odds-v3/replay/backtestRunner.mjs';

const router = express.Router();

/**
 * GET /api/admin/odds-model/health
 * Returns overall calibration statistics, model versions, and observation stats
 */
router.get('/health', async (req, res) => {
  try {
    const sport = req.query.sport;
    const metrics = calculateCalibrationMetrics({ sport });
    const stats = getObservationStats();
    
    return res.json({
      success: true,
      data: {
        timestamp: new Date().toISOString(),
        engineVersion: '3.0.0',
        models: {
          cricket: 'ODDS_V3_CRICKET_V3.1',
          soccer: 'ODDS_V3_SOCCER_V3.1',
          tennis: 'ODDS_V3_TENNIS_V3.1',
          basketball: 'ODDS_V3_BASKETBALL_V3.1',
        },
        calibration: metrics,
        observationStore: stats,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/odds-model/drift
 * Returns rolling 24h, 7d, 30d model drift metrics
 */
router.get('/drift', async (req, res) => {
  try {
    const { sport, modelVersion } = req.query;
    const drift = evaluateModelDrift({ sport, modelVersion });
    return res.json({ success: true, data: drift });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/odds-model/movement
 * Analyzes market stability, price jumps, and flickering
 */
router.get('/movement', async (req, res) => {
  try {
    const observations = queryObservations({ limit: 200 });
    const analysis = analyzeOddsMovement(observations);
    return res.json({ success: true, data: analysis });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/odds-model/providers
 * Returns divergence and consensus metrics across feed providers
 */
router.get('/providers', async (req, res) => {
  try {
    const observations = queryObservations({ limit: 500 });
    const pairs = observations
      .filter(o => o.providerProb !== null)
      .map(o => ({ modelProb: o.probability, providerProb: o.providerProb }));
    
    const analysis = analyzeProviderDivergence(pairs);
    return res.json({ success: true, data: analysis });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/odds-model/canary/evaluate
 * Evaluates candidate shadow pricing against authoritative baseline
 */
router.post('/canary/evaluate', async (req, res) => {
  try {
    const { matchState, config } = req.body || {};
    if (!matchState) {
      return res.status(400).json({ success: false, error: 'matchState is required' });
    }
    const result = evaluateShadowPricing(matchState, config);
    return res.json({ success: true, data: result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/odds-model/backtest/run
 * Runs historical timeline backtest
 */
router.post('/backtest/run', async (req, res) => {
  try {
    const { timeline, sport, config } = req.body || {};
    const result = runHistoricalBacktest({ timeline, sport, config });
    return res.json({ success: true, data: result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/odds-model/latency
 * Analyzes feed latency distribution and stale circuit breaker trips
 */
router.get('/latency', async (req, res) => {
  try {
    const observations = queryObservations({ limit: 500 });
    const { analyzeFeedLatency } = await import('../../../lib/odds-v3/telemetry/feedLatencyAnalyzer.mjs');
    const analysis = analyzeFeedLatency(observations);
    return res.json({ success: true, data: analysis });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/odds-model/dataset/audit
 * Audits a raw dataset for future leakage, missing outcomes, and quality score
 */
router.post('/dataset/audit', async (req, res) => {
  try {
    const { observations } = req.body || {};
    const { auditDatasetQuality } = await import('../../../lib/odds-v3/dataset/dataQualityEngine.mjs');
    const audit = auditDatasetQuality(observations);
    return res.json({ success: true, data: audit });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/odds-model/walk-forward
 * Executes chronological forward-chaining cross validation
 */
router.post('/walk-forward', async (req, res) => {
  try {
    const { observations, sport, config } = req.body || {};
    const { runWalkForwardValidation } = await import('../../../lib/odds-v3/replay/walkForwardValidator.mjs');
    const result = runWalkForwardValidation(observations, { sport, config });
    return res.json({ success: true, data: result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/odds-model/empirical-calibration
 * Evaluates Platt scaling / post-hoc calibration correction
 */
router.post('/empirical-calibration', async (req, res) => {
  try {
    const { trainSet, testSet } = req.body || {};
    const { evaluateEmpiricalCalibration } = await import('../../../lib/odds-v3/calibration/empiricalCalibration.mjs');
    const result = evaluateEmpiricalCalibration({ trainSet, testSet });
    return res.json({ success: true, data: result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/odds-model/empirical-rho
 * Computes empirical Pearson correlation between paired SGP outcomes
 */
router.post('/empirical-rho', async (req, res) => {
  try {
    const { pairedObservations, marketTypeA, marketTypeB, configuredRho } = req.body || {};
    const { calculateEmpiricalRho } = await import('../../../lib/odds-v3/pricing/sgpEmpiricalRho.mjs');
    const result = calculateEmpiricalRho(pairedObservations, { marketTypeA, marketTypeB, configuredRho });
    return res.json({ success: true, data: result });
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
