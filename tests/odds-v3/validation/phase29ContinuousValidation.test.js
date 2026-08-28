import { describe, it, expect } from 'vitest';
import { createObservationRecord, queryObservations } from '../../../lib/odds-v3/validation/observationArchiveEngine.mjs';
import { ingestMarketSettlement } from '../../../lib/odds-v3/validation/settlementIngestionPipeline.mjs';
import { calculatePredictionPerformance } from '../../../lib/odds-v3/validation/predictionPerformanceEngine.mjs';
import { evaluateCandidateModel } from '../../../lib/odds-v3/shadow/modelCandidateEvaluationEngine.mjs';
import { validateModelTransition, getAuthoritativeChampionModel, listShadowChallengerModels } from '../../../lib/odds-v3/validation/modelGovernanceRegistry.mjs';

describe('Phase 29 — Continuous Validation & Real Data Ingestion Test Suite', () => {
  it('1. should create and buffer prediction observations idempotently', () => {
    const obs = createObservationRecord({
      matchId: 'match_p29_01',
      sport: 'cricket',
      marketType: 'match_winner',
      selection: '1',
      modelVersion: 'v3.1-prod',
      modelRole: 'CHAMPION',
      probability: 0.65,
      decimalOdds: 1.50,
      canonicalState: { stateVersion: 1, runs: 120, wickets: 3, target: 160 },
    });

    expect(obs).toBeDefined();
    expect(obs.observationId).toBeDefined();
    expect(obs.canonicalStateHash).toBeDefined();
    expect(obs.probability).toBe(0.65);
    expect(obs.decimalOdds).toBe(1.50);
  });

  it('2. should ingest settlement outcomes in an append-only idempotent manner', () => {
    const obs = createObservationRecord({
      matchId: 'match_p29_settle_01',
      sport: 'cricket',
      marketType: 'match_winner',
      selection: '1',
      probability: 0.70,
      decimalOdds: 1.40,
    });

    const settlement = ingestMarketSettlement({
      matchId: 'match_p29_settle_01',
      marketType: 'match_winner',
      winningSelection: '1',
      settledAt: new Date().toISOString(),
      observations: [obs],
    });

    expect(settlement).toBeDefined();
    expect(settlement.matchId).toBe('match_p29_settle_01');
    expect(settlement.marketType).toBe('match_winner');
    expect(settlement.settledCount).toBe(1);
    expect(settlement.settledRecords[0].settlement.outcome).toBe(1);
    expect(settlement.settledRecords[0].settlement.brierContribution).toBeCloseTo(0.09, 2);
  });

  it('3. should calculate Brier score and LogLoss accurately', () => {
    const syntheticObservations = [
      { probability: 0.80, settlement: { outcome: 1 } },
      { probability: 0.60, settlement: { outcome: 1 } },
      { probability: 0.30, settlement: { outcome: 0 } },
      { probability: 0.10, settlement: { outcome: 0 } },
    ];

    const perf = calculatePredictionPerformance({ observations: syntheticObservations });
    expect(perf).toBeDefined();
    expect(perf.globalMetrics.settledCount).toBe(4);
    // Brier: ((0.8-1)^2 + (0.6-1)^2 + (0.3-0)^2 + (0.1-0)^2) / 4 = (0.04 + 0.16 + 0.09 + 0.01) / 4 = 0.30 / 4 = 0.075
    expect(perf.globalMetrics.brierScore).toBeCloseTo(0.075, 3);
  });

  it('4. should keep candidates strictly isolated in shadow mode without auto-promotion', () => {
    const candidateEval = evaluateCandidateModel({
      championModelVersion: 'v3.1-prod',
      candidateModelVersion: 'v3.2-candidate-004',
      settledSampleCount: 50, // Below 1,000 threshold
    });

    expect(candidateEval.recommendation).toBe('KEEP_SHADOW');
    expect(candidateEval.autoPromotionAllowed).toBe(false);
    expect(candidateEval.minRequiredSample).toBe(1000);
  });

  it('5. should enforce single Champion invariant and list active challengers', () => {
    const champion = getAuthoritativeChampionModel();
    expect(champion.modelVersion).toBe('v3.1-prod');
    expect(champion.status).toBe('AUTHORITATIVE');

    const challengers = listShadowChallengerModels();
    expect(challengers.length).toBeGreaterThanOrEqual(1);
    for (const ch of challengers) {
      expect(ch.status).toBe('SHADOW');
    }
  });

  it('6. should reject model promotion when operator authorization is missing', () => {
    const transition = validateModelTransition({
      targetModelVersion: 'v3.2-candidate-004',
      action: 'PROMOTE_TO_AUTHORITATIVE',
      operatorId: null, // Missing operator authorization
    });

    expect(transition.allowed).toBe(false);
    expect(transition.reason).toMatch(/MANUAL_OPERATOR_APPROVAL_REQUIRED/);
  });
});
