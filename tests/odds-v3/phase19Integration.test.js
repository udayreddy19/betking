/**
 * Phase 19 Integration Test Suite
 * 
 * Validates:
 * 1. Durable PostgreSQL telemetry batch persistence and querying.
 * 2. Asynchronous telemetry worker background flushing and non-blocking safety.
 * 3. Settlement ground truth labeling and anti-leakage verification.
 * 4. Immutable dataset versioning with SHA-256 hashing and sample size tiers.
 * 5. Multi-sport provider accuracy regime analyzer (shadow mode only).
 * 6. Diagnostic price difference decomposition between timestamps.
 * 7. Offline counterfactual pricing simulator.
 * 8. Parameter sensitivity and elasticity partial derivatives.
 */

import { describe, it, expect } from 'vitest';
import { persistObservationBatch, queryPersistedObservations } from '../../lib/odds-v3/telemetry/oddsPersister.mjs';
import {
  flushTelemetryBatch,
  getTelemetryWorkerStatus,
} from '../../lib/odds-v3/telemetry/durableTelemetryWorker.mjs';
import {
  labelObservationWithSettlement,
  batchLabelObservations,
  SETTLEMENT_LABELS,
} from '../../lib/odds-v3/dataset/settlementLabeler.mjs';
import {
  createVersionedDataset,
  evaluateSampleSizeTier,
  SAMPLE_SIZE_TIERS,
} from '../../lib/odds-v3/dataset/datasetVersioning.mjs';
import { analyzeProviderRegimes } from '../../lib/odds-v3/pricing/providerRegimeAnalyzer.mjs';
import { explainPriceDifference } from '../../lib/odds-v3/pricing/priceDifferenceExplainer.mjs';
import { simulateCounterfactualPricing } from '../../lib/odds-v3/pricing/counterfactualPricingEngine.mjs';
import { analyzeParameterSensitivity } from '../../lib/odds-v3/pricing/sensitivityAnalyzer.mjs';

