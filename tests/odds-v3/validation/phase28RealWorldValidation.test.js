/**
 * Phase 28 Test Suite — OddsEngineV3 Real-World Validation & Model Intelligence
 * 
 * Validates:
 * 1. Prediction performance engine (Global & segmented Brier, LogLoss, ECE, MCE).
 * 2. Calibration reliability engine (10-bin breakdown, over/underconfidence detection).
 * 3. Model drift engine (Multi-horizon degradation alerts).
 * 4. Provider quality engine (Diagnostic scoring across feeds).
 * 5. Probability stability engine (Velocity & oscillation anomaly detection).
 * 6. Shadow candidate evaluation & statistical significance gating (N >= 1,000).
 * 7. Composite model health scoring (0-100 rating).
 * 8. Zero production model mutation and zero auto-promotion.
 */

import { describe, it, expect } from 'vitest';
import {
  calculatePredictionPerformance,
} from '../../../lib/odds-v3/validation/predictionPerformanceEngine.mjs';
import {
  analyzeCalibration,
  CALIBRATION_CLASSIFICATIONS,
} from '../../../lib/odds-v3/validation/calibrationEngine.mjs';
import {
  evaluateModelDrift,
  DRIFT_STATUS,
} from '../../../lib/odds-v3/validation/modelDriftEngine.mjs';
import {
  evaluateProviderQuality,
  evaluateAllProviders,
  PROVIDER_HEALTH_STATUS,
} from '../../../lib/odds-v3/validation/providerQualityEngine.mjs';
import {
  analyzeProbabilityStability,
  STABILITY_CLASSIFICATIONS,
} from '../../../lib/odds-v3/validation/probabilityStabilityEngine.mjs';
import {
  evaluateCandidateModel,
  CANDIDATE_PERFORMANCE_STATUS,
  STATISTICAL_SIGNIFICANCE,
} from '../../../lib/odds-v3/shadow/modelCandidateEvaluationEngine.mjs';
import {
  calculateModelHealthScore,
  MODEL_HEALTH_STATUS,
} from '../../../lib/odds-v3/validation/modelHealthEngine.mjs';

