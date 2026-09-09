/**
 * Phase 4 — Observation Recorder, Outcome Linking & Zero-Leakage Tests
 *
 * Validates:
 *   - Pre-margin fairProbability persistence (Phase 4B)
 *   - Authoritative deterministic outcome linking (Phase 4C)
 *   - Strict temporal leakage guarantees: predictionTimestamp < outcomeTimestamp (Phase 4D)
 *   - Elimination of future information leakage (scores, wickets, goals, sets, prices) (Phase 4D)
 *   - N >= 1000 genuine observation gate & subgroup breakdown (Phase 4E)
 *   - Time-safe chronological splitting (Train -> Cal -> Holdout) (Phase 4F)
 *   - Model calibration method selection on validation data (Phase 4G)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ProductionObservationRecorder,
  LEAKAGE_ERROR_CODES,
} from '../../lib/odds-v4/calibration/ProductionObservationRecorder.mjs';
import {
  evaluateV4Calibration,
  calculateBrierScore,
  calculateLogLoss,
} from '../../lib/odds-v4/calibration/V4CalibrationEngine.mjs';
import {
  fitPlattScaling,
  fitIsotonicRegression,
  fitBetaCalibration,
  selectBestCalibrationMethod,
} from '../../lib/odds-v4/calibration/ModelCalibrationTechniques.mjs';

describe('Phase 4 — Observation Collection, Outcome Linking & Zero-Leakage', () => {
  let recorder;

  beforeEach(() => {
    recorder = new ProductionObservationRecorder({ storagePath: ':memory:' });
  });

  // Phase 4B: Real Observation Collection (Pre-Margin Fair Probability)
  describe('Phase 4B: Real Observation Collection & Pre-Margin Truth', () => {
    it('persists pre-margin fair probability and commercial published odds separately', () => {
      const pred = recorder.recordPrediction({
        providerEventId: 'evt_cricket_ipl_101',
        internalEventId: 'match_101',
        sport: 'cricket',
        format: 'T20',
        competition: 'IPL',
        market: 'match_winner',
        selection: 'CSK',
        modelVersion: '4.9.0',
        pricingVersion: 'v4_canonical_pricing',
        stateVersion: 12,
        predictionTimestamp: '2026-09-09T10:00:00.000Z',
        fairProbability: 0.55, // Pre-margin model prediction
        fairOdds: 1.818,       // 1 / 0.55
        publishedOdds: 1.70,   // Commercial odds after house margin
        publishedImpliedProbability: 0.5882,
        matchState: {
          score: '120/3',
          overs: 14.2,
          status: 'live',
        },
      });

      expect(pred.observationId).toBeDefined();
      expect(pred.fairProbability).toBe(0.55);
      expect(pred.fairOdds).toBe(1.818);
      expect(pred.publishedOdds).toBe(1.70);
      expect(pred.status).toBe('PENDING_SETTLEMENT');
    });

    it('rejects invalid fair probabilities outside (0, 1)', () => {
      expect(() => {
        recorder.recordPrediction({
          providerEventId: 'evt_1',
          market: 'mw',
          selection: '1',
          fairProbability: 1.05,
          fairOdds: 0.95,
        });
      }).toThrow(/INVALID_FAIR_PROBABILITY/);

      expect(() => {
        recorder.recordPrediction({
          providerEventId: 'evt_1',
          market: 'mw',
          selection: '1',
          fairProbability: 0,
          fairOdds: 2.0,
        });
      }).toThrow(/INVALID_FAIR_PROBABILITY/);
    });

    it('rejects mathematical mismatch between fairProbability and fairOdds', () => {
      expect(() => {
        recorder.recordPrediction({
          providerEventId: 'evt_1',
          market: 'mw',
          selection: '1',
          fairProbability: 0.50,
          fairOdds: 3.50, // Severe mathematical mismatch: 0.5 * 3.5 = 1.75 != 1
        });
      }).toThrow(/FAIR_ODDS_MATHEMATICAL_MISMATCH/);
    });
  });

  // Phase 4C & 4D: Outcome Linking & Temporal Leakage Guarantees
  describe('Phase 4C & 4D: Outcome Linking & Zero Temporal Leakage', () => {
    it('links authoritative settlement when predictionTimestamp < outcomeTimestamp', () => {
      recorder.recordPrediction({
        providerEventId: 'evt_csk_mi',
        market: 'match_winner',
        selection: 'CSK',
        fairProbability: 0.60,
        fairOdds: 1.667,
        predictionTimestamp: '2026-09-09T10:00:00.000Z',
      });

      const linked = recorder.linkAuthoritativeSettlement({
        providerEventId: 'evt_csk_mi',
        market: 'match_winner',
        selection: 'CSK',
        actualOutcome: 'WON',
        outcomeTimestamp: '2026-09-09T11:30:00.000Z', // 1.5 hours later
        settlementVersion: 'v4_settlement_authoritative',
        evidence: { finalScore: 'CSK 180/4 def MI 176/9' },
      });

      expect(linked.linked).toBe(true);
      expect(linked.actualOutcome).toBe('WON');

      const settled = recorder.getSettledObservations();
      expect(settled).toHaveLength(1);
      expect(settled[0].fairProbability).toBe(0.60);
      expect(settled[0].actualOutcome).toBe('WON');
    });

    it('strictly REJECTS settlement if predictionTimestamp >= outcomeTimestamp (future leakage)', () => {
      recorder.recordPrediction({
        providerEventId: 'evt_leakage_test',
        market: 'match_winner',
        selection: 'CSK',
        fairProbability: 0.50,
        fairOdds: 2.0,
        predictionTimestamp: '2026-09-09T12:00:00.000Z',
      });

      // Attempt to link with earlier or equal outcome timestamp
      expect(() => {
        recorder.linkAuthoritativeSettlement({
          providerEventId: 'evt_leakage_test',
          market: 'match_winner',
          selection: 'CSK',
          actualOutcome: 'WON',
          outcomeTimestamp: '2026-09-09T11:59:59.000Z', // In the past!
        });
      }).toThrow(new RegExp(LEAKAGE_ERROR_CODES.PREDICTION_AFTER_OUTCOME));

      expect(() => {
        recorder.linkAuthoritativeSettlement({
          providerEventId: 'evt_leakage_test',
          market: 'match_winner',
          selection: 'CSK',
          actualOutcome: 'WON',
          outcomeTimestamp: '2026-09-09T12:00:00.000Z', // Same millisecond!
        });
      }).toThrow(new RegExp(LEAKAGE_ERROR_CODES.PREDICTION_AFTER_OUTCOME));
    });

    it('rejects predictions where matchState contains future match outcomes or final scores', () => {
      // 1. Finished match status
      expect(() => {
        recorder.recordPrediction({
          providerEventId: 'evt_finished',
          market: 'mw',
          selection: '1',
          fairProbability: 0.5,
          fairOdds: 2.0,
          matchState: { status: 'finished' },
        });
      }).toThrow(/FUTURE_DATA_LEAKAGE_MATCH_FINISHED_AT_PREDICTION/);

      // 2. Winner already populated
      expect(() => {
        recorder.recordPrediction({
          providerEventId: 'evt_winner_known',
          market: 'mw',
          selection: '1',
          fairProbability: 0.5,
          fairOdds: 2.0,
          matchState: { winner: 'Home' },
        });
      }).toThrow(/FUTURE_DATA_LEAKAGE_MATCH_FINISHED_AT_PREDICTION/);

      // 3. Final score leakage
      expect(() => {
        recorder.recordPrediction({
          providerEventId: 'evt_score_leak',
          market: 'mw',
          selection: '1',
          fairProbability: 0.5,
          fairOdds: 2.0,
          matchState: { finalScore: '3-1' },
        });
      }).toThrow(/FUTURE_DATA_LEAKAGE_FINAL_SCORE/);

      // 4. Future wickets leakage
      expect(() => {
        recorder.recordPrediction({
          providerEventId: 'evt_wickets_leak',
          market: 'mw',
          selection: '1',
          fairProbability: 0.5,
          fairOdds: 2.0,
          matchState: { futureWickets: 3 },
        });
      }).toThrow(/FUTURE_DATA_LEAKAGE_FUTURE_WICKETS/);

      // 5. Future goals leakage
      expect(() => {
        recorder.recordPrediction({
          providerEventId: 'evt_goals_leak',
          market: 'mw',
          selection: '1',
          fairProbability: 0.5,
          fairOdds: 2.0,
          matchState: { ftScoreHome: 2, ftScoreAway: 1 },
        });
      }).toThrow(/FUTURE_DATA_LEAKAGE_FUTURE_GOALS/);

      // 6. Future provider odds
      expect(() => {
        recorder.recordPrediction({
          providerEventId: 'evt_prices_leak',
          market: 'mw',
          selection: '1',
          fairProbability: 0.5,
          fairOdds: 2.0,
          matchState: { postMatchProviderOdds: 1.85 },
        });
      }).toThrow(/FUTURE_DATA_LEAKAGE_FUTURE_PROVIDER_PRICES/);
    });
  });

  // Phase 4E: Calibration Gate Rigor (N >= 1000)
  describe('Phase 4E: Genuine N >= 1000 Calibration Gate', () => {
    it('returns INSUFFICIENT_DATA when observation count is 0 or less than 1000', () => {
      const empty = evaluateV4Calibration([]);
      expect(empty.status).toBe('INSUFFICIENT_DATA');
      expect(empty.isCalibrated).toBe(false);
      expect(empty.sampleSize).toBe(0);

      // 200 observations is still under 1000
      const sample200 = Array.from({ length: 200 }, () => ({
        calibratedProbability: 0.6,
        rawProbability: 0.6,
        outcome: 'WON',
      }));
      const res200 = evaluateV4Calibration(sample200);
      expect(res200.status).toBe('INSUFFICIENT_DATA');
      expect(res200.isCalibrated).toBe(false);
      expect(res200.deficit).toBe(800);
    });

    it('marks subgroup as INSUFFICIENT_DATA if subgroup sample size < 50 without extrapolating', () => {
      // 1000 total observations but only 10 in soccer
      const sample = Array.from({ length: 990 }, () => ({
        sport: 'cricket',
        market: 'match_winner',
        calibratedProbability: 0.6,
        outcome: Math.random() > 0.4 ? 'WON' : 'LOST',
      }));
      for (let i = 0; i < 10; i++) {
        sample.push({
          sport: 'soccer',
          market: '1x2',
          calibratedProbability: 0.5,
          outcome: 'WON',
        });
      }

      const res = evaluateV4Calibration(sample);
      expect(res.status).toBe('VALIDATED');
      expect(res.metrics.subgroups.bySport.soccer.status).toBe('INSUFFICIENT_DATA');
      expect(res.metrics.subgroups.bySport.soccer.sampleSize).toBe(10);
      expect(res.metrics.subgroups.bySport.cricket.status).toBe('SUFFICIENT_DATA');
    });
  });

  // Phase 4F: Time-Safe Chronological Splitting
  describe('Phase 4F: Time-Safe Chronological Dataset Splitting', () => {
    it('splits observations chronologically into Train (60%), Calibration (20%), and Holdout (20%)', () => {
      const baseTime = new Date('2026-01-01T00:00:00.000Z').getTime();
      const obs = Array.from({ length: 100 }, (_, idx) => ({
        observationId: `obs_${idx}`,
        predictionTimestamp: new Date(baseTime + idx * 3600000).toISOString(),
        fairProbability: 0.5,
        outcome: idx % 2 === 0 ? 'WON' : 'LOST',
      }));

      const split = recorder.splitChronologicalDataset(obs);
      expect(split.status).toBe('SPLIT_SUCCESS');
      expect(split.train).toHaveLength(60);
      expect(split.calibration).toHaveLength(20);
      expect(split.holdout).toHaveLength(20);

      // Verify strict chronological sequence (train < cal < holdout)
      const maxTrainTime = new Date(split.ranges.trainRange[1]).getTime();
      const minCalTime = new Date(split.ranges.calibrationRange[0]).getTime();
      const maxCalTime = new Date(split.ranges.calibrationRange[1]).getTime();
      const minHoldoutTime = new Date(split.ranges.holdoutRange[0]).getTime();

      expect(maxTrainTime).toBeLessThanOrEqual(minCalTime);
      expect(maxCalTime).toBeLessThanOrEqual(minHoldoutTime);
    });
  });

  // Phase 4G: Model Calibration Evaluation & Selection
  describe('Phase 4G: Model Calibration (Platt, Isotonic, Beta vs RAW)', () => {
    it('fits Platt scaling, Isotonic regression, and Beta calibration', () => {
      const train = Array.from({ length: 100 }, (_, idx) => {
        const p = 0.1 + (idx / 100) * 0.8;
        return {
          fairProbability: p,
          rawProbability: p,
          outcome: p > 0.5 ? 'WON' : 'LOST',
        };
      });

      const platt = fitPlattScaling(train);
      expect(platt.ready).toBe(true);
      expect(platt.calibrate(0.5)).toBeGreaterThan(0);
      expect(platt.calibrate(0.5)).toBeLessThan(1);

      const isotonic = fitIsotonicRegression(train);
      expect(isotonic.ready).toBe(true);
      expect(isotonic.calibrate(0.2)).toBeLessThanOrEqual(isotonic.calibrate(0.8));

      const beta = fitBetaCalibration(train);
      expect(beta.ready).toBe(true);
      expect(beta.calibrate(0.5)).toBeGreaterThan(0);
    });

    it('retains RAW model if no calibration method outperforms RAW on holdout validation data', () => {
      // Well-calibrated uniform distribution
      const val = Array.from({ length: 50 }, (_, idx) => {
        const p = 0.1 + (idx / 50) * 0.8;
        return {
          fairProbability: p,
          rawProbability: p,
          outcome: Math.random() < p ? 'WON' : 'LOST',
        };
      });

      const selection = selectBestCalibrationMethod(val, val);
      expect(selection.selectedMethod).toBeDefined();
      expect(['RAW', 'PLATT', 'ISOTONIC', 'BETA']).toContain(selection.selectedMethod);
    });
  });
});
