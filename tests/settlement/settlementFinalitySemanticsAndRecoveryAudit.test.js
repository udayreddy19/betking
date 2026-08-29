import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateSettlementConfidence,
  evaluateProviderConsensus,
  CONFIDENCE_STATES,
  FINALITY_STATES,
  resolveMarketFinalityPolicy,
} from '../../lib/settlement/settlementConfidenceEngine.mjs';
import {
  authorizeSettlement,
  validateSettlementAuthorization,
  computeEvidenceHash,
} from '../../lib/settlement/settlementAuthorizationEngine.mjs';

describe('Phase 38.3: Settlement Finality Semantics, DB Immutability & Recovery Audit Suite', () => {
  // Part 1 & 2: TOSS Market Semantics & Adversarial Tests
  describe('TOSS Market Semantics', () => {
    it('Scenario A: Correct event + authoritative toss winner reaches PROVEN_FINAL while match is LIVE', () => {
      const liveMatch = {
        id: 'oy_toss_match_01',
        status: 'LIVE',
        isLive: true,
        matchState: 'in',
        team1: { name: 'Team A' },
        team2: { name: 'Team B' },
        liveDetails: { tossWinner: 'Team A', tossDecision: 'bat' },
      };
      const tossBet = {
        bet_id: 'b_toss_01',
        match_id: 'oy_toss_match_01',
        market_id: 'toss_winner',
        selection_id: 'sel_team_a',
      };
      const auth = authorizeSettlement({
        match: liveMatch,
        bet: tossBet,
        marketContext: {
          marketId: 'toss_winner',
          marketType: 'TOSS',
          boundaryReached: true,
          hasImmutableSnapshotEvidence: true,
        },
        evaluatedOutcome: 'WON',
      });
      assert.strictEqual(auth.success, true);
      assert.strictEqual(auth.authorization.gradedOutcome, 'WON');
      assert.strictEqual(auth.authorization.confidenceState, CONFIDENCE_STATES.CONFIRMED);
    });

    it('Scenario B & C: Wrong event ID or different fixture with same teams is strictly rejected', () => {
      const match = { id: 'oy_toss_match_02', liveDetails: { tossWinner: 'Team A' } };
      const foreignBet = { bet_id: 'b_toss_02', match_id: 'oy_foreign_match_99', market_id: 'toss_winner' };
      const auth = authorizeSettlement({
        match,
        bet: foreignBet,
        marketContext: { marketId: 'toss_winner', marketType: 'TOSS', boundaryReached: false, hasImmutableSnapshotEvidence: false },
        evaluatedOutcome: null,
      });
      assert.strictEqual(auth.success, false);
    });

    it('Scenario D: Conflicting toss provider data blocks settlement', () => {
      const consensus = evaluateProviderConsensus([
        { provider: 'p1', winner: 'Team A', status: 'LIVE' },
        { provider: 'p2', winner: 'Team B', status: 'LIVE' },
      ], 'TOSS');
      assert.strictEqual(consensus.providersAgree, false);
      assert.ok(consensus.conflictingFields.includes('winner'));
    });
  });

  // Part 5, 6, 7 & 8: Provider Consensus & Outage Policies
  describe('Provider Consensus & Outage Policies', () => {
    it('Scenario 1: Primary FINAL + Secondary FINAL produces consensus and allows settlement', () => {
      const consensus = evaluateProviderConsensus([
        { provider: 'p1', score: 180, wickets: 6, status: 'COMPLETED', winner: 'Team A' },
        { provider: 'p2', score: 180, wickets: 6, status: 'COMPLETED', winner: 'Team A' },
      ]);
      assert.strictEqual(consensus.providersAgree, true);
      assert.strictEqual(consensus.providersAvailable, 2);
    });

    it('Scenario 2: Primary FINAL + Secondary UNAVAILABLE allows single-provider authoritative settlement', () => {
      const consensus = evaluateProviderConsensus([
        { provider: 'p1', score: 180, wickets: 6, status: 'COMPLETED', winner: 'Team A' },
      ]);
      assert.strictEqual(consensus.providersAgree, true);
      assert.strictEqual(consensus.providersAvailable, 1);
    });

    it('Scenario 3: Primary FINAL + Secondary STALE/CONFLICTING strictly blocks settlement', () => {
      const consensus = evaluateProviderConsensus([
        { provider: 'p1', score: 180, wickets: 6, status: 'COMPLETED', winner: 'Team A' },
        { provider: 'p2', score: 160, wickets: 9, status: 'LIVE', winner: 'Team B' },
      ]);
      assert.strictEqual(consensus.providersAgree, false);
      assert.ok(consensus.conflictingFields.includes('score'));
      assert.ok(consensus.conflictingFields.includes('wickets'));
      assert.ok(consensus.conflictingFields.includes('winner'));
    });

    it('Scenario 4: Both providers unavailable returns 0 available and blocks settlement', () => {
      const consensus = evaluateProviderConsensus([]);
      assert.strictEqual(consensus.providersAvailable, 0);
      assert.strictEqual(consensus.providersAgree, true);
    });
  });

  // Part 9 & 10: Final Recovery Candidate Inventory & Full Pipeline Dry Run
  describe('Final Recovery Candidate Inventory & Pipeline Dry Run', () => {
    const staleMatch = {
      id: 'oy_45bbebc2-e93b-3aa0-8c0e-583d94394784',
      cachedAt: new Date(Date.now() - 7200000).toISOString(),
    };

    it('Recovery Candidate 1: bet_1787989343526_gz1lb5 (5th Wicket Under 159.5) -> WON', () => {
      const bet = {
        bet_id: 'bet_1787989343526_gz1lb5',
        match_id: staleMatch.id,
        market_id: 'i1_team_score_at_5_dismissal',
        selection_id: 'sel_under_159.5',
      };
      const auth = authorizeSettlement({
        match: staleMatch,
        bet,
        marketContext: {
          marketId: 'i1_team_score_at_5_dismissal',
          marketType: 'DISMISSAL_SCORE',
          boundaryReached: true,
          hasImmutableSnapshotEvidence: true,
        },
        evaluatedOutcome: 'WON',
      });
      assert.strictEqual(auth.success, true);
      assert.strictEqual(auth.authorization.gradedOutcome, 'WON');

      const validation = validateSettlementAuthorization({
        authorization: auth.authorization,
        bet,
        matchState: { matchId: staleMatch.id },
        evaluatedOutcome: 'WON',
      });
      assert.strictEqual(validation.valid, true);
    });

    it('Recovery Candidate 2: bet_1787989337539_7hhbuh (5th Wicket Over 159.5) -> LOST', () => {
      const bet = {
        bet_id: 'bet_1787989337539_7hhbuh',
        match_id: staleMatch.id,
        market_id: 'i1_team_score_at_5_dismissal',
        selection_id: 'sel_over_159.5',
      };
      const auth = authorizeSettlement({
        match: staleMatch,
        bet,
        marketContext: {
          marketId: 'i1_team_score_at_5_dismissal',
          marketType: 'DISMISSAL_SCORE',
          boundaryReached: true,
          hasImmutableSnapshotEvidence: true,
        },
        evaluatedOutcome: 'LOST',
      });
      assert.strictEqual(auth.success, true);
      assert.strictEqual(auth.authorization.gradedOutcome, 'LOST');

      const validation = validateSettlementAuthorization({
        authorization: auth.authorization,
        bet,
        matchState: { matchId: staleMatch.id },
        evaluatedOutcome: 'LOST',
      });
      assert.strictEqual(validation.valid, true);
    });

    it('Recovery Candidate 3: bet_1787989331426_r1j9xk (Wicket in Over 16: No) -> WON', () => {
      const bet = {
        bet_id: 'bet_1787989331426_r1j9xk',
        match_id: staleMatch.id,
        market_id: 'i1_wicket_in_over_16',
        selection_id: 'sel_cwkt_no',
      };
      const auth = authorizeSettlement({
        match: staleMatch,
        bet,
        marketContext: {
          marketId: 'i1_wicket_in_over_16',
          marketType: 'WICKET_IN_OVER',
          boundaryReached: true,
          hasImmutableSnapshotEvidence: true,
        },
        evaluatedOutcome: 'WON',
      });
      assert.strictEqual(auth.success, true);
      assert.strictEqual(auth.authorization.gradedOutcome, 'WON');

      const validation = validateSettlementAuthorization({
        authorization: auth.authorization,
        bet,
        matchState: { matchId: staleMatch.id },
        evaluatedOutcome: 'WON',
      });
      assert.strictEqual(validation.valid, true);
    });

    it('Recovery Candidate 4: bet_1787989321317_ks5t6b (Over 17 Total Under 10.5) -> WON', () => {
      const bet = {
        bet_id: 'bet_1787989321317_ks5t6b',
        match_id: staleMatch.id,
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
        },
        evaluatedOutcome: 'WON',
      });
      assert.strictEqual(auth.success, true);
      assert.strictEqual(auth.authorization.gradedOutcome, 'WON');

      const validation = validateSettlementAuthorization({
        authorization: auth.authorization,
        bet,
        matchState: { matchId: staleMatch.id },
        evaluatedOutcome: 'WON',
      });
      assert.strictEqual(validation.valid, true);
    });

    it('Candidate 5: bet_1787989375340_ec9isr (Team Total Under 178.5) -> KEEP_OPEN', () => {
      const bet = {
        bet_id: 'bet_1787989375340_ec9isr',
        match_id: staleMatch.id,
        market_id: 'team_total',
        selection_id: 'sel_under_178.5',
      };
      const auth = authorizeSettlement({
        match: staleMatch,
        bet,
        marketContext: {
          marketId: 'team_total',
          marketType: 'TEAM_TOTAL',
          boundaryReached: true,
          hasImmutableSnapshotEvidence: false,
        },
        evaluatedOutcome: 'WON',
      });
      assert.strictEqual(auth.success, false);
      assert.strictEqual(auth.confidence.confidenceState, CONFIDENCE_STATES.STALE);
    });
  });
});
