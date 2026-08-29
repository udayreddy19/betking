import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateSettlementConfidence,
  CONFIDENCE_STATES,
  FINALITY_STATES,
  resolveMarketFinalityPolicy,
} from '../../lib/settlement/settlementConfidenceEngine.mjs';
import {
  authorizeSettlement,
  validateSettlementAuthorization,
  computeEvidenceHash,
} from '../../lib/settlement/settlementAuthorizationEngine.mjs';

describe('Phase 38.2: Settlement Evidence Integrity & Finality State Audit Suite', () => {
  // Part 2 & 3: SETTLEMENT_ELIGIBLE & Unsafe Finality Promotion
  it('Audit Test 1: SETTLEMENT_ELIGIBLE cannot be created from vanishing fixture or elapsed time', () => {
    const elapsedMatch = {
      id: 'm_elapsed_01',
      startTime: new Date(Date.now() - 20000000).toISOString(), // 5.5 hours ago
      cachedAt: new Date(Date.now() - 14400000).toISOString(), // 4 hours ago
      isLive: true,
      matchState: 'in',
    };
    const bet = { bet_id: 'b_el_01', match_id: 'm_elapsed_01', market_id: 'match_winner' };
    const auth = authorizeSettlement({
      match: elapsedMatch,
      bet,
      marketContext: { marketId: 'match_winner', marketType: 'MATCH_WINNER', boundaryReached: true },
      evaluatedOutcome: 'WON',
    });
    assert.strictEqual(auth.success, false);
    assert.strictEqual(auth.confidence.finalityState, FINALITY_STATES.LIVE);
    assert.notStrictEqual(auth.confidence.finalityState, FINALITY_STATES.SETTLEMENT_ELIGIBLE);
  });

  it('Audit Test 2: In-play match with partial score cannot trigger FINAL_CONFIRMED for full-match markets', () => {
    const partialMatch = {
      id: 'm_partial_02',
      status: 'LIVE',
      isLive: true,
      matchState: 'in',
      team1: { name: 'Team 1', runs: 146, wickets: 8 },
      team2: { name: 'Team 2', runs: 181, wickets: 6 },
      score1: 146,
      score2: 181,
      liveDetails: {
        inningsId: 2,
        firstRuns: 181,
        firstWickets: 6,
        firstTeamName: 'Team 2',
        chaseRuns: 146,
        chaseWickets: 8,
        chaseOvers: '18.5',
        chaseTeamName: 'Team 1',
      },
      cachedAt: new Date(Date.now() - 7200000).toISOString(),
    };
    const bet = { bet_id: 'b_part_02', match_id: 'm_partial_02', market_id: 'team_total', selection_id: 'sel_under_178.5' };
    const auth = authorizeSettlement({
      match: partialMatch,
      bet,
      marketContext: { marketId: 'team_total', marketType: 'TEAM_TOTAL', boundaryReached: true },
      evaluatedOutcome: 'WON',
    });
    assert.strictEqual(auth.success, false);
    assert.strictEqual(auth.confidence.confidenceState, CONFIDENCE_STATES.STALE);
  });

  // Part 6 & 7: Evidence Hash Lifecycle & Tampering
  it('Audit Test 3: Evidence hash computation is strictly deterministic and verifiable', () => {
    const payload = {
      betId: 'bet_audit_01',
      matchId: 'match_audit_01',
      marketId: 'i1_wicket_in_over_16',
      selectionId: 'sel_cwkt_no',
      gradedOutcome: 'WON',
      confidenceState: 'CONFIRMED',
      finalityState: 'SETTLEMENT_ELIGIBLE',
      providerConsensus: { providersAgree: true, providersAvailable: 1 },
      freshness: { stale: false },
    };
    const hash1 = computeEvidenceHash(payload);
    const hash2 = computeEvidenceHash(payload);
    assert.strictEqual(hash1, hash2);
    assert.strictEqual(typeof hash1, 'string');
    assert.strictEqual(hash1.length, 64);
  });

  it('Audit Test 4: Tampering any field in authorization token invalidates evidence hash', () => {
    const match = { id: 'm_hash_01', status: 'COMPLETED' };
    const bet = { bet_id: 'b_hash_01', match_id: 'm_hash_01', market_id: 'm1', selection_id: 's1' };
    const auth = authorizeSettlement({
      match,
      bet,
      marketContext: { marketId: 'm1', boundaryReached: true },
      evaluatedOutcome: 'WON',
    });
    assert.strictEqual(auth.success, true);

    // Tamper gradedOutcome
    const tamperedOutcome = { ...auth.authorization, gradedOutcome: 'LOST' };
    const res1 = validateSettlementAuthorization({
      authorization: tamperedOutcome,
      bet,
      matchState: { matchId: 'm_hash_01' },
      evaluatedOutcome: 'LOST',
    });
    assert.strictEqual(res1.valid, false);
    assert.match(res1.reason, /Evidence hash verification failed/);

    // Tamper confidenceState
    const tamperedConfidence = { ...auth.authorization, confidenceState: 'STALE' };
    const res2 = validateSettlementAuthorization({
      authorization: tamperedConfidence,
      bet,
      matchState: { matchId: 'm_hash_01' },
      evaluatedOutcome: 'WON',
    });
    assert.strictEqual(res2.valid, false);
  });

  // Part 8: Snapshot Identity Security
  it('Audit Test 5: Mismatched event ID in bet vs authorization is rejected', () => {
    const match = { id: 'm_id_01', status: 'COMPLETED' };
    const bet = { bet_id: 'b_id_01', match_id: 'm_id_01', market_id: 'm1', selection_id: 's1' };
    const auth = authorizeSettlement({
      match,
      bet,
      marketContext: { marketId: 'm1', boundaryReached: true },
      evaluatedOutcome: 'WON',
    });

    const foreignBet = { bet_id: 'b_foreign_99', match_id: 'm_id_01' };
    const validation = validateSettlementAuthorization({
      authorization: auth.authorization,
      bet: foreignBet,
      matchState: { matchId: 'm_id_01' },
      evaluatedOutcome: 'WON',
    });
    assert.strictEqual(validation.valid, false);
    assert.match(validation.reason, /does not match bet/);
  });

  // Part 13 & 14: Market Policy & Insufficient Snapshot Bypass
  it('Audit Test 6: Micro-market policy strictly controls allowSnapshotFinality flag', () => {
    assert.strictEqual(resolveMarketFinalityPolicy('OVER_TOTAL').allowSnapshotFinality, true);
    assert.strictEqual(resolveMarketFinalityPolicy('WICKET_IN_OVER').allowSnapshotFinality, true);
    assert.strictEqual(resolveMarketFinalityPolicy('DISMISSAL_SCORE').allowSnapshotFinality, true);
    assert.strictEqual(resolveMarketFinalityPolicy('NEXT_BALL').allowSnapshotFinality, true);
    assert.strictEqual(resolveMarketFinalityPolicy('TOSS').allowSnapshotFinality, true);

    assert.strictEqual(resolveMarketFinalityPolicy('MATCH_WINNER').allowSnapshotFinality, false);
    assert.strictEqual(resolveMarketFinalityPolicy('TEAM_TOTAL').allowSnapshotFinality, false);
    assert.strictEqual(resolveMarketFinalityPolicy('PLAYER_RUNS').allowSnapshotFinality, false);
    assert.strictEqual(resolveMarketFinalityPolicy('ACCUMULATOR').allowSnapshotFinality, false);
  });

  it('Audit Test 7: Insufficient snapshot evidence (no outcome / incomplete boundary) blocks settlement', () => {
    const match = { id: 'm_insuf_01', cachedAt: new Date(Date.now() - 7200000).toISOString() };
    const bet = { bet_id: 'b_insuf_01', match_id: 'm_insuf_01', market_id: 'i1_next_over_17_total' };
    const auth = authorizeSettlement({
      match,
      bet,
      marketContext: {
        marketId: 'i1_next_over_17_total',
        marketType: 'OVER_TOTAL',
        boundaryReached: false,
        hasImmutableSnapshotEvidence: false,
      },
      evaluatedOutcome: null,
    });
    assert.strictEqual(auth.success, false);
    assert.strictEqual(auth.confidence.confidenceState, CONFIDENCE_STATES.STALE);
  });

  // Part 17 & 18: Revalidation of 5 Historical Stuck Bets
  it('Audit Test 8: Revalidation confirms 4 micro-markets RECOVERY_ELIGIBLE and 1 TEAM_TOTAL KEEP_OPEN', () => {
    const staleMatch = {
      id: 'oy_45bbebc2-e93b-3aa0-8c0e-583d94394784',
      cachedAt: new Date(Date.now() - 7200000).toISOString(),
    };

    // Bet 1 (Team Total Runs Under 178.5) -> KEEP_OPEN
    const auth1 = authorizeSettlement({
      match: staleMatch,
      bet: { bet_id: 'bet_1787989375340_ec9isr', match_id: staleMatch.id, market_id: 'team_total', selection_id: 'sel_under_178.5' },
      marketContext: { marketId: 'team_total', marketType: 'TEAM_TOTAL', boundaryReached: true, hasImmutableSnapshotEvidence: false },
      evaluatedOutcome: 'WON',
    });
    assert.strictEqual(auth1.success, false);
    assert.strictEqual(auth1.confidence.confidenceState, CONFIDENCE_STATES.STALE);

    // Bet 2 (5th Wicket Under 159.5) -> RECOVERY_ELIGIBLE (WON)
    const auth2 = authorizeSettlement({
      match: staleMatch,
      bet: { bet_id: 'bet_1787989343526_gz1lb5', match_id: staleMatch.id, market_id: 'i1_team_score_at_5_dismissal', selection_id: 'sel_under_159.5' },
      marketContext: { marketId: 'i1_team_score_at_5_dismissal', marketType: 'DISMISSAL_SCORE', boundaryReached: true, hasImmutableSnapshotEvidence: true },
      evaluatedOutcome: 'WON',
    });
    assert.strictEqual(auth2.success, true);
    assert.strictEqual(auth2.authorization.gradedOutcome, 'WON');

    // Bet 3 (5th Wicket Over 159.5) -> RECOVERY_ELIGIBLE (LOST)
    const auth3 = authorizeSettlement({
      match: staleMatch,
      bet: { bet_id: 'bet_1787989337539_7hhbuh', match_id: staleMatch.id, market_id: 'i1_team_score_at_5_dismissal', selection_id: 'sel_over_159.5' },
      marketContext: { marketId: 'i1_team_score_at_5_dismissal', marketType: 'DISMISSAL_SCORE', boundaryReached: true, hasImmutableSnapshotEvidence: true },
      evaluatedOutcome: 'LOST',
    });
    assert.strictEqual(auth3.success, true);
    assert.strictEqual(auth3.authorization.gradedOutcome, 'LOST');

    // Bet 4 (Wicket in Over 16: No) -> RECOVERY_ELIGIBLE (WON)
    const auth4 = authorizeSettlement({
      match: staleMatch,
      bet: { bet_id: 'bet_1787989331426_r1j9xk', match_id: staleMatch.id, market_id: 'i1_wicket_in_over_16', selection_id: 'sel_cwkt_no' },
      marketContext: { marketId: 'i1_wicket_in_over_16', marketType: 'WICKET_IN_OVER', boundaryReached: true, hasImmutableSnapshotEvidence: true },
      evaluatedOutcome: 'WON',
    });
    assert.strictEqual(auth4.success, true);
    assert.strictEqual(auth4.authorization.gradedOutcome, 'WON');

    // Bet 5 (Over 17 Total Under 10.5) -> RECOVERY_ELIGIBLE (WON)
    const auth5 = authorizeSettlement({
      match: staleMatch,
      bet: { bet_id: 'bet_1787989321317_ks5t6b', match_id: staleMatch.id, market_id: 'i1_next_over_17_total', selection_id: 'sel_under_10.5' },
      marketContext: { marketId: 'i1_next_over_17_total', marketType: 'OVER_TOTAL', boundaryReached: true, hasImmutableSnapshotEvidence: true },
      evaluatedOutcome: 'WON',
    });
    assert.strictEqual(auth5.success, true);
    assert.strictEqual(auth5.authorization.gradedOutcome, 'WON');
  });
});
