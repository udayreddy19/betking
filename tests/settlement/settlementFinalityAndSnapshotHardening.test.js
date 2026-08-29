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
} from '../../lib/settlement/settlementAuthorizationEngine.mjs';
import {
  evaluateDismissalMarketBet,
  evaluateWicketInOverMarketBet,
  evaluateOverMarketBet,
} from '../../lib/liveMatchSettlement.mjs';

describe('Phase 38.1: Settlement Finality & Snapshot Authorization Hardening Suite', () => {
  // 1. Full-event finality vs stale data
  it('Scenario 1: FINAL_CONFIRMED match authorizes full-match markets', () => {
    const match = {
      id: 'm_final_01',
      matchState: 'completed',
      status: 'COMPLETED',
      cachedAt: new Date(Date.now() - 60000).toISOString(),
    };
    const bet = { bet_id: 'b_winner_01', match_id: 'm_final_01', market_id: 'match_winner', selection_id: 'team1' };
    const auth = authorizeSettlement({
      match,
      bet,
      marketContext: { marketId: 'match_winner', marketType: 'MATCH_WINNER', boundaryReached: true },
      evaluatedOutcome: 'WON',
    });

    assert.strictEqual(auth.success, true);
    assert.strictEqual(auth.confidence.confidenceState, CONFIDENCE_STATES.CONFIRMED);
    assert.strictEqual(auth.confidence.finalityState, FINALITY_STATES.SETTLEMENT_ELIGIBLE);
  });

  it('Scenario 2: STALE match feed strictly blocks full-match markets (MATCH_WINNER, TEAM_TOTAL)', () => {
    const staleMatch = {
      id: 'm_stale_01',
      status: 'LIVE',
      isLive: true,
      matchState: 'in',
      time: 'Live',
      cachedAt: new Date(Date.now() - 7200000).toISOString(), // 2 hours old
      liveDetails: {
        inningsId: 1,
        overs: '12.4',
        score1: 104,
        wickets1: 3,
      },
    };
    const winnerBet = { bet_id: 'b_win_02', match_id: 'm_stale_01', market_id: 'match_winner', selection_id: 'team1' };
    const authWinner = authorizeSettlement({
      match: staleMatch,
      bet: winnerBet,
      marketContext: { marketId: 'match_winner', marketType: 'MATCH_WINNER', boundaryReached: true },
      evaluatedOutcome: 'WON',
    });
    assert.strictEqual(authWinner.success, false);
    assert.strictEqual(authWinner.confidence.confidenceState, CONFIDENCE_STATES.STALE);
    assert.match(authWinner.error, /STALE_DATA/);

    const teamTotalBet = { bet_id: 'b_tt_02', match_id: 'm_stale_01', market_id: 'team_total', selection_id: 'sel_under_178.5' };
    const authTeamTotal = authorizeSettlement({
      match: staleMatch,
      bet: teamTotalBet,
      marketContext: { marketId: 'team_total', marketType: 'TEAM_TOTAL', boundaryReached: true },
      evaluatedOutcome: 'WON',
    });
    assert.strictEqual(authTeamTotal.success, false);
    assert.strictEqual(authTeamTotal.confidence.confidenceState, CONFIDENCE_STATES.STALE);
  });

  it('Scenario 3: Elapsed time + missing provider data NEVER marks event FINAL', () => {
    const vanishedMatch = {
      id: 'm_vanished_01',
      startTime: new Date(Date.now() - 18000000).toISOString(), // 5 hours ago
      cachedAt: new Date(Date.now() - 14400000).toISOString(), // 4 hours ago
      isLive: true,
      matchState: 'in',
    };
    const bet = { bet_id: 'b_vanished_01', match_id: 'm_vanished_01', market_id: 'match_winner' };
    const auth = authorizeSettlement({
      match: vanishedMatch,
      bet,
      marketContext: { marketId: 'match_winner', marketType: 'MATCH_WINNER', boundaryReached: true },
      evaluatedOutcome: 'WON',
    });
    assert.strictEqual(auth.success, false);
    assert.strictEqual(auth.confidence.finalityState, FINALITY_STATES.LIVE);
    assert.strictEqual(auth.confidence.confidenceState, CONFIDENCE_STATES.STALE);
  });

  // 2. Micro-market snapshot authorization
  it('Scenario 4: Completed historical over snapshot authorizes OVER_TOTAL settlement even if live feed is stale', () => {
    const staleMatch = {
      id: 'oy_45bbebc2-e93b-3aa0-8c0e-583d94394784',
      cachedAt: new Date(Date.now() - 7200000).toISOString(),
    };
    const bet = {
      bet_id: 'bet_1787989321317_ks5t6b',
      match_id: 'oy_45bbebc2-e93b-3aa0-8c0e-583d94394784',
      market_id: 'i1_next_over_17_total',
      selection_id: 'sel_under_10.5',
    };
    const auth = authorizeSettlement({
      match: staleMatch,
      bet,
      marketContext: {
        marketId: 'i1_next_over_17_total',
        marketType: 'OVER_TOTAL',
        boundaryReached: true,
        hasImmutableSnapshotEvidence: true,
        snapshotReason: 'next_over_17_total_runs=6_line=10.5',
      },
      evaluatedOutcome: 'WON',
    });
    assert.strictEqual(auth.success, true);
    assert.strictEqual(auth.confidence.confidenceState, CONFIDENCE_STATES.CONFIRMED);
    assert.strictEqual(auth.confidence.finalityState, FINALITY_STATES.SETTLEMENT_ELIGIBLE);
  });

  it('Scenario 5: Completed historical dismissal snapshot authorizes DISMISSAL_SCORE settlement even if live feed is stale', () => {
    const staleMatch = {
      id: 'oy_45bbebc2-e93b-3aa0-8c0e-583d94394784',
      cachedAt: new Date(Date.now() - 7200000).toISOString(),
    };
    const betWon = {
      bet_id: 'bet_1787989343526_gz1lb5',
      match_id: 'oy_45bbebc2-e93b-3aa0-8c0e-583d94394784',
      market_id: 'i1_team_score_at_5_dismissal',
      selection_id: 'sel_under_159.5',
    };
    const authWon = authorizeSettlement({
      match: staleMatch,
      bet: betWon,
      marketContext: {
        marketId: 'i1_team_score_at_5_dismissal',
        marketType: 'DISMISSAL_SCORE',
        boundaryReached: true,
        hasImmutableSnapshotEvidence: true,
        snapshotReason: 'dismissal_5_i1_score=149_line=159.5',
      },
      evaluatedOutcome: 'WON',
    });
    assert.strictEqual(authWon.success, true);

    const betLost = {
      bet_id: 'bet_1787989337539_7hhbuh',
      match_id: 'oy_45bbebc2-e93b-3aa0-8c0e-583d94394784',
      market_id: 'i1_team_score_at_5_dismissal',
      selection_id: 'sel_over_159.5',
    };
    const authLost = authorizeSettlement({
      match: staleMatch,
      bet: betLost,
      marketContext: {
        marketId: 'i1_team_score_at_5_dismissal',
        marketType: 'DISMISSAL_SCORE',
        boundaryReached: true,
        hasImmutableSnapshotEvidence: true,
        snapshotReason: 'dismissal_5_i1_score=149_line=159.5',
      },
      evaluatedOutcome: 'LOST',
    });
    assert.strictEqual(authLost.success, true);
    assert.strictEqual(authLost.authorization.gradedOutcome, 'LOST');
  });

  // 3. Security & Validation checks
  it('Scenario 6: Snapshot evidence without verified boundary/outcome is blocked', () => {
    const staleMatch = {
      id: 'm_live_01',
      cachedAt: new Date(Date.now() - 7200000).toISOString(),
    };
    const bet = {
      bet_id: 'b_unresolved_01',
      match_id: 'm_live_01',
      market_id: 'i1_next_over_17_total',
    };
    const auth = authorizeSettlement({
      match: staleMatch,
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

  it('Scenario 7: Tampered or expired authorization token is rejected by validation', () => {
    const match = { id: 'm_auth_01', status: 'COMPLETED' };
    const bet = { bet_id: 'b_auth_01', match_id: 'm_auth_01', market_id: 'm1', selection_id: 's1' };
    const auth = authorizeSettlement({
      match,
      bet,
      marketContext: { marketId: 'm1', boundaryReached: true },
      evaluatedOutcome: 'WON',
    });
    assert.strictEqual(auth.success, true);

    // Valid
    const valid = validateSettlementAuthorization({
      authorization: auth.authorization,
      bet,
      matchState: { matchId: 'm_auth_01', marketId: 'm1', selectionId: 's1' },
      evaluatedOutcome: 'WON',
    });
    assert.strictEqual(valid.valid, true);

    // Tampered token hash
    const tampered = validateSettlementAuthorization({
      authorization: { ...auth.authorization, evidenceHash: 'sha256:corrupted_hash' },
      bet,
      matchState: { matchId: 'm_auth_01', marketId: 'm1', selectionId: 's1' },
      evaluatedOutcome: 'WON',
    });
    assert.strictEqual(tampered.valid, false);
    assert.match(tampered.reason, /Evidence hash verification failed/);

    // Mismatched betId
    const mismatched = validateSettlementAuthorization({
      authorization: auth.authorization,
      bet: { bet_id: 'b_other_02' },
      matchState: { matchId: 'm_auth_01', marketId: 'm1', selectionId: 's1' },
      evaluatedOutcome: 'WON',
    });
    assert.strictEqual(mismatched.valid, false);
    assert.match(mismatched.reason, /does not match bet/);
  });

  // 4. Exact 5 stuck bets dry-run verification
  it('Scenario 8: Dry-run evaluation on exact 5 Phase 38 stuck bets', () => {
    const staleMatch = {
      id: 'oy_45bbebc2-e93b-3aa0-8c0e-583d94394784',
      cachedAt: new Date(Date.now() - 7200000).toISOString(),
    };

    // Bet 1: Team Total Runs (Under 178.5) -> Incomplete innings, full-match market -> KEEP_OPEN
    const bet1 = { bet_id: 'bet_1787989375340_ec9isr', match_id: staleMatch.id, market_id: 'team_total', selection_id: 'sel_under_178.5' };
    const auth1 = authorizeSettlement({
      match: staleMatch,
      bet: bet1,
      marketContext: { marketId: 'team_total', marketType: 'TEAM_TOTAL', boundaryReached: true, hasImmutableSnapshotEvidence: false },
      evaluatedOutcome: 'WON',
    });
    assert.strictEqual(auth1.success, false);
    assert.strictEqual(auth1.confidence.confidenceState, CONFIDENCE_STATES.STALE); // Kept open safely

    // Bet 2: 5th Wicket Under 159.5 -> Snapshot score 149 -> RECOVERY_ELIGIBLE (WON)
    const bet2 = { bet_id: 'bet_1787989343526_gz1lb5', match_id: staleMatch.id, market_id: 'i1_team_score_at_5_dismissal', selection_id: 'sel_under_159.5' };
    const auth2 = authorizeSettlement({
      match: staleMatch,
      bet: bet2,
      marketContext: { marketId: 'i1_team_score_at_5_dismissal', marketType: 'DISMISSAL_SCORE', boundaryReached: true, hasImmutableSnapshotEvidence: true },
      evaluatedOutcome: 'WON',
    });
    assert.strictEqual(auth2.success, true);
    assert.strictEqual(auth2.authorization.gradedOutcome, 'WON');

    // Bet 3: 5th Wicket Over 159.5 -> Snapshot score 149 -> RECOVERY_ELIGIBLE (LOST)
    const bet3 = { bet_id: 'bet_1787989337539_7hhbuh', match_id: staleMatch.id, market_id: 'i1_team_score_at_5_dismissal', selection_id: 'sel_over_159.5' };
    const auth3 = authorizeSettlement({
      match: staleMatch,
      bet: bet3,
      marketContext: { marketId: 'i1_team_score_at_5_dismissal', marketType: 'DISMISSAL_SCORE', boundaryReached: true, hasImmutableSnapshotEvidence: true },
      evaluatedOutcome: 'LOST',
    });
    assert.strictEqual(auth3.success, true);
    assert.strictEqual(auth3.authorization.gradedOutcome, 'LOST');

    // Bet 4: Wicket in Over 16: No -> Snapshot wkts 0 -> RECOVERY_ELIGIBLE (WON)
    const bet4 = { bet_id: 'bet_1787989331426_r1j9xk', match_id: staleMatch.id, market_id: 'i1_wicket_in_over_16', selection_id: 'sel_cwkt_no' };
    const auth4 = authorizeSettlement({
      match: staleMatch,
      bet: bet4,
      marketContext: { marketId: 'i1_wicket_in_over_16', marketType: 'WICKET_IN_OVER', boundaryReached: true, hasImmutableSnapshotEvidence: true },
      evaluatedOutcome: 'WON',
    });
    assert.strictEqual(auth4.success, true);
    assert.strictEqual(auth4.authorization.gradedOutcome, 'WON');

    // Bet 5: Over 17 Total Under 10.5 -> Snapshot runs 6 -> RECOVERY_ELIGIBLE (WON)
    const bet5 = { bet_id: 'bet_1787989321317_ks5t6b', match_id: staleMatch.id, market_id: 'i1_next_over_17_total', selection_id: 'sel_under_10.5' };
    const auth5 = authorizeSettlement({
      match: staleMatch,
      bet: bet5,
      marketContext: { marketId: 'i1_next_over_17_total', marketType: 'OVER_TOTAL', boundaryReached: true, hasImmutableSnapshotEvidence: true },
      evaluatedOutcome: 'WON',
    });
    assert.strictEqual(auth5.success, true);
    assert.strictEqual(auth5.authorization.gradedOutcome, 'WON');
  });
});
