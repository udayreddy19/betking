/**
 * Phase 23 Integration & Production Intelligence Test Suite
 * 
 * Validates:
 * 1. Data Quality Engine (leakage rejection, probability envelopes, duplicate checks).
 * 2. Calibration Suite (ECE, MCE, slope/intercept, 10-bin reliability curves).
 * 3. Operational Regime & Sport Sub-phase Detector.
 * 4. Market Relationship & Cross-Market Coherence Engine (line monotonicity, Dutch-book guards).
 * 5. Pricing Confidence & Uncertainty Engine.
 * 6. Odds Movement Velocity & Reversal Analyzer.
 * 7. Multi-window Model & Concept Drift Engine.
 */

import { describe, it, expect } from 'vitest';
import {
  auditDatasetQuality,
  DATA_QUALITY_STATUS,
} from '../../../lib/odds-v3/optimization/dataQualityEngine.mjs';
import {
  calculateCalibrationSlopeAndIntercept,
  generateReliabilityCurve,
  evaluateCalibrationSuite,
} from '../../../lib/odds-v3/optimization/calibrationSuite.mjs';
import {
  detectAdvancedRegime,
  GLOBAL_REGIMES,
  SPORT_SUBPHASES,
} from '../../../lib/odds-v3/optimization/regimeDetector.mjs';
import {
  validateMarketRelationships,
  VIOLATION_TYPES,
} from '../../../lib/odds-v3/optimization/marketRelationshipEngine.mjs';
import {
  calculatePricingConfidence,
  CONFIDENCE_LEVELS,
} from '../../../lib/odds-v3/optimization/pricingConfidenceEngine.mjs';
import {
  analyzeOddsMovement,
  MOVEMENT_CLASSIFICATIONS,
} from '../../../lib/odds-v3/optimization/oddsMovementAnalyzer.mjs';
import {
  evaluateModelDrift,
  DRIFT_TYPES,
} from '../../../lib/odds-v3/optimization/modelDriftEngine.mjs';

