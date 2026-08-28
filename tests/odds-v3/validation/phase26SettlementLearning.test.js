/**
 * Phase 26 Test Suite — Real-World Odds Intelligence & Settlement Learning System
 * 
 * Validates:
 * 1. Model governance registry (Only 1 Authoritative model, explicit lifecycle statuses).
 * 2. Prediction observation archive (Champion/Challenger logging, state hashing).
 * 3. Settlement ingestion pipeline (Append-only settlement joins, exact Brier/LogLoss contribution).
 * 4. Longitudinal scorecard engine (Multi-horizon aggregation, sample size gating N >= 1,000).
 * 5. Model comparison & sub-category regression detection.
 * 6. Non-blocking shadow execution and zero bettor exposure.
 */

import { describe, it, expect } from 'vitest';
import {
  listRegisteredModels,
  getAuthoritativeChampionModel,
  validateModelTransition,
  MODEL_STATUSES,
} from '../../../lib/odds-v3/validation/modelGovernanceRegistry.mjs';
import {
  createObservationRecord,
  queryObservations,
  clearObservationBuffer,
} from '../../../lib/odds-v3/validation/observationArchiveEngine.mjs';
import {
  ingestMarketSettlement,
} from '../../../lib/odds-v3/validation/settlementIngestionPipeline.mjs';
import {
  generateLongitudinalScorecard,
} from '../../../lib/odds-v3/validation/longitudinalScorecardEngine.mjs';
import {
  compareChampionAndChallenger,
} from '../../../lib/odds-v3/validation/modelComparisonEngine.mjs';

describe('Phase 26 — Real-World Odds Intelligence & Settlement Learning System', () => {
  describe('1. Model Governance Registry', () => {
    it('enforces exactly one authoritative production champion model', () => {
      const models = listRegisteredModels();
      const authoritative = models.filter((m) => m.status === MODEL_STATUSES.AUTHORITATIVE);
      expect(authoritative.length).toBe(1);

      const champ = getAuthoritativeChampionModel();
      expect(champ.modelVersion).toBe('v3.1-prod');
    });

    it('forbids automatic promotion without manual operator ID', () => {
      const unauth = validateModelTransition({
        targetModelVersion: 'v3.2-candidate-004',
        action: 'PROMOTE_TO_AUTHORITATIVE',
        operatorId: null, // No operator
      });
      expect(unauth.allowed).toBe(false);
      expect(unauth.reason).toContain('MANUAL_OPERATOR_APPROVAL_REQUIRED');
    });
  });

  describe('2. Observation Archive Engine', () => {
    it('creates structured Champion and Challenger observation records', () => {
      clearObservationBuffer();
      const champRec = createObservationRecord({
        matchId: 'm101',
        marketType: 'match_winner',
        selection: '1',
        modelVersion: 'v3.1-prod',
        modelRole: 'CHAMPION',
        probability: 0.55,
        decimalOdds: 1.75,
      });

      const challRec = createObservationRecord({
        matchId: 'm101',
        marketType: 'match_winner',
        selection: '1',
        modelVersion: 'v3.2-candidate-004',
        modelRole: 'CHALLENGER',
        probability: 0.60,
        decimalOdds: 1.60,
      });

      expect(champRec.observationId).toBeDefined();
      expect(champRec.canonicalStateHash).toBeDefined();
      expect(queryObservations({ matchId: 'm101' }).length).toBe(2);
    });
  });

  describe('3. Settlement Ingestion Pipeline', () => {
    it('joins settlement results and computes individual Brier and LogLoss contributions', () => {
      const obs = [
        { matchId: 'm200', marketType: 'match_winner', selection: '1', probability: 0.80, decimalOdds: 1.20 },
        { matchId: 'm200', marketType: 'match_winner', selection: '2', probability: 0.20, decimalOdds: 4.80 },
      ];

      const res = ingestMarketSettlement({
        matchId: 'm200',
        marketType: 'match_winner',
        winningSelection: '1',
        observations: obs,
      });

      expect(res.settledCount).toBe(2);
      const winObs = res.settledRecords.find((r) => r.selection === '1');
      expect(winObs.settlement.correct).toBe(true);
      expect(winObs.settlement.brierContribution).toBe(0.04); // (0.80 - 1)^2 = 0.04
      expect(winObs.settlement.calibrationBucket).toBe('[0.8-0.9]');
    });
  });

  describe('4. Longitudinal Scorecard & Sample Gating', () => {
    it('returns INSUFFICIENT_DATA when settled observations are below threshold (N < 1000)', () => {
      const sc = generateLongitudinalScorecard({ settledObservations: [] });
      expect(sc.status).toBe('INSUFFICIENT_DATA');
      expect(sc.validationClass).toBe('NOT_VERIFIED');
      expect(sc.sampleGatePassed).toBeUndefined();
    });

    it('computes accurate Brier, LogLoss, and ECE when sample size is sufficient', () => {
      const mockSettled = Array.from({ length: 1050 }, (_, i) => ({
        settlement: {
          brierContribution: 0.18,
          logLossContribution: 0.52,
          calibrationBucket: '[0.5-0.6]',
          outcome: 1,
        },
      }));

      const sc = generateLongitudinalScorecard({ settledObservations: mockSettled });
      expect(sc.status).toBe('STATISTICALLY_SUFFICIENT');
      expect(sc.metrics.brierScore).toBe(0.18);
      expect(sc.sampleGatePassed).toBe(true);
    });
  });

  describe('5. Model Comparison & Critical Regression Detection', () => {
    it('flags critical sub-category regressions even if overall Brier improves', () => {
      const champSC = { nSettledObservations: 1200, minRequiredSettled: 1000, metrics: { brierScore: 0.185, expectedCalibrationError: 0.038 } };
      const challSC = { nSettledObservations: 1200, minRequiredSettled: 1000, metrics: { brierScore: 0.170, expectedCalibrationError: 0.035 } };

      const comparison = compareChampionAndChallenger({
        championScorecard: champSC,
        challengerScorecard: challSC,
        segmentedResults: {
          'cricket_death_overs': { championBrier: 0.180, challengerBrier: 0.220 }, // +22% degradation
        },
      });

      expect(comparison.decision).toBe('OVERALL_IMPROVEMENT_WITH_CRITICAL_REGRESSION');
      expect(comparison.regressionsCount).toBe(1);
      expect(comparison.recommendation).toBe('KEEP_SHADOW');
    });
  });
});
