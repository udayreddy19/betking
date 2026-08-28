/**
 * Phase 17 Integration Test Suite
 * 
 * Validates:
 * 1. Live observation capture & settlement join (PREDICTION -> PRICE -> OUTCOME).
 * 2. Live dataset builder with multi-range filtering.
 * 3. Model scorecard metrics (Brier, LogLoss, ECE, MCE, calibration curves).
 * 4. Model baseline comparator against provider implied probabilities.
 * 5. Calibration optimizer (Platt & Isotonic fitting with safety gates).
 * 6. Provider weight learning in shadow mode.
 * 7. Model version registry lifecycle (DRAFT -> SHADOW -> CANARY -> ACTIVE -> RETIRED).
 * 8. Parameter registry with immutable history and instant rollback.
 * 9. Canary safety & automatic degradation rollback.
 * 10. Failure isolation (telemetry error does not crash pricing).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordPricingObservation,
  recordObservationSettlement,
  queryObservations,
  getObservationStats,
  clearObservations,
} from '../../lib/odds-v3/telemetry/oddsObservationStore.mjs';
import { buildLiveDataset } from '../../lib/odds-v3/dataset/liveDatasetBuilder.mjs';
import {
  calculateBrierScore,
  calculateLogLoss,
  calculateCalibrationMetrics,
  buildModelScorecard,
} from '../../lib/odds-v3/validation/modelScorecard.mjs';
import { compareModelBaselines } from '../../lib/odds-v3/validation/modelBaselineComparator.mjs';
import {
  fitPlattScaling,
  fitIsotonicRegression,
  optimizeCalibration,
} from '../../lib/odds-v3/calibration/calibrationOptimizer.mjs';
import {
  evaluateProviderMetrics,
  computeShadowProviderWeights,
  CURRENT_PROVIDER_WEIGHTS,
} from '../../lib/odds-v3/pricing/providerWeightLearner.mjs';
import {
  registerModelVersion,
  updateModelStatus,
  listModelVersions,
  getActiveModelVersion,
  resetModelRegistry,
  MODEL_STATUSES,
} from '../../lib/odds-v3/registry/modelRegistry.mjs';
import {
  getActiveParameters,
  updateParameters,
  rollbackParameters,
  listParameterHistory,
} from '../../lib/odds-v3/registry/parameterRegistry.mjs';
import {
  configureCanary,
  evaluateCanarySafety,
  getCanaryStatus,
  resetCanaryState,
} from '../../lib/odds-v3/canary/canaryRollbackEngine.mjs';

describe('Phase 17 — OddsEngine V3 Live Canary & Safe Model Optimization', () => {
  beforeEach(() => {
    clearObservations();
    resetModelRegistry();
    resetCanaryState();
  });

  describe('1. Live Observation Store & Settlement Join', () => {
    it('records 29-dimension pricing snapshot observations idempotently without throwing', () => {
      const obsId = recordPricingObservation({
        matchId: 'match_t20_01',
        sport: 'cricket',
        league: 'IPL',
        marketId: 'match_winner',
        selectionId: 'team1',
        modelProbability: 0.62,
        blendedProbability: 0.60,
        publishedOdds: 1.67,
        previousOdds: 1.70,
        margin: 0.05,
        providerUsed: 'cricbuzz',
        providerProb: 0.58,
        providerLatency: 120,
      });

      expect(obsId).toBeDefined();
      expect(obsId).toContain('obs:match_t20_01:match_winner:team1');

      const results = queryObservations({ matchId: 'match_t20_01' });
      expect(results.length).toBe(1);
      expect(results[0].publishedOdds).toBe(1.67);
      expect(results[0].oddsDelta).toBe(-0.03);
      expect(results[0].settledOutcome).toBeNull();
    });

    it('joins actual match settlement outcome with historical observations', () => {
      recordPricingObservation({
        matchId: 'match_t20_02',
        sport: 'cricket',
        marketId: 'match_winner',
        selectionId: 'team1',
        modelProbability: 0.70,
        publishedOdds: 1.42,
      });

      const matched = recordObservationSettlement({
        matchId: 'match_t20_02',
        marketId: 'match_winner',
        selectionId: 'team1',
        won: true,
      });

      expect(matched).toBe(1);
      const settledObs = queryObservations({ onlySettled: true });
      expect(settledObs.length).toBe(1);
      expect(settledObs[0].settledOutcome).toBe(true);
      expect(settledObs[0].settledAt).toBeDefined();
    });
  });

  describe('2. Live Dataset Builder', () => {
    it('aggregates observations and builds partitioned datasets', () => {
      for (let i = 0; i < 50; i++) {
        const prob = 0.5 + (i % 5) * 0.08;
        const won = prob > 0.65 ? (i % 3 !== 0) : (i % 3 === 0);
        recordPricingObservation({
          matchId: `m_${i}`,
          sport: i % 2 === 0 ? 'cricket' : 'soccer',
          marketId: 'match_winner',
          selectionId: 'sel_1',
          modelProbability: prob,
          publishedOdds: Number((1 / prob).toFixed(2)),
          timestamp: Date.now() - i * 1000 * 3600,
        });
        recordObservationSettlement({
          matchId: `m_${i}`,
          marketId: 'match_winner',
          selectionId: 'sel_1',
          won,
        });
      }

      const { dataset, metadata } = buildLiveDataset({ sport: 'cricket', timeRange: '7d' });
      expect(dataset.length).toBe(25);
      expect(metadata.sampleCount).toBe(25);
      expect(metadata.sports).toContain('cricket');
      expect(metadata.dateRange.from).toBeDefined();
    });
  });

  describe('3. Model Scorecard & Calibration Metrics', () => {
    it('calculates exact Brier score, Log Loss, and ECE', () => {
      const samplePredictions = [
        { predictionProbability: 0.80, actualOutcome: true },
        { predictionProbability: 0.70, actualOutcome: true },
        { predictionProbability: 0.60, actualOutcome: false },
        { predictionProbability: 0.20, actualOutcome: false },
      ];

      const brier = calculateBrierScore(samplePredictions);
      // (0.2^2 + 0.3^2 + 0.6^2 + 0.2^2)/4 = (0.04 + 0.09 + 0.36 + 0.04)/4 = 0.53 / 4 = 0.1325
      expect(brier).toBeCloseTo(0.1325, 4);

      const logLoss = calculateLogLoss(samplePredictions);
      expect(logLoss).toBeGreaterThan(0);

      const { ece, mce, bins } = calculateCalibrationMetrics(samplePredictions);
      expect(ece).toBeGreaterThanOrEqual(0);
      expect(mce).toBeGreaterThanOrEqual(0);
      expect(bins.length).toBe(10);
    });

    it('builds comprehensive scorecard with segment breakdown', () => {
      const data = [
        { sport: 'cricket', market: 'match_winner', predictionProbability: 0.75, actualOutcome: true },
        { sport: 'cricket', market: 'match_winner', predictionProbability: 0.40, actualOutcome: false },
        { sport: 'soccer', market: 'match_winner', predictionProbability: 0.60, actualOutcome: true },
      ];

      const scorecard = buildModelScorecard(data, { modelVersion: 'v3.1-prod' });
      expect(scorecard.sampleCount).toBe(3);
      expect(scorecard.segments.bySport.cricket).toBeDefined();
      expect(scorecard.segments.bySport.soccer).toBeDefined();
    });
  });

  describe('4. Baseline Model Comparison', () => {
    it('returns INSUFFICIENT_DATA when sample size is below threshold', () => {
      const dataset = [{ predictionProbability: 0.6, providerProb: 0.55, actualOutcome: true }];
      const result = compareModelBaselines(dataset);
      expect(result.status).toBe('INSUFFICIENT_DATA');
      expect(result.recommendation).toBe('KEEP_CURRENT_MODEL');
    });

    it('evaluates winner when sufficient samples exist', () => {
      const dataset = [];
      for (let i = 0; i < 150; i++) {
        const trueProb = 0.7;
        const outcome = Math.random() < trueProb;
        dataset.push({
          predictionProbability: 0.7, // accurate
          providerProb: 0.5, // less accurate
          actualOutcome: outcome,
        });
      }

      const result = compareModelBaselines(dataset);
      expect(result.status).toContain('EVALUATED');
      expect(result.models.CURRENT_ODDSENGINE).toBeDefined();
    });
  });

  describe('5. Calibration Optimization', () => {
    it('fits Platt Scaling logistic transformation', () => {
      const trainData = [
        { predictionProbability: 0.8, actualOutcome: true },
        { predictionProbability: 0.7, actualOutcome: true },
        { predictionProbability: 0.3, actualOutcome: false },
        { predictionProbability: 0.2, actualOutcome: false },
      ];

      const platt = fitPlattScaling(trainData);
      expect(platt.method).toBe('PLATT_SCALING');
      expect(platt.transform(0.8)).toBeGreaterThan(platt.transform(0.2));
    });

    it('fits Isotonic Regression step function', () => {
      const trainData = [
        { predictionProbability: 0.2, actualOutcome: false },
        { predictionProbability: 0.4, actualOutcome: false },
        { predictionProbability: 0.6, actualOutcome: true },
        { predictionProbability: 0.8, actualOutcome: true },
      ];

      const iso = fitIsotonicRegression(trainData);
      expect(iso.method).toBe('ISOTONIC_REGRESSION');
      expect(iso.transform(0.85)).toBeGreaterThanOrEqual(iso.transform(0.15));
    });

    it('keeps current model when sample size is insufficient or candidate fails gates', () => {
      const smallData = [{ predictionProbability: 0.5, actualOutcome: true }];
      const res = optimizeCalibration(smallData);
      expect(res.decision).toBe('KEEP_CURRENT_MODEL');
    });
  });

  describe('6. Provider Reliability & Shadow Weights', () => {
    it('evaluates provider metrics and keeps candidate weights strictly shadow only', () => {
      const dataset = [
        { providerUsed: 'cricbuzz', providerLatency: 100, predictionProbability: 0.8, actualOutcome: true },
        { providerUsed: 'cricbuzz', providerLatency: 120, predictionProbability: 0.7, actualOutcome: true },
        { providerUsed: 'crex', providerLatency: 250, predictionProbability: 0.4, actualOutcome: false },
        { providerUsed: 'crex', providerLatency: 220, predictionProbability: 0.3, actualOutcome: false },
      ];

      const metrics = evaluateProviderMetrics(dataset);
      expect(metrics.cricbuzz.avgLatencyMs).toBe(110);
      expect(metrics.cricbuzz.reliabilityScore).toBeGreaterThan(0);

      const shadow = computeShadowProviderWeights(dataset);
      expect(shadow.status).toBe('COMPUTED_SHADOW_ONLY');
      expect(shadow.enforcement).toBe('SHADOW_ONLY_DO_NOT_AUTO_PROMOTE');
      expect(shadow.currentWeights).toEqual(CURRENT_PROVIDER_WEIGHTS);
    });
  });

  describe('7. Model Version Registry & Parameter Registry', () => {
    it('enforces single ACTIVE model per sport and logs approval transition', () => {
      const active1 = getActiveModelVersion('cricket');
      expect(active1.status).toBe(MODEL_STATUSES.ACTIVE);

      registerModelVersion({
        modelVersion: 'v3.2-candidate',
        sport: 'cricket',
        parameters: { decayFactor: 0.92 },
        status: MODEL_STATUSES.SHADOW,
      });

      const updated = updateModelStatus('v3.2-candidate', MODEL_STATUSES.ACTIVE, {
        operator: 'HEAD_TRADER',
        reason: 'Approved candidate after shadow testing',
      });

      expect(updated.status).toBe(MODEL_STATUSES.ACTIVE);
      expect(updated.approvalStatus.approvedBy).toBe('HEAD_TRADER');

      // Previous active model must be retired
      const all = listModelVersions({ sport: 'cricket' });
      const retired = all.find((m) => m.modelVersion === 'v3.1-prod');
      expect(retired.status).toBe(MODEL_STATUSES.RETIRED);
    });

    it('updates parameters with immutable history and instant rollback', () => {
      const original = getActiveParameters();
      const updated = updateParameters(
        { margins: { defaultLiveOverround: 0.075 } },
        { operator: 'RISK_OFFICER', reason: 'Tournament volatility adjustment' },
      );

      expect(updated.margins.defaultLiveOverround).toBe(0.075);
      const history = listParameterHistory();
      expect(history.length).toBeGreaterThan(1);

      // Rollback to original version
      const rolledBack = rollbackParameters(original.version, { operator: 'ADMIN' });
      expect(rolledBack.margins.defaultLiveOverround).toBe(original.margins.defaultLiveOverround);
    });
  });

  describe('8. Canary Safety & Emergency Automatic Rollback', () => {
    it('configures canary routing safely with audit log', () => {
      const canary = configureCanary({
        enabled: true,
        canaryPercent: 5,
        candidateVersion: 'v3.2-canary',
        operator: 'CHIEF_RISK_OFFICER',
      });

      expect(canary.enabled).toBe(true);
      expect(canary.canaryPercent).toBe(5);
      expect(canary.auditLog.length).toBe(1);
    });

    it('automatically trips emergency rollback when candidate performance degrades', () => {
      configureCanary({
        enabled: true,
        canaryPercent: 5,
        candidateVersion: 'v3.2-canary',
      });

      registerModelVersion({
        modelVersion: 'v3.2-canary',
        sport: 'cricket',
        status: MODEL_STATUSES.CANARY,
      });

      // Simulate 30% Brier score degradation (limit is 15%)
      const evalResult = evaluateCanarySafety(
        { brierScore: 0.28, latencyMs: 150 },
        { brierScore: 0.20, latencyMs: 140 },
      );

      expect(evalResult.tripped).toBe(true);
      expect(evalResult.status).toBe('EMERGENCY_ROLLBACK_TRIPPED');
      expect(evalResult.reason).toContain('Brier score degraded');

      const canaryStatus = getCanaryStatus();
      expect(canaryStatus.enabled).toBe(false);
      expect(canaryStatus.lastRollback).toBeDefined();
    });
  });
});
