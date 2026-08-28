import { describe, it, expect } from 'vitest';
import { ingestDataset, validateObservationSchema } from '../../lib/odds-v3/dataset/datasetIngestionEngine.mjs';
import { auditDatasetQuality } from '../../lib/odds-v3/dataset/dataQualityEngine.mjs';
import { runWalkForwardValidation, computeCalibrationErrors } from '../../lib/odds-v3/replay/walkForwardValidator.mjs';
import { fitPlattScaling, applyPlattScaling, evaluateEmpiricalCalibration } from '../../lib/odds-v3/calibration/empiricalCalibration.mjs';
import { calculateEmpiricalRho } from '../../lib/odds-v3/pricing/sgpEmpiricalRho.mjs';
import { analyzeFeedLatency, LATENCY_TIERS } from '../../lib/odds-v3/telemetry/feedLatencyAnalyzer.mjs';

describe('PHASE 16 — Real-Data Validation, Empirical Calibration & Pricing Optimization', () => {

  // 1. Dataset Ingestion Engine
  describe('1. Dataset Ingestion & Schema Normalization', () => {
    it('Validates observation schemas and rejects malformed records', () => {
      const validRec = {
        timestamp: 1724851200000,
        matchId: 'm_test_1',
        sport: 'soccer',
        matchState: { id: 'm_test_1' },
      };
      expect(validateObservationSchema(validRec).valid).toBe(true);

      const invalidRec = { timestamp: 'not-a-number' };
      expect(validateObservationSchema(invalidRec).valid).toBe(false);
    });

    it('Enforces chronological ordering and eliminates duplicates', () => {
      const rawRecords = [
        { timestamp: 2000, matchId: 'm1', sport: 'soccer', market: '1X2', matchState: { id: 'm1' } },
        { timestamp: 1000, matchId: 'm1', sport: 'soccer', market: '1X2', matchState: { id: 'm1' } },
        { timestamp: 2000, matchId: 'm1', sport: 'soccer', market: '1X2', matchState: { id: 'm1' } }, // Duplicate!
      ];

      const res = ingestDataset(rawRecords);
      expect(res.success).toBe(true);
      expect(res.ingestedCount).toBe(2);
      expect(res.duplicateCount).toBe(1);
      // Verify chronological order
      expect(res.observations[0].timestamp).toBe(1000);
      expect(res.observations[1].timestamp).toBe(2000);
    });
  });

  // 2. Data Quality Engine
  describe('2. Data Quality Pre-Audit', () => {
    it('Detects future leakage and classifies invalid datasets', () => {
      const leakyDataset = [
        {
          timestamp: 5000, // Prediction after resolution!
          resolutionTimestamp: 3000,
          resolvedOutcome: true,
        },
      ];

      const audit = auditDatasetQuality(leakyDataset);
      expect(audit.status).toBe('DATASET_INVALID');
      expect(audit.metrics.futureLeakages).toBe(1);
    });

    it('Audits valid dataset and produces quality score', () => {
      const validDataset = [
        { timestamp: 1000, resolvedOutcome: true, providerOdds: { home: 1.5 } },
        { timestamp: 2000, resolvedOutcome: false, providerOdds: { home: 2.5 } },
      ];

      const audit = auditDatasetQuality(validDataset);
      expect(audit.status).toBe('DATASET_VALID');
      expect(audit.qualityScore).toBe(10.0);
    });
  });

  // 3. Walk-Forward Validation & ECE/MCE
  describe('3. Walk-Forward Validation & Calibration Errors', () => {
    it('Computes Expected Calibration Error (ECE) and Maximum Calibration Error (MCE)', () => {
      const buckets = [
        { count: 10, error: 0.05 },
        { count: 10, error: 0.15 },
      ];

      const errors = computeCalibrationErrors(buckets);
      expect(errors.ece).toBeCloseTo(0.10, 2);
      expect(errors.mce).toBeCloseTo(0.15, 2);
    });

    it('Executes train, validation, and test chronological splits', () => {
      const obs = Array.from({ length: 15 }, (_, i) => ({
        timestamp: 1000 * (i + 1),
        matchState: {
          id: `m_${i}`,
          matchId: `m_${i}`,
          sport: 'soccer',
          status: 'LIVE',
          isLive: true,
          team1: { name: 'Arsenal' },
          team2: { name: 'Chelsea' },
          score1: 1,
          score2: 0,
          liveDetails: { minute: 50, score1: 1, score2: 0 },
        },
        resolvedWinner: '1',
      }));

      const res = runWalkForwardValidation(obs, { sport: 'soccer' });
      expect(res.status).toBe('COMPLETED');
      expect(res.splits.trainCount).toBe(9);
      expect(res.splits.valCount).toBe(3);
      expect(res.splits.testCount).toBe(3);
      expect(res.overallMetrics.brierScore).toBeDefined();
    });
  });

  // 4. Empirical Calibration & Platt Scaling
  describe('4. Empirical Post-Hoc Calibration', () => {
    it('Fits Platt scaling parameters and evaluates Brier score delta', () => {
      const trainSet = [
        { probability: 0.70, settledOutcome: true },
        { probability: 0.30, settledOutcome: false },
      ];
      const testSet = [
        { probability: 0.65, settledOutcome: true },
        { probability: 0.35, settledOutcome: false },
      ];

      const evalRes = evaluateEmpiricalCalibration({ trainSet, testSet });
      expect(evalRes.status).toBe('COMPLETED');
      expect(evalRes.plattParams.fitted).toBe(true);
      expect(evalRes.calibratedBrier).toBeDefined();
    });

    it('Applies Platt scaling maintaining bounds in (0, 1)', () => {
      const calP = applyPlattScaling(0.85, { A: 1.1, B: -0.1 });
      expect(calP).toBeGreaterThan(0.01);
      expect(calP).toBeLessThan(0.99);
    });
  });

  // 5. Empirical SGP Correlation (Rho)
  describe('5. Empirical SGP Rho Research', () => {
    it('Computes empirical Pearson phi coefficient from paired binary outcomes', () => {
      const paired = [
        { wonA: true, wonB: true },
        { wonA: true, wonB: true },
        { wonA: true, wonB: false },
        { wonA: false, wonB: false },
        { wonA: false, wonB: false },
      ];

      const rhoRes = calculateEmpiricalRho(paired, { configuredRho: 0.50 });
      expect(rhoRes.status).toBe('COMPLETED');
      expect(rhoRes.empiricalRho).toBeGreaterThan(0.40);
      expect(rhoRes.sampleSize).toBe(5);
    });
  });

  // 6. Feed Latency Analyzer
  describe('6. Feed Latency & Freshness Tiers', () => {
    it('Classifies observations into latency tiers and identifies circuit breaker risk', () => {
      const obs = [
        { feedLatencyMs: 80 },
        { feedLatencyMs: 200 },
        { feedLatencyMs: 600 },
        { feedLatencyMs: 3000 }, // Critical stale feed!
      ];

      const analysis = analyzeFeedLatency(obs);
      expect(analysis.sampleSize).toBe(4);
      expect(analysis.staleBreakerTrips).toBe(1);
      expect(analysis.tierDistribution['<100ms'].count).toBe(1);
      expect(analysis.tierDistribution['>2500ms'].count).toBe(1);
    });
  });
});