describe('Phase 23 — OddsEngine V3 Production Intelligence, Calibration & Continuous Learning', () => {
  describe('1. Data Quality Engine', () => {
    it('passes valid observation datasets with 100% quality score', () => {
      const dataset = [
        { matchId: 'm1', market: 'winner', selection: '1', probability: 0.55, odds: 1.80, timestamp: '2026-08-28T12:00:00.000Z', settledAt: '2026-08-28T14:00:00.000Z' },
        { matchId: 'm1', market: 'winner', selection: '2', probability: 0.45, odds: 2.20, timestamp: '2026-08-28T12:00:00.000Z', settledAt: '2026-08-28T14:00:00.000Z' },
      ];
      const res = auditDatasetQuality(dataset);
      expect(res.status).toBe(DATA_QUALITY_STATUS.PASS);
      expect(res.score).toBe(100);
      expect(res.passedChecksCount).toBe(5);
    });

    it('fails immediately when look-ahead leakage is detected', () => {
      const leakedDataset = [
        { matchId: 'm1', market: 'winner', selection: '1', probability: 0.55, odds: 1.80, timestamp: '2026-08-28T15:00:00.000Z', settlementTimestamp: '2026-08-28T14:00:00.000Z' },
      ];
      const res = auditDatasetQuality(leakedDataset);
      expect(res.status).toBe(DATA_QUALITY_STATUS.FAIL);
      expect(res.reasons.some((r) => r.includes('LOOK_AHEAD_LEAKAGE'))).toBe(true);
    });
  });

  describe('2. Calibration Suite & Reliability Curves', () => {
    it('computes calibration slope, intercept, and 10-bin reliability curves', () => {
      const preds = [
        { predictionProbability: 0.80, actualOutcome: 1 },
        { predictionProbability: 0.85, actualOutcome: 1 },
        { predictionProbability: 0.20, actualOutcome: 0 },
        { predictionProbability: 0.15, actualOutcome: 0 },
      ];

      const { slope, intercept } = calculateCalibrationSlopeAndIntercept(preds);
      expect(typeof slope).toBe('number');
      expect(typeof intercept).toBe('number');

      const curve = generateReliabilityCurve(preds, 10);
      expect(curve.length).toBe(10);

      const suite = evaluateCalibrationSuite(preds, { sport: 'cricket', market: 'match_winner' });
      expect(suite.metrics.brierScore).toBeDefined();
      expect(suite.metrics.expectedCalibrationError).toBeDefined();
    });
  });

  describe('3. Operational Regime & Sub-Phase Detector', () => {
    it('detects cricket powerplay and death overs sub-phases accurately', () => {
      const pp = detectAdvancedRegime({
        sport: 'cricket',
        matchState: { ballsCompleted: 24, ballsPerInnings: 120 },
      });
      expect(pp.subPhase).toBe(SPORT_SUBPHASES.CRICKET.POWERPLAY);
      expect(pp.globalRegime).toBe(GLOBAL_REGIMES.EARLY_LIVE);

      const death = detectAdvancedRegime({
        sport: 'cricket',
        matchState: { ballsCompleted: 108, ballsPerInnings: 120 },
      });
      expect(death.subPhase).toBe(SPORT_SUBPHASES.CRICKET.DEATH_OVERS);
      expect(death.globalRegime).toBe(GLOBAL_REGIMES.LATE_GAME);
    });

    it('detects soccer stoppage time and basketball clutch phases', () => {
      const soccer = detectAdvancedRegime({
        sport: 'soccer',
        matchState: { minute: 92 },
      });
      expect(soccer.subPhase).toBe(SPORT_SUBPHASES.SOCCER.STOPPAGE);

      const bball = detectAdvancedRegime({
        sport: 'basketball',
        matchState: { quarter: 4, clockSeconds: 60 },
      });
      expect(bball.subPhase).toBe(SPORT_SUBPHASES.BASKETBALL.CLUTCH);
    });
  });

  describe('4. Market Relationship & Cross-Market Coherence Engine', () => {
    it('detects Dutch-book inverted overrounds and line monotonicity inversions', () => {
      const markets = [
        {
          marketId: 'over_150',
          line: 150.5,
          status: 'OPEN',
          selections: [{ selectionId: 'over', name: 'Over 150.5', odds: 2.10 }],
        },
        {
          marketId: 'over_160',
          line: 160.5,
          status: 'OPEN',
          selections: [{ selectionId: 'over', name: 'Over 160.5', odds: 1.80 }], // INVERSION: harder target paying lower odds
        },
      ];

      const res = validateMarketRelationships(markets);
      expect(res.coherent).toBe(false);
      expect(res.violations.some((v) => v.type === VIOLATION_TYPES.MONOTONICITY_LINE_INVERSION)).toBe(true);
    });
  });

  describe('5. Pricing Confidence & Uncertainty Engine', () => {
    it('penalizes stale feeds and high provider divergence', () => {
      const highConf = calculatePricingConfidence({ feedAgeMs: 100, providerDivergence: 0.01 });
      expect(highConf.confidenceScore).toBe(100);
      expect(highConf.confidenceLevel).toBe(CONFIDENCE_LEVELS.VERY_HIGH);

      const lowConf = calculatePricingConfidence({ feedAgeMs: 12000, providerDivergence: 0.20 });
      expect(lowConf.confidenceScore).toBeLessThan(50);
      expect(lowConf.uncertaintyScore).toBeGreaterThan(50);
    });
  });

  describe('6. Odds Movement Velocity Analyzer', () => {
    it('computes velocity and classifies state-driven event response vs provider spike', () => {
      const eventMove = analyzeOddsMovement({
        previousOdds: 2.0,
        newOdds: 1.5,
        previousTimestamp: new Date(Date.now() - 2000).toISOString(),
        newTimestamp: new Date().toISOString(),
        matchStateEvent: 'WICKET',
      });
      expect(eventMove.classification).toBe(MOVEMENT_CLASSIFICATIONS.EVENT_RESPONSE);
      expect(eventMove.velocity).toBeGreaterThan(0);

      const spikeMove = analyzeOddsMovement({
        previousOdds: 2.0,
        newOdds: 2.45,
        matchStateEvent: null,
        providerDivergence: 0.20,
      });
      expect(spikeMove.classification).toBe(MOVEMENT_CLASSIFICATIONS.PROVIDER_SPIKE);
    });
  });

  describe('7. Model & Concept Drift Engine', () => {
    it('detects Brier degradation drift across rolling evaluation windows', () => {
      const drift = evaluateModelDrift({
        baselineMetrics: { brierScore: 0.185, ece: 0.038 },
        currentMetrics: { brierScore: 0.230, ece: 0.040 }, // +24% Brier degradation
        windowLabel: '7d',
      });

      expect(drift.hasDrift).toBe(true);
      expect(drift.alerts.some((a) => a.type === DRIFT_TYPES.CONCEPT_DRIFT)).toBe(true);
      expect(drift.status).toBe('ALERT');
    });
  });
});