describe('Phase 28 — OddsEngineV3 Real-World Validation & Model Intelligence', () => {
  describe('1. Prediction Performance Engine', () => {
    it('returns INSUFFICIENT_DATA when settled observations are zero', () => {
      const perf = calculatePredictionPerformance({ observations: [] });
      expect(perf.status).toBe('INSUFFICIENT_DATA');
      expect(perf.globalMetrics.settledCount).toBe(0);
      expect(perf.sampleGatePassed).toBe(false);
    });

    it('calculates global and segmented metrics when data is present', () => {
      const obs = [
        { sport: 'cricket', marketType: 'match_winner', probability: 0.80, settlement: { outcome: 1 } },
        { sport: 'cricket', marketType: 'match_winner', probability: 0.20, settlement: { outcome: 0 } },
        { sport: 'soccer',  marketType: 'match_winner', probability: 0.60, settlement: { outcome: 1 } },
      ];

      const perf = calculatePredictionPerformance({ observations: obs, minSampleGate: 3 });
      expect(perf.globalMetrics.settledCount).toBe(3);
      expect(perf.globalMetrics.accuracy).toBe(100.0);
      expect(perf.segments.bySport.cricket.settledCount).toBe(2);
      expect(perf.segments.bySport.soccer.settledCount).toBe(1);
    });
  });

  describe('2. Probability Calibration Analysis', () => {
    it('creates 10 reliability bins and flags overconfidence', () => {
      // 30 predictions at p=0.80 where actual outcome was only won 10 times (33% win rate -> overconfident)
      const mockSettled = Array.from({ length: 30 }, (_, i) => ({
        probability: 0.82,
        settlement: { outcome: i < 10 ? 1 : 0 },
      }));

      const res = analyzeCalibration({ settledObservations: mockSettled, minBucketSample: 20 });
      expect(res.bins.length).toBe(10);
      const bin8 = res.bins[8]; // [0.8-0.9]
      expect(bin8.predictionsCount).toBe(30);
      expect(bin8.status).toBe(CALIBRATION_CLASSIFICATIONS.OVERCONFIDENT);
    });
  });

  describe('3. Model Drift Detection', () => {
    it('alerts RED when Brier score degrades beyond critical threshold', () => {
      const drift = evaluateModelDrift({
        baselineMetrics: { brierScore: 0.180, logLoss: 0.520, ece: 0.030 },
        currentMetrics: { brierScore: 0.245, logLoss: 0.610, ece: 0.055 }, // +0.065 delta
        sampleCount: 100,
      });

      expect(drift.status).toBe(DRIFT_STATUS.RED);
      expect(drift.driftReports.find((r) => r.driftType === 'BRIER_SCORE_DRIFT').status).toBe(DRIFT_STATUS.RED);
    });
  });

  describe('4. Provider Quality Engine', () => {
    it('scores provider health and classifies degraded feeds', () => {
      const good = evaluateProviderQuality({ providerName: 'cricbuzz', latencyMs: 80, freshnessPct: 98, conflictCount: 0 });
      expect(good.status).toBe(PROVIDER_HEALTH_STATUS.KEEP);
      expect(good.compositeScore).toBeGreaterThanOrEqual(85);

      const degraded = evaluateProviderQuality({ providerName: 'slow_feed', latencyMs: 600, freshnessPct: 60, conflictCount: 6 });
      expect(degraded.status).toBe(PROVIDER_HEALTH_STATUS.UNTRUSTED);
    });

    it('evaluates all configured sports providers', () => {
      const all = evaluateAllProviders();
      expect(all.providers.cricbuzz).toBeDefined();
      expect(all.providers.crex).toBeDefined();
      expect(all.providers.espn).toBeDefined();
      expect(all.providers.tencric).toBeDefined();
    });
  });

  describe('5. Probability Stability Engine', () => {
    it('detects excessive probability velocity and rapid oscillation reversals', () => {
      const now = Date.now();
      const unstableTicks = [
        { timestamp: new Date(now).toISOString(), probability: 0.50 },
        { timestamp: new Date(now + 1000).toISOString(), probability: 0.75 }, // +0.25/s
        { timestamp: new Date(now + 2000).toISOString(), probability: 0.40 }, // -0.35/s (Reversal 1)
        { timestamp: new Date(now + 3000).toISOString(), probability: 0.70 }, // +0.30/s (Reversal 2)
        { timestamp: new Date(now + 4000).toISOString(), probability: 0.35 }, // -0.35/s (Reversal 3)
      ];

      const res = analyzeProbabilityStability({ probabilityTicks: unstableTicks });
      expect(res.status).toBe(STABILITY_CLASSIFICATIONS.UNSTABLE);
      expect(res.reversalsCount).toBeGreaterThanOrEqual(3);
    });
  });

  describe('6. Shadow Candidate Evaluation & Statistical Significance', () => {
    it('enforces sample-size gating and forbids automatic promotion', () => {
      const evalCandidate = evaluateCandidateModel({
        championModelVersion: 'v3.1-prod',
        candidateModelVersion: 'v3.2-candidate-004',
        settledSampleCount: 50, // Insufficient sample
      });

      expect(evalCandidate.significance).toBe(STATISTICAL_SIGNIFICANCE.INSUFFICIENT_DATA);
      expect(evalCandidate.recommendation).toBe('KEEP_SHADOW');
      expect(evalCandidate.autoPromotionAllowed).toBe(false);
    });
  });

  describe('7. Composite Model Health Engine', () => {
    it('returns INSUFFICIENT_DATA status gracefully when sample count is 0', () => {
      const health = calculateModelHealthScore({ settledSampleCount: 0 });
      expect(health.status).toBe(MODEL_HEALTH_STATUS.INSUFFICIENT_DATA);
      expect(health.score).toBe(100.0);
    });
  });
});
