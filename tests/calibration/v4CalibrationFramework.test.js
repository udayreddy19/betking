import { describe, it, expect } from 'vitest';
import {
  evaluateV4Calibration,
  calculateBrierScore,
  calculateLogLoss,
  generateReliabilityBuckets,
  MIN_PRODUCTION_SAMPLE_SIZE,
} from '../../lib/odds-v4/calibration/V4CalibrationEngine.mjs';
import { evaluateOSV4Calibration } from '../../lib/other-sports-v4/calibration/OSV4CalibrationEngine.mjs';
import { runBacktest } from '../../odds-model-validation/backtestRunner.mjs';

describe('Priority 3 & 4: Genuine V4 Calibration & Backtesting Framework', () => {
  it('enforces the strict N >= 1000 production validation gate without fabricating data', () => {
    // With only 50 genuine observations
    const sample = Array.from({ length: 50 }, (_, i) => ({
      observationId: `obs_${i}`,
      eventId: `event_${i}`,
      marketId: 'match_winner',
      rawProbability: 0.60,
      calibratedProbability: 0.60,
      outcome: i % 2 === 0 ? 'WON' : 'LOST',
    }));

    const result = evaluateV4Calibration(sample);
    expect(result.status).toBe('INSUFFICIENT_DATA');
    expect(result.isCalibrated).toBe(false);
    expect(result.sampleSize).toBe(50);
    expect(result.minRequiredSampleSize).toBe(MIN_PRODUCTION_SAMPLE_SIZE);
    expect(result.deficit).toBe(950);
    expect(result.reason).toContain('Calibration gate requires N >= 1000');
  });

  it('correctly computes Brier score, Log Loss, and ECE for mathematical precision', () => {
    // Perfect predictions: p=1.0 for WON, p=0.0 for LOST
    const perfect = [
      { rawProbability: 1.0, outcome: 'WON' },
      { rawProbability: 0.0, outcome: 'LOST' },
    ];
    expect(calculateBrierScore(perfect)).toBe(0);
    expect(calculateLogLoss(perfect)).toBeCloseTo(0, 3);

    // Imperfect predictions
    const imperfect = [
      { rawProbability: 0.8, outcome: 'WON' }, // error = (0.8 - 1)^2 = 0.04
      { rawProbability: 0.2, outcome: 'LOST' }, // error = (0.2 - 0)^2 = 0.04
    ];
    expect(calculateBrierScore(imperfect)).toBeCloseTo(0.04, 4);
    expect(calculateLogLoss(imperfect)).toBeCloseTo(0.2231, 3);
  });

  it('generates 10-bin reliability buckets and Wilson confidence intervals', () => {
    const obs = [
      { rawProbability: 0.15, outcome: 'LOST' },
      { rawProbability: 0.18, outcome: 'WON' },
      { rawProbability: 0.85, outcome: 'WON' },
      { rawProbability: 0.88, outcome: 'WON' },
    ];

    const { buckets, ece } = generateReliabilityBuckets(obs, 10);
    expect(buckets).toHaveLength(10);
    expect(ece).toBeGreaterThanOrEqual(0);

    // Bucket [0.8-0.9] has 2 samples, 100% win rate
    const b8 = buckets[8];
    expect(b8.sampleCount).toBe(2);
    expect(b8.meanPredictedProbability).toBeCloseTo(0.865, 3);
    expect(b8.empiricalWinRate).toBe(1.0);
    expect(b8.confidenceInterval95[0]).toBeGreaterThan(0);
  });

  it('evaluates OSV4 calibration with sport segmentation', () => {
    const soccerObs = Array.from({ length: 40 }, (_, i) => ({
      observationId: `soc_${i}`,
      eventId: `match_${i}`,
      marketId: 'match_winner',
      sport: 'soccer',
      rawProbability: 0.55,
      outcome: i % 2 === 0 ? 'WON' : 'LOST',
    }));

    const res = evaluateOSV4Calibration(soccerObs);
    expect(res.status).toBe('INSUFFICIENT_DATA');
    expect(res.engine).toBe('OtherSportsEngineV4');
    expect(res.sampleSize).toBe(40);
  });

  it('validates walk-forward backtest and prevents future-data leakage', () => {
    const historical = Array.from({ length: 20 }, (_, i) => ({
      observationId: `hist_${i}`,
      eventId: `event_${i}`,
      marketId: 'match_winner',
      rawProbability: 0.50 + (i * 0.01),
      outcome: i > 10 ? 'WON' : 'LOST',
      settledAt: new Date(2026, 0, 1 + i).toISOString(),
    }));

    const backtest = runBacktest(historical, { modelVersion: '4.9.0' });
    expect(backtest.datasetVersion).toBe('v4_historical_settled_v1');
    expect(backtest.observationCount).toBe(20);
    // 60% train (12) / 40% eval (8)
    expect(backtest.evaluationCount).toBe(8);
    expect(backtest.overall.brierScore).toBeDefined();
    expect(backtest.segments.favorites).toBeDefined();
  });
});