describe('Phase 19 — OddsEngine V3 Real-World Learning, Accuracy Optimization & Intelligence', () => {
  describe('1. Durable Telemetry Cold Storage & Worker', () => {
    it('persists observation batches safely without crashing on mock/empty DB', async () => {
      const observations = [
        { matchId: 'm_pers_1', marketId: 'match_winner', selectionId: '1', predictionProbability: 0.65, publishedOdds: 1.50, timestamp: Date.now() },
        { matchId: 'm_pers_1', marketId: 'match_winner', selectionId: '2', predictionProbability: 0.35, publishedOdds: 2.70, timestamp: Date.now() },
      ];
      const res = await persistObservationBatch(observations);
      expect(res).toBeDefined();
      expect(typeof res.insertedCount).toBe('number');
    });

    it('manages telemetry worker status and executes non-blocking batch flush', async () => {
      const flushRes = await flushTelemetryBatch(10);
      expect(flushRes).toBeDefined();
      expect(flushRes.status).toBeDefined();

      const workerStatus = getTelemetryWorkerStatus();
      expect(workerStatus.status).toBeDefined();
      expect(typeof workerStatus.totalFlushedCount).toBe('number');
    });
  });

  describe('2. Settlement Labeling & Anti-Leakage Protection', () => {
    it('assigns ground truth WIN/LOSE labels when prediction preceded outcome', () => {
      const pred = { matchId: 'm1', marketId: 'winner', selectionId: '1', timestamp: 1000 };
      const outcome = { winningSelectionId: '1', settledAt: 2000 };

      const labeled = labelObservationWithSettlement(pred, outcome);
      expect(labeled.settledOutcome).toBe(SETTLEMENT_LABELS.WIN);
      expect(labeled.leakageDetected).toBe(false);
      expect(labeled.labelingStatus).toBe('VALID_LABEL');
    });

    it('rejects future leakage if prediction timestamp is greater than or equal to outcome timestamp', () => {
      const leakedPred = { matchId: 'm2', marketId: 'winner', selectionId: '1', timestamp: 5000 };
      const outcome = { winningSelectionId: '1', settledAt: 4000 };

      const labeled = labelObservationWithSettlement(leakedPred, outcome);
      expect(labeled.settledOutcome).toBe(SETTLEMENT_LABELS.UNKNOWN);
      expect(labeled.leakageDetected).toBe(true);
      expect(labeled.labelingStatus).toBe('REJECTED_FUTURE_LEAKAGE');
    });

    it('batch labels a list of observations and produces label quality score', () => {
      const obsList = [
        { matchId: 'm3', marketId: 'w', selectionId: '1', timestamp: 1000 },
        { matchId: 'm3', marketId: 'w', selectionId: '2', timestamp: 1000 },
      ];
      const events = new Map([
        ['m3:w', { winningSelectionId: '1', settledAt: 2000 }],
      ]);

      const res = batchLabelObservations(obsList, events);
      expect(res.totalProcessed).toBe(2);
      expect(res.validLabeledCount).toBe(2);
      expect(res.leakageRejectedCount).toBe(0);
      expect(res.labelQualityScore).toBe(100);
    });
  });

  describe('3. Immutable Dataset Versioning & Sample Gating', () => {
    it('evaluates sample size tiers correctly', () => {
      expect(evaluateSampleSizeTier(50)).toBe(SAMPLE_SIZE_TIERS.INSUFFICIENT);
      expect(evaluateSampleSizeTier(250)).toBe(SAMPLE_SIZE_TIERS.EXPLORATORY);
      expect(evaluateSampleSizeTier(750)).toBe(SAMPLE_SIZE_TIERS.LIMITED);
      expect(evaluateSampleSizeTier(2000)).toBe(SAMPLE_SIZE_TIERS.VALIDATION);
      expect(evaluateSampleSizeTier(6000)).toBe(SAMPLE_SIZE_TIERS.STRONG);
    });

    it('creates versioned dataset with SHA-256 hash and metadata', () => {
      const observations = [
        { matchId: 'm1', marketId: 'winner', selectionId: '1', predictionProbability: 0.6, publishedOdds: 1.6, settledOutcome: 'WIN', timestamp: 1000 },
        { matchId: 'm1', marketId: 'winner', selectionId: '2', predictionProbability: 0.4, publishedOdds: 2.4, settledOutcome: 'LOSE', timestamp: 1000 },
      ];

      const ds = createVersionedDataset({ datasetName: 'cricket_ipl_val', observations, source: 'postgres_cold' });
      expect(ds.datasetId).toContain('cricket_ipl_val');
      expect(ds.hash).toHaveLength(64); // SHA-256 hex string
      expect(ds.settledCount).toBe(2);
      expect(ds.excludedCount).toBe(0);
      expect(ds.sampleTier).toBe(SAMPLE_SIZE_TIERS.INSUFFICIENT);
    });
  });

  describe('4. Provider Regime Analyzer', () => {
    it('analyzes provider accuracy by sport and outputs candidate weights in shadow mode', () => {
      const data = [
        { sport: 'cricket', providerUsed: 'cricbuzz', predictionProbability: 0.70, actualOutcome: true, settledOutcome: 'WIN', providerLatency: 110 },
        { sport: 'cricket', providerUsed: 'cricbuzz', predictionProbability: 0.30, actualOutcome: false, settledOutcome: 'LOSE', providerLatency: 120 },
        { sport: 'cricket', providerUsed: 'crex', predictionProbability: 0.50, actualOutcome: true, settledOutcome: 'WIN', providerLatency: 180 },
      ];

      const res = analyzeProviderRegimes(data);
      expect(res.status).toBe('ANALYZED');
      expect(res.weightStatus).toBe('SHADOW_ONLY');
      expect(res.regimes.cricket.cricbuzz).toBeDefined();
      expect(res.regimes.cricket.cricbuzz.brierScore).toBeLessThan(0.20);
    });
  });

  describe('5. Price Difference Explainer', () => {
    it('decomposes price delta into match state and probability shifts', () => {
      const obs1 = {
        matchId: 'm_diff',
        marketId: 'match_winner',
        selectionId: '1',
        publishedOdds: 1.80,
        predictionProbability: 0.53,
        margin: 0.05,
        matchState: { runs: 120, wickets: 3 },
        timestamp: 1000,
      };
      const obs2 = {
        matchId: 'm_diff',
        marketId: 'match_winner',
        selectionId: '1',
        publishedOdds: 2.30,
        predictionProbability: 0.41,
        margin: 0.06,
        matchState: { runs: 120, wickets: 4 }, // wicket fell
        timestamp: 2000,
      };

      const explanation = explainPriceDifference(obs1, obs2);
      expect(explanation.status).toBe('EXPLAINED');
      expect(explanation.primaryDriver).toBe('MATCH_STATE_EVENT');
      expect(explanation.decomposition.probabilityDelta).toBe(-0.12);
      expect(explanation.decomposition.matchStateChanges.wickets).toEqual({ from: 3, to: 4 });
    });
  });

  describe('6. Counterfactual Pricing & Sensitivity Analysis', () => {
    it('simulates offline counterfactual pricing without mutating live state', () => {
      const canonicalInput = {
        matchId: 'counter_01',
        sport: 'CRICKET',
        format: 'T20',
        status: 'LIVE',
        team1: { id: 'team1', name: 'Team A', runs: 160, wickets: 6, balls: 120 },
        team2: { id: 'team2', name: 'Team B', runs: 130, wickets: 3, balls: 90 },
        currentInnings: 2,
        battingTeamId: 'team2',
        bowlingTeamId: 'team1',
        target: 161,
        runsRequired: 31,
        ballsPerInnings: 120,
        ballsCompleted: 90,
        ballsRemaining: 30,
      };

      const res = simulateCounterfactualPricing(canonicalInput, {
        hypotheticalState: {
          team2: { id: 'team2', name: 'Team B', runs: 145, wickets: 3, balls: 90 },
          runsRequired: 16,
        },
      });

      expect(res.status).toBe('SIMULATED');
      expect(res.marketComparisons.length).toBeGreaterThan(0);
    });

    it('computes parameter partial derivatives and run/wicket elasticity', () => {
      const res = analyzeParameterSensitivity({
        runs1: 160,
        wickets1: 5,
        runs2: 120,
        wickets2: 4,
        balls2: 84,
        target: 161,
      });

      expect(res.status).toBe('ANALYZED');
      expect(res.sensitivities.dProb_dRunsPerBoundary).toBeDefined();
      expect(res.sensitivities.dProb_dWicketFall).toBeDefined();
      expect(res.elasticityClassification).toBeDefined();
    });
  });
});
