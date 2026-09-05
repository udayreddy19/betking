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
    const { getCalibrationSummary } = await import('../../../lib/oddsCalibrationObservations.mjs');
    const settlementIngest = await getCalibrationSummary();
    
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
        settlementIngest,
        ritual: 'Review inverted books, 1.01 rate, and settlement ingest before the first live session.',
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

/**
 * Phase 17 Endpoints
 */

/**
 * GET /api/admin/odds-model/scorecard
 * Computes live model scorecard (Brier, LogLoss, ECE, MCE)
 */
router.get('/scorecard', async (req, res) => {
  try {
    const { sport, market, league, timeRange } = req.query;
    const { buildLiveDataset } = await import('../../../lib/odds-v3/dataset/liveDatasetBuilder.mjs');
    const { buildModelScorecard } = await import('../../../lib/odds-v3/validation/modelScorecard.mjs');

    const { dataset, metadata } = buildLiveDataset({ sport, market, league, timeRange });
    const scorecard = buildModelScorecard(dataset, metadata);
    return res.json({ success: true, data: scorecard, metadata });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/odds-model/baseline-comparison
 * Evaluates current model against provider and simple baselines
 */
router.get('/baseline-comparison', async (req, res) => {
  try {
    const { sport, market, timeRange } = req.query;
    const { buildLiveDataset } = await import('../../../lib/odds-v3/dataset/liveDatasetBuilder.mjs');
    const { compareModelBaselines } = await import('../../../lib/odds-v3/validation/modelBaselineComparator.mjs');

    const { dataset } = buildLiveDataset({ sport, market, timeRange });
    const comparison = compareModelBaselines(dataset);
    return res.json({ success: true, data: comparison });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/odds-model/providers/shadow-weights
 * Evaluates candidate shadow provider blend weights
 */
router.get('/providers/shadow-weights', async (req, res) => {
  try {
    const { buildLiveDataset } = await import('../../../lib/odds-v3/dataset/liveDatasetBuilder.mjs');
    const { computeShadowProviderWeights } = await import('../../../lib/odds-v3/pricing/providerWeightLearner.mjs');

    const { dataset } = buildLiveDataset();
    const shadowWeights = computeShadowProviderWeights(dataset);
    return res.json({ success: true, data: shadowWeights });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/odds-model/calibration/optimize
 * Optimizes calibration out-of-sample (Platt vs Isotonic vs Raw)
 */
router.post('/calibration/optimize', async (req, res) => {
  try {
    const { sport, market } = req.body || {};
    const { buildLiveDataset } = await import('../../../lib/odds-v3/dataset/liveDatasetBuilder.mjs');
    const { optimizeCalibration } = await import('../../../lib/odds-v3/calibration/calibrationOptimizer.mjs');

    const { dataset } = buildLiveDataset({ sport, market });
    const optimization = optimizeCalibration(dataset);
    return res.json({ success: true, data: optimization });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Model & Parameter Registry Routes
 */
router.get('/registry/models', async (req, res) => {
  try {
    const { listModelVersions } = await import('../../../lib/odds-v3/registry/modelRegistry.mjs');
    const models = listModelVersions(req.query);
    return res.json({ success: true, data: models });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/registry/models/status', async (req, res) => {
  try {
    const { modelVersion, status, reason } = req.body || {};
    const { updateModelStatus } = await import('../../../lib/odds-v3/registry/modelRegistry.mjs');
    const updated = updateModelStatus(modelVersion, status, { operator: req.user?.username || 'ADMIN', reason });
    return res.json({ success: true, data: updated });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/registry/parameters', async (req, res) => {
  try {
    const { getActiveParameters, listParameterHistory } = await import('../../../lib/odds-v3/registry/parameterRegistry.mjs');
    return res.json({
      success: true,
      data: {
        active: getActiveParameters(),
        history: listParameterHistory(),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/registry/parameters/update', async (req, res) => {
  try {
    const { updates, reason } = req.body || {};
    const { updateParameters } = await import('../../../lib/odds-v3/registry/parameterRegistry.mjs');
    const updated = updateParameters(updates, { operator: req.user?.username || 'ADMIN', reason });
    return res.json({ success: true, data: updated });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/canary/status', async (req, res) => {
  try {
    const { getCanaryStatus } = await import('../../../lib/odds-v3/canary/canaryRollbackEngine.mjs');
    return res.json({ success: true, data: getCanaryStatus() });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/canary/configure', async (req, res) => {
  try {
    const { enabled, canaryPercent, candidateVersion, reason } = req.body || {};
    const { configureCanary } = await import('../../../lib/odds-v3/canary/canaryRollbackEngine.mjs');
    const result = configureCanary({
      enabled,
      canaryPercent,
      candidateVersion,
      operator: req.user?.username || 'ADMIN',
      reason,
    });
    return res.json({ success: true, data: result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Phase 18 Endpoints
 */

/**
 * GET /api/admin/odds-model/integrity
 * Audits prediction-price-outcome dataset integrity
 */
router.get('/integrity', async (req, res) => {
  try {
    const { queryObservations } = await import('../../../lib/odds-v3/telemetry/oddsObservationStore.mjs');
    const { auditPredictionPriceOutcomeIntegrity } = await import('../../../lib/odds-v3/dataset/predictionPriceOutcomeIntegrity.mjs');
    const observations = queryObservations({ limit: 1000 });
    const audit = auditPredictionPriceOutcomeIntegrity(observations);
    return res.json({ success: true, data: audit });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/odds-model/disagreement
 * Evaluates provider quotes disagreement level and safety action
 */
router.post('/disagreement', async (req, res) => {
  try {
    const { quotes } = req.body || {};
    const { evaluateProviderDisagreement } = await import('../../../lib/odds-v3/pricing/providerDisagreementEngine.mjs');
    const result = evaluateProviderDisagreement(quotes);
    return res.json({ success: true, data: result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/odds-model/closing-line
 * Analyzes closing line value trajectory and flicker metrics
 */
router.get('/closing-line', async (req, res) => {
  try {
    const { queryObservations } = await import('../../../lib/odds-v3/telemetry/oddsObservationStore.mjs');
    const { aggregateClosingLineDataset } = await import('../../../lib/odds-v3/validation/closingLineAnalyzer.mjs');
    const observations = queryObservations({ limit: 1000 });
    const result = aggregateClosingLineDataset(observations);
    return res.json({ success: true, data: result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/odds-model/markets/scorecards
 * Evaluates scorecards across all supported betting markets
 */
router.get('/markets/scorecards', async (req, res) => {
  try {
    const { queryObservations } = await import('../../../lib/odds-v3/telemetry/oddsObservationStore.mjs');
    const { buildMarketScorecards } = await import('../../../lib/odds-v3/validation/marketScorecard.mjs');
    const observations = queryObservations({ limit: 2000 });
    const result = buildMarketScorecards(observations);
    return res.json({ success: true, data: result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/odds-model/margin-fairness
 * Audits published margins against safety envelope and volatility
 */
router.get('/margin-fairness', async (req, res) => {
  try {
    const { queryObservations } = await import('../../../lib/odds-v3/telemetry/oddsObservationStore.mjs');
    const { auditMarginFairness } = await import('../../../lib/odds-v3/pricing/marginFairnessAuditor.mjs');
    const observations = queryObservations({ limit: 1000 });
    const result = auditMarginFairness(observations);
    return res.json({ success: true, data: result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/odds-model/failures/taxonomy
 * Returns standard 9-category failure taxonomy metrics
 */
router.get('/failures/taxonomy', async (req, res) => {
  try {
    const { getFailureTaxonomyReport } = await import('../../../lib/odds-v3/monitoring/failureTaxonomy.mjs');
    const report = getFailureTaxonomyReport();
    return res.json({ success: true, data: report });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/odds-model/explainability
 * Generates transparent pricing lineage record
 */
router.post('/explainability', async (req, res) => {
  try {
    const { buildPriceExplainabilityRecord } = await import('../../../lib/odds-v3/pricing/priceExplainability.mjs');
    const record = buildPriceExplainabilityRecord(req.body);
    return res.json({ success: true, data: record });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Phase 19 Endpoints
 */

/**
 * GET /api/admin/odds-model/telemetry/worker-status
 * Returns background telemetry persistence status
 */
router.get('/telemetry/worker-status', async (req, res) => {
  try {
    const { getTelemetryWorkerStatus } = await import('../../../lib/odds-v3/telemetry/durableTelemetryWorker.mjs');
    const status = getTelemetryWorkerStatus();
    return res.json({ success: true, data: status });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/odds-model/telemetry/flush
 * Manually flushes batch from buffer to PostgreSQL
 */
router.post('/telemetry/flush', async (req, res) => {
  try {
    const { batchSize } = req.body || {};
    const { flushTelemetryBatch } = await import('../../../lib/odds-v3/telemetry/durableTelemetryWorker.mjs');
    const result = await flushTelemetryBatch(batchSize);
    return res.json({ success: true, data: result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/odds-model/datasets/create
 * Creates an immutable versioned dataset package
 */
router.post('/datasets/create', async (req, res) => {
  try {
    const { datasetName, observations, source, sports, markets } = req.body || {};
    const { createVersionedDataset } = await import('../../../lib/odds-v3/dataset/datasetVersioning.mjs');
    const dataset = createVersionedDataset({ datasetName, observations, source, sports, markets });
    return res.json({ success: true, data: dataset });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/odds-model/price-difference
 * Explains price difference between two observation snapshots
 */
router.post('/price-difference', async (req, res) => {
  try {
    const { obs1, obs2 } = req.body || {};
    const { explainPriceDifference } = await import('../../../lib/odds-v3/pricing/priceDifferenceExplainer.mjs');
    const result = explainPriceDifference(obs1, obs2);
    return res.json({ success: true, data: result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/odds-model/counterfactual
 * Simulates offline counterfactual pricing
 */
router.post('/counterfactual', async (req, res) => {
  try {
    const { canonicalInput, options } = req.body || {};
    const { simulateCounterfactualPricing } = await import('../../../lib/odds-v3/pricing/counterfactualPricingEngine.mjs');
    const result = simulateCounterfactualPricing(canonicalInput, options);
    return res.json({ success: true, data: result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/odds-model/sensitivity
 * Evaluates parameter partial derivatives
 */
router.post('/sensitivity', async (req, res) => {
  try {
    const { analyzeParameterSensitivity } = await import('../../../lib/odds-v3/pricing/sensitivityAnalyzer.mjs');
    const result = analyzeParameterSensitivity(req.body);
    return res.json({ success: true, data: result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/odds-model/provider-regimes
 * Evaluates multi-sport provider accuracy regimes
 */
router.get('/provider-regimes', async (req, res) => {
  try {
    const { queryObservations } = await import('../../../lib/odds-v3/telemetry/oddsObservationStore.mjs');
    const { analyzeProviderRegimes } = await import('../../../lib/odds-v3/pricing/providerRegimeAnalyzer.mjs');
    const observations = queryObservations({ limit: 1000 });
    const result = analyzeProviderRegimes(observations);
    return res.json({ success: true, data: result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/odds-model/v4/engine
 */
router.get('/v4/engine', async (_req, res) => {
  try {
    const { getEngineModeStatus, resolveOddsEngineMode, getShadowMetrics } = await import('../../../lib/odds-v4/index.mjs');
    return res.json({
      success: true,
      data: {
        ...getEngineModeStatus(),
        resolved: resolveOddsEngineMode(),
        shadow: getShadowMetrics(),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/odds-model/v4/engine  { mode: 'v3'|'v4'|'shadow' } | { clear: true }
 */
router.post('/v4/engine', async (req, res) => {
  try {
    const {
      setRuntimeEngineMode,
      clearRuntimeEngineMode,
      resolveOddsEngineMode,
    } = await import('../../../lib/odds-v4/index.mjs');
    const updatedBy = req.admin?.email || req.admin?.id || req.admin?.role || 'admin';
    let status;
    if (req.body?.clear === true || req.body?.mode === 'env') {
      status = await clearRuntimeEngineMode({ updatedBy, reason: req.body?.reason });
    } else {
      status = await setRuntimeEngineMode(req.body?.mode, {
        updatedBy,
        reason: req.body?.reason,
      });
    }
    return res.json({
      success: true,
      data: { ...status, resolved: resolveOddsEngineMode() },
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

export default router;

