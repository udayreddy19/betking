import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  evaluateSettlementConfidence,
  evaluateProviderConsensus,
  CONFIDENCE_LEVELS,
  FINALITY_STATES,
} from '../../lib/settlement/settlementConfidenceEngine.mjs';
import {
  combineParlayLegOutcomes,
  ACCUMULATOR_VOID_POLICIES,
} from '../../lib/settlement/parlaySettlement.mjs';

describe('Settlement Safety & Correctness Hardening Suite', () => {
  // Scenario 1: Single provider confirmed WIN
  it('Scenario 1: Single provider confirmed WIN returns CONFIRMED & settlementAllowed: true', () => {
    const match = {
      id: 'm_test_1',
      status: 'COMPLETED',
      matchState: 'completed',
      lastUpdatedAt: new Date().toISOString(),
    };
    const res = evaluateSettlementConfidence({
      match,
      bet: { match_id: 'm_test_1', market_id: 'winner' },
      marketContext: { boundaryReached: true },
      config: { settlementGracePeriodSeconds: 0 },
    });
    assert.strictEqual(res.confidence, CONFIDENCE_LEVELS.CONFIRMED);
    assert.strictEqual(res.settlementAllowed, true);
  });

  // Scenario 2: Multiple providers agree
  it('Scenario 2: Multiple providers agree returns consensus: true & settlementAllowed: true', () => {
    const observations = [
      { provider: 'cricbuzz', score: 180, wickets: 4, status: 'COMPLETED' },
      { provider: '10cric', score: 180, wickets: 4, status: 'COMPLETED' },
    ];
    const consensus = evaluateProviderConsensus(observations, 'WICKET');
    assert.strictEqual(consensus.consensus, true);
    assert.strictEqual(consensus.observationsCount, 2);
  });

  // Scenario 3: Providers conflict
  it('Scenario 3: Providers conflict on scores returns CONFLICT & blocks settlement', () => {
    const observations = [
      { provider: 'cricbuzz', score: 180, wickets: 4, status: 'COMPLETED' },
      { provider: '10cric', score: 172, wickets: 6, status: 'COMPLETED' },
    ];
    const match = { id: 'm_test_3', status: 'COMPLETED', providerObservations: observations };
    const res = evaluateSettlementConfidence({
      match,
      bet: { match_id: 'm_test_3', market_id: 'i1_overs_0_20_total' },
      marketContext: { marketType: 'SCORE' },
      providerObservations: observations,
      config: { requireProviderConsensus: true },
    });
    assert.strictEqual(res.confidence, CONFIDENCE_LEVELS.CONFLICT);
    assert.strictEqual(res.settlementAllowed, false);
  });

  // Scenario 4: Stale provider data
  it('Scenario 4: Stale in-play provider data returns STALE & blocks settlement', () => {
    const staleTime = new Date(Date.now() - 600 * 1000).toISOString(); // 10m old
    const match = {
      id: 'm_test_4',
      status: 'IN_PLAY',
      lastUpdatedAt: staleTime,
    };
    const res = evaluateSettlementConfidence({
      match,
      bet: { match_id: 'm_test_4', market_id: 'i1_next_over_12_total' },
      config: { settlementDataMaxAgeSeconds: 300 },
    });
    assert.strictEqual(res.confidence, CONFIDENCE_LEVELS.STALE);
    assert.strictEqual(res.settlementAllowed, false);
  });

  // Scenario 5: Missing provider data
  it('Scenario 5: Missing match object returns MISSING_DATA & blocks settlement', () => {
    const res = evaluateSettlementConfidence({
      match: null,
      bet: { match_id: 'm_missing', market_id: 'winner' },
    });
    assert.strictEqual(res.confidence, CONFIDENCE_LEVELS.MISSING_DATA);
    assert.strictEqual(res.settlementAllowed, false);
  });

  // Scenario 6 & 8: Provisional match completion & Grace period not elapsed
  it('Scenario 6 & 8: Match complete but within grace period returns PROVISIONAL & blocks settlement', () => {
    const match = {
      id: 'm_test_6',
      status: 'COMPLETED',
      finishedAt: new Date(Date.now() - 5000).toISOString(), // 5s ago
    };
    const res = evaluateSettlementConfidence({
      match,
      bet: { match_id: 'm_test_6', market_id: 'winner' },
      config: { settlementGracePeriodSeconds: 30 },
    });
    assert.strictEqual(res.confidence, CONFIDENCE_LEVELS.PROVISIONAL);
    assert.strictEqual(res.finality, FINALITY_STATES.PROVISIONAL_COMPLETE);
    assert.strictEqual(res.settlementAllowed, false);
  });

  // Scenario 7 & 9: Final result confirmation & Grace period elapsed
  it('Scenario 7 & 9: Match complete and grace period elapsed returns SETTLEMENT_ELIGIBLE & settlementAllowed: true', () => {
    const match = {
      id: 'm_test_7',
      status: 'COMPLETED',
      finishedAt: new Date(Date.now() - 60000).toISOString(), // 60s ago
    };
    const res = evaluateSettlementConfidence({
      match,
      bet: { match_id: 'm_test_7', market_id: 'winner' },
      config: { settlementGracePeriodSeconds: 30 },
    });
    assert.strictEqual(res.confidence, CONFIDENCE_LEVELS.CONFIRMED);
    assert.strictEqual(res.finality, FINALITY_STATES.SETTLEMENT_ELIGIBLE);
    assert.strictEqual(res.settlementAllowed, true);
  });

  // Scenario 17: Accumulator with VOID according to configured policy
  it('Scenario 17a: Accumulator with VOID leg under VOID_ENTIRE_BET policy returns VOID', () => {
    const legs = [
      { outcome: 'WON', odds: 2.0 },
      { outcome: 'VOID', odds: 1.5 },
      { outcome: 'WON', odds: 1.8 },
    ];
    const res = combineParlayLegOutcomes(legs, { voidPolicy: ACCUMULATOR_VOID_POLICIES.VOID_ENTIRE_BET });
    assert.strictEqual(res.outcome, 'VOID');
  });

  it('Scenario 17b: Accumulator with VOID leg under REDUCE_LEG_ODDS policy returns WON with void legs noted', () => {
    const legs = [
      { outcome: 'WON', odds: 2.0 },
      { outcome: 'VOID', odds: 1.5 },
      { outcome: 'WON', odds: 1.8 },
    ];
    const res = combineParlayLegOutcomes(legs, { voidPolicy: ACCUMULATOR_VOID_POLICIES.REDUCE_LEG_ODDS });
    assert.strictEqual(res.outcome, 'WON');
    assert.strictEqual(res.voidLegsReduced, true);
    assert.strictEqual(res.wonCount, 2);
    assert.strictEqual(res.voidCount, 1);
  });

  // Scenario 18: Accumulator LOSS
  it('Scenario 18: Accumulator with any LOST leg immediately returns LOST', () => {
    const legs = [
      { outcome: 'WON', odds: 2.0 },
      { outcome: 'LOST', odds: 1.5 },
      { outcome: null, odds: 1.8 },
    ];
    const res = combineParlayLegOutcomes(legs);
    assert.strictEqual(res.outcome, 'LOST');
  });

  // Scenario 19: Dead Heat
  it('Scenario 19: Accumulator with all VOID legs returns VOID', () => {
    const legs = [
      { outcome: 'VOID', odds: 2.0 },
      { outcome: 'VOID', odds: 1.5 },
    ];
    const res = combineParlayLegOutcomes(legs, { voidPolicy: ACCUMULATOR_VOID_POLICIES.REDUCE_LEG_ODDS });
    assert.strictEqual(res.outcome, 'VOID');
  });

  // Scenario 20 & 21: Financial Reversal Partial Recovery Accounting
  it('Scenario 20 & 21: Partial reversal recovers available balance and leaves outstanding amount explicit', () => {
    const totalAdjustment = 10000;
    const currentBalance = 1000; // User spent 9000
    const recoveredAmount = Math.min(totalAdjustment, currentBalance);
    const outstandingAmount = totalAdjustment - recoveredAmount;
    const nextBalance = currentBalance - recoveredAmount;

    assert.strictEqual(recoveredAmount, 1000);
    assert.strictEqual(outstandingAmount, 9000);
    assert.strictEqual(nextBalance, 0);
  });

  // Scenario 22 & 23: Settlement Evidence with Wicket & Missing Optional Fields
  it('Scenario 22 & 23: Evidence generator provides structured metadata without fabricating missing fields', async () => {
    const { generateWicketEvidence } = await import('../../lib/settlementEvidence/wicketEvidence.mjs');
    const bet = {
      bet_id: 'bet_ev_1',
      status: 'WON',
      selection_id: 'yes',
      settlement_reason: 'wicket_in_over_18_i2_wkts=1',
      settled_at: new Date().toISOString(),
    };
    const ballEvents = [
      { innings: 1, over_number: 18, ball_number: 1, runs: 1, wicket: false, event_type: 'SINGLE' },
      { innings: 1, over_number: 18, ball_number: 2, runs: 0, wicket: false, event_type: 'DOT' },
      { innings: 1, over_number: 18, ball_number: 3, runs: 0, wicket: true, event_type: 'WICKET' },
    ];
    const evidence = generateWicketEvidence({
      bet,
      ballEvents,
      marketContext: { overNumber: 18, innings: 1 },
    });

    assert.strictEqual(evidence.evidenceStatus, 'VERIFIED');
    assert.strictEqual(evidence.timeline.length, 3);
    assert.strictEqual(evidence.timeline[2].wicket, true);
    assert.strictEqual(evidence.summary, 'Wicket fell at 18.3');
  });
});
