/**
 * Phase 22 Integration & Optimization Test Suite
 * 
 * Validates:
 * 1. Candidate Registry (v3.2-candidate-001 through 005 lifecycle).
 * 2. Covariance-Aware Provider Blending (Candidate 001).
 * 3. Regime-Specific Model Blending (Candidate 002).
 * 4. Adaptive Volatility Calibration (Candidate 003).
 * 5. Advanced Cricket State Model & Monotonicity (Candidate 004).
 * 6. Segmented Market Calibration (Candidate 005).
 * 7. Walk-Forward Backtest Engine (zero leakage guarantee).
 * 8. Parallel Shadow Runner and Divergence Classification.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerCandidate,
  getCandidate,
  listCandidates,
  updateCandidateStatus,
  resetCandidateRegistry,
  CANDIDATE_STATUS,
} from '../../../lib/odds-v3/optimization/candidateRegistry.mjs';
import {
  calculateCovarianceAwareWeights,
  blendProviderOddsCovariance,
} from '../../../lib/odds-v3/optimization/covarianceAwareProviderBlend.mjs';
import {
  detectPricingRegime,
  blendByRegime,
  PRICING_REGIMES,
} from '../../../lib/odds-v3/optimization/regimeBlendEngine.mjs';
import {
  applyAdaptiveVolatilityCalibration,
  VOLATILITY_REGIMES,
} from '../../../lib/odds-v3/optimization/adaptiveVolatilityCalibration.mjs';
import {
  calculateAdvancedCricketProbabilities,
} from '../../../lib/odds-v3/optimization/cricketCandidateModel.mjs';
import {
  fitTemperatureScaling,
  evaluateSegmentedCalibration,
} from '../../../lib/odds-v3/optimization/marketCalibrationEngine.mjs';
import {
  runWalkForwardBacktest,
} from '../../../lib/odds-v3/optimization/backtestEngine.mjs';
import {
  runShadowOptimizationEvaluation,
} from '../../../lib/odds-v3/optimization/OddsShadowRunner.mjs';
import {
  classifyShadowDivergence,
  DIVERGENCE_CLASSES,
} from '../../../lib/odds-v3/optimization/shadowComparisonEngine.mjs';

describe('Phase 22 — OddsEngine V3 Intelligent Pricing Optimization & Shadow Framework', () => {
  beforeEach(() => {
    resetCandidateRegistry();
  });

  describe('1. Candidate Registry Lifecycle', () => {
    it('initializes all 5 default candidate optimization models in SHADOW status', () => {
      const list = listCandidates();
      expect(list.length).toBe(5);
      expect(list.map((c) => c.id)).toContain('v3.2-candidate-001');
      expect(list.map((c) => c.id)).toContain('v3.2-candidate-005');
      expect(list[0].status).toBe(CANDIDATE_STATUS.SHADOW);
    });

    it('updates candidate status with audit metadata and enforces valid enum', () => {
      const updated = updateCandidateStatus('v3.2-candidate-001', 'APPROVAL_REQUIRED', {
        reason: 'Backtest demonstrated statistically significant Brier reduction.',
        approvedBy: 'LEAD_QUANT_OFFICER',
      });
      expect(updated.status).toBe(CANDIDATE_STATUS.APPROVAL_REQUIRED);
      expect(updated.approvalStatus.approvedBy).toBe('LEAD_QUANT_OFFICER');

      expect(() => updateCandidateStatus('v3.2-candidate-001', 'INVALID_STATUS')).toThrow();
    });
  });

  describe('2. Candidate 001: Covariance-Aware Provider Blending', () => {
    it('calculates weights bounded to [0, 1] summing to 1.0 and penalizes collinear feeds', () => {
      const res = calculateCovarianceAwareWeights({
        providers: ['cricbuzz', 'crex', 'espn', 'tencric'],
        feedMetadata: {
          cricbuzz: { available: true, odds: { odds1: 1.85, odds2: 1.95 }, latencyMs: 100 },
          crex:     { available: true, odds: { odds1: 1.84, odds2: 1.96 }, latencyMs: 110 },
          espn:     { available: true, odds: { odds1: 1.86, odds2: 1.94 }, latencyMs: 200 },
          tencric:  { available: true, odds: { odds1: 1.83, odds2: 1.97 }, latencyMs: 300 },
        },
      });

      expect(res.status).toBe('COVARIANCE_WEIGHTED');
      expect(res.activeCount).toBe(4);
      const sumW = Object.values(res.weights).reduce((a, b) => a + b, 0);
      expect(sumW).toBeCloseTo(1.0, 2);
      expect(res.effectiveIndependence).toBeLessThan(1.0);
    });

    it('assigns zero weight to stale providers exceeding 15,000ms threshold', () => {
      const res = calculateCovarianceAwareWeights({
        providers: ['cricbuzz', 'crex'],
        feedMetadata: {
          cricbuzz: { available: true, odds: { odds1: 1.85, odds2: 1.95 }, timestamp: new Date(Date.now() - 25000).toISOString() }, // stale
          crex:     { available: true, odds: { odds1: 1.84, odds2: 1.96 }, timestamp: new Date().toISOString() }, // fresh
        },
      });

      expect(res.status).toBe('SINGLE_PROVIDER');
      expect(res.weights.cricbuzz).toBeUndefined();
      expect(res.weights.crex).toBe(1.0);
    });
  });

  describe('3. Candidate 002: Regime-Specific Model Blending', () => {
    it('detects match regimes dynamically based on game state and telemetry', () => {
      const deathRegime = detectPricingRegime({
        sport: 'cricket',
        matchState: { ballsRemaining: 18, ballsCompleted: 102 },
      });
      expect(deathRegime).toBe(PRICING_REGIMES.LATE_GAME);

      const staleRegime = detectPricingRegime({
        feedAgeMs: 18000,
      });
      expect(staleRegime).toBe(PRICING_REGIMES.STALE_PROVIDER);
    });

    it('blends model and provider with regime-specific weights', () => {
      const deathBlend = blendByRegime({
        modelProb: 0.70,
        providerProb: 0.50,
        regime: PRICING_REGIMES.LATE_GAME, // model weight 0.80, provider 0.20
      });
      expect(deathBlend.candidateVersion).toBe('v3.2-candidate-002');
      // 0.80 * 0.70 + 0.20 * 0.50 = 0.56 + 0.10 = 0.66
      expect(deathBlend.blendedProbability).toBeCloseTo(0.66, 2);
    });
  });

  describe('4. Candidate 003: Adaptive Volatility Calibration', () => {
    it('suppresses micro-noise on high delta without match state events', () => {
      const res = applyAdaptiveVolatilityCalibration({
        previousProb: 0.50,
        newProb: 0.65, // +0.15 jump
        matchStateEvent: null, // NO state change
        providerDivergence: 0.18, // high divergence
      });

      expect(res.noiseSuppressed).toBe(true);
      expect(res.calibratedProbability).toBeLessThan(0.65);
      expect(res.calibratedProbability).toBeGreaterThan(0.50);
    });

    it('preserves genuine information when match state events occur', () => {
      const res = applyAdaptiveVolatilityCalibration({
        previousProb: 0.50,
        newProb: 0.72,
        matchStateEvent: 'WICKET',
        providerDivergence: 0.02,
      });

      expect(res.noiseSuppressed).toBe(false);
      expect(res.calibratedProbability).toBe(0.72);
      expect(res.isStateDriven).toBe(true);
    });
  });

  describe('5. Candidate 004: Advanced Cricket State Model & Monotonicity', () => {
    it('incorporates death over dynamics while preserving monotonicity on run increases', () => {
      const state1 = {
        runsRequired: 40,
        ballsRemaining: 24,
        wicketsRemaining: 6,
        ballsCompleted: 96,
        target: 180,
        chasingScore: 140,
        format: 'T20',
      };
      const res1 = calculateAdvancedCricketProbabilities(state1);

      // Scoring 10 more runs should increase win probability
      const state2 = { ...state1, runsRequired: 30, chasingScore: 150 };
      const res2 = calculateAdvancedCricketProbabilities(state2);

      expect(res2.pChase).toBeGreaterThan(res1.pChase);
      expect(res1.featureAudit.unavailable.pitchDeterioration).toBe('FEATURE_UNAVAILABLE');
    });

    it('losing wickets reduces win probability monotonically', () => {
      const state1 = {
        runsRequired: 30,
        ballsRemaining: 18,
        wicketsRemaining: 6,
        ballsCompleted: 102,
        target: 160,
        chasingScore: 130,
        format: 'T20',
      };
      const res1 = calculateAdvancedCricketProbabilities(state1);

      const state2 = { ...state1, wicketsRemaining: 4 }; // lost 2 wickets
      const res2 = calculateAdvancedCricketProbabilities(state2);

      expect(res2.pChase).toBeLessThan(res1.pChase);
    });
  });

  describe('6. Candidate 005: Segmented Market Calibration', () => {
    it('applies temperature scaling calibration smoothly without bounds violations', () => {
      const res = evaluateSegmentedCalibration({
        sport: 'cricket',
        market: 'match_winner',
        rawProbability: 0.75,
        temperature: 1.10,
      });

      expect(res.candidateVersion).toBe('v3.2-candidate-005');
      expect(res.calibratedProbability).toBeGreaterThan(0.0);
      expect(res.calibratedProbability).toBeLessThan(1.0);
    });
  });

  describe('7. Walk-Forward Backtest Engine', () => {
    it('executes chronological walk-forward splits and enforces anti-leakage validation', () => {
      const syntheticDataset = [];
      const now = Date.now();

      for (let i = 0; i < 50; i++) {
        const predTime = new Date(now - (50 - i) * 60000).toISOString();
        const settleTime = new Date(now - (50 - i) * 60000 + 30000).toISOString(); // 30s later
        syntheticDataset.push({
          predictionTimestamp: predTime,
          settlementTimestamp: settleTime,
          baselineProb: 0.60,
          candidateProb: 0.65,
          actualOutcome: 1,
        });
      }

      const res = runWalkForwardBacktest({ dataset: syntheticDataset });
      expect(res.totalSamples).toBe(50);
      expect(res.testSamples).toBeGreaterThan(0);
      expect(res.baselineMetrics.brier).toBeDefined();
      expect(res.candidateMetrics.brier).toBeDefined();
    });

    it('rejects data with look-ahead leakage immediately', () => {
      const leakedDataset = [
        {
          predictionTimestamp: '2026-08-28T12:00:00.000Z',
          settlementTimestamp: '2026-08-28T11:59:00.000Z', // ILLEGAL: settled BEFORE prediction
          baselineProb: 0.5,
          actualOutcome: 1,
        },
      ];

      expect(() => runWalkForwardBacktest({ dataset: leakedDataset })).toThrow(/Data leakage detected/);
    });
  });

  describe('8. Shadow Runner & Divergence Classification', () => {
    it('executes candidate in parallel with baseline without modifying live output', () => {
      const matchState = {
        matchId: 'm_shd_test',
        sport: 'cricket',
        status: 'LIVE',
        ballsRemaining: 24,
        runsRequired: 35,
        wicketsRemaining: 6,
        ballsCompleted: 96,
        target: 170,
        chasingScore: 135,
        format: 'T20',
      };

      const result = runShadowOptimizationEvaluation({
        matchState,
        candidateId: 'v3.2-candidate-004',
      });

      expect(result.baselineSnapshot).toBeDefined();
      expect(result.candidateOutput).toBeDefined();
      expect(result.comparison.classification).toBeDefined();
      expect(result.latencyMs).toBeLessThan(50);
    });

    it('classifies divergence classes accurately', () => {
      const baseSnap = { markets: [{ marketId: 'match_winner', selections: [{ probability: 0.50 }] }] };
      
      const nearIdentical = classifyShadowDivergence(baseSnap, { pChase: 0.505 });
      expect(nearIdentical.classification).toBe(DIVERGENCE_CLASSES.NEAR_IDENTICAL);

      const minorDiff = classifyShadowDivergence(baseSnap, { pChase: 0.53 });
      expect(minorDiff.classification).toBe(DIVERGENCE_CLASSES.MINOR_DIFFERENCE);

      const meaningfulDiff = classifyShadowDivergence(baseSnap, { pChase: 0.58 });
      expect(meaningfulDiff.classification).toBe(DIVERGENCE_CLASSES.MEANINGFUL_DIFFERENCE);

      const highDiv = classifyShadowDivergence(baseSnap, { pChase: 0.70 });
      expect(highDiv.classification).toBe(DIVERGENCE_CLASSES.HIGH_DIVERGENCE);
    });
  });
});
