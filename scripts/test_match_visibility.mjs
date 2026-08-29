import assert from 'node:assert';
import {
  lookupEventForSettlement,
  LOOKUP_RESULT_CODES,
  RETRYABLE_LOOKUP_CODES,
  logSettlementEventLookup,
} from '../lib/settlement/settlementEventLookup.mjs';
import { evaluateSettlementConfidence } from '../lib/settlement/settlementConfidenceEngine.mjs';
import { authorizeSettlement } from '../lib/settlement/settlementAuthorizationEngine.mjs';
import { evaluateWicketInOverMarketBet } from '../lib/liveMatchSettlement.mjs';

async function runTests() {
  console.log('🧪 RUNNING 14 MATCH VISIBILITY & SETTLEMENT LOOKUP SCENARIOS...');

  const sampleBet = {
    bet_id: 'bet_1788004010338_n5gmyk',
    match_id: 'oy_9853f10f-a7fb-324b-a4b5-a9c0506b36e7',
    market_id: 'i2_wicket_in_next_over_12',
    selection_id: 'sel_nwkt_yes',
    status: 'ACCEPTED',
    stake: 1000.0,
    odds: 2.93,
    potential_payout: 2930.0,
    placement_snapshot: {
      legs: [
        {
          matchId: 'oy_9853f10f-a7fb-324b-a4b5-a9c0506b36e7',
          matchName: 'Kochi Blue Tigers vs Thrissur Titans',
          team1Name: 'Kochi Blue Tigers',
          team2Name: 'Thrissur Titans',
          sport: 'cricket',
          league: 'T20 Kerala League',
        },
      ],
    },
  };

  const liveMatch = {
    id: 'oy_9853f10f-a7fb-324b-a4b5-a9c0506b36e7',
    matchId: 'oy_9853f10f-a7fb-324b-a4b5-a9c0506b36e7',
    team1: { name: 'Kochi Blue Tigers' },
    team2: { name: 'Thrissur Titans' },
    status: 'LIVE',
    isLive: true,
    liveDetails: {
      inningsId: 2,
      firstRuns: 171,
      firstWickets: 10,
      chaseRuns: 112,
      chaseWickets: 3,
      chaseOvers: '14.4',
    },
    providerTimestamp: '2026-08-29T12:00:00.000Z',
  };

  // Test 1: Event visible in live list
  const liveById = new Map([[sampleBet.match_id, liveMatch]]);
  const res1 = await lookupEventForSettlement({ bet: sampleBet, liveById });
  assert.strictEqual(res1.success, true);
  assert.strictEqual(res1.lookupResult, LOOKUP_RESULT_CODES.EVENT_FOUND_LIVE);
  console.log('✅ Test 1: Event visible in live list PASS');

  // Test 2: Event removed from live list but available in hydrated map
  const byId = new Map([[sampleBet.match_id, { ...liveMatch, status: 'LIVE' }]]);
  const res2 = await lookupEventForSettlement({ bet: sampleBet, liveById: new Map(), byId });
  assert.strictEqual(res2.success, true);
  assert.strictEqual(res2.lookupSource, 'HYDRATED_MEMORY_MAP');
  console.log('✅ Test 2: Event in hydrated memory map PASS');

  // Test 3: Event available in completed fixtures
  const byIdCompleted = new Map([[sampleBet.match_id, { ...liveMatch, status: 'COMPLETED', matchState: 'post' }]]);
  const res3 = await lookupEventForSettlement({ bet: sampleBet, liveById: new Map(), byId: byIdCompleted });
  assert.strictEqual(res3.success, true);
  assert.strictEqual(res3.lookupResult, LOOKUP_RESULT_CODES.EVENT_FOUND_COMPLETED);
  console.log('✅ Test 3: Event in completed fixtures PASS');

  // Test 4: Safe timestamp handling with non-date string ('Live')
  const conf4 = evaluateSettlementConfidence({
    match: { ...liveMatch, providerTimestamp: null, time: 'Live' },
    bet: sampleBet,
    marketContext: { marketId: sampleBet.market_id, boundaryReached: true, hasImmutableSnapshotEvidence: true },
    evaluatedOutcome: 'LOST',
  });
  assert.strictEqual(conf4.settlementAllowed, true);
  assert.strictEqual(conf4.confidenceState, 'CONFIRMED');
  console.log('✅ Test 4: Safe timestamp parsing with string "Live" PASS');

  // Test 5: Provider timeout
  assert.strictEqual(RETRYABLE_LOOKUP_CODES.has(LOOKUP_RESULT_CODES.PROVIDER_TIMEOUT), true);
  console.log('✅ Test 5: Provider timeout classification PASS');

  // Test 6: Provider rate limit
  assert.strictEqual(RETRYABLE_LOOKUP_CODES.has(LOOKUP_RESULT_CODES.PROVIDER_RATE_LIMITED), true);
  console.log('✅ Test 6: Provider rate limit classification PASS');

  // Test 7: Intermittent lookup non-destructive
  const res7 = await lookupEventForSettlement({ bet: { ...sampleBet, match_id: 'unknown_id' }, liveById: new Map(), byId: new Map() });
  assert.strictEqual(res7.success, false);
  assert.strictEqual(res7.retryable, true);
  console.log('✅ Test 7: Intermittent lookup retryable PASS');

  // Test 8: Backend settlement works via snapshots without frontend
  const auth8 = authorizeSettlement({
    match: liveMatch,
    bet: sampleBet,
    marketContext: { marketId: sampleBet.market_id, boundaryReached: true, hasImmutableSnapshotEvidence: true, snapshotReason: 'wicket_in_over_12_i2_wkts=0' },
    evaluatedOutcome: 'LOST',
    authorizedBy: 'LiveMatchSettlementWorker',
  });
  assert.strictEqual(auth8.success, true);
  console.log('✅ Test 8: Settlement authorized via snapshots PASS');

  // Test 9: Wrong provider event ID / Identity mismatch
  const mismatchedMatch = { id: sampleBet.match_id, team1: { name: 'Wrong Team A' }, team2: { name: 'Wrong Team B' }, status: 'LIVE' };
  const res9 = await lookupEventForSettlement({ bet: sampleBet, liveById: new Map([[sampleBet.match_id, mismatchedMatch]]) });
  assert.strictEqual(res9.success, false);
  assert.strictEqual(res9.lookupResult, LOOKUP_RESULT_CODES.EVENT_ID_MISMATCH);
  console.log('✅ Test 9: Identity mismatch detected PASS');

  // Test 10: Missing match ID
  const res10 = await lookupEventForSettlement({ bet: { bet_id: 'bad' } });
  assert.strictEqual(res10.success, false);
  assert.strictEqual(res10.lookupResult, LOOKUP_RESULT_CODES.EVENT_NOT_FOUND);
  console.log('✅ Test 10: Missing match ID rejected PASS');

  // Test 11: Event not found does NOT settle bet
  const auth11 = authorizeSettlement({ match: null, bet: sampleBet, marketContext: { marketId: sampleBet.market_id, boundaryReached: false }, evaluatedOutcome: null });
  assert.strictEqual(auth11.success, false);
  console.log('✅ Test 11: Missing event does not settle bet PASS');

  // Test 12: Structured logger format
  const log12 = logSettlementEventLookup({ betId: sampleBet.bet_id, eventId: sampleBet.match_id, lookupSource: 'REDIS_CANONICAL_CACHE', lookupResult: LOOKUP_RESULT_CODES.EVENT_FOUND_LIVE, eventStatus: 'LIVE' });
  assert.strictEqual(log12.event, 'SETTLEMENT_EVENT_LOOKUP');
  assert.strictEqual(log12.betId, sampleBet.bet_id);
  console.log('✅ Test 12: Structured logger output PASS');

  // Test 13: Retry logic preserves safe state
  for (const code of [LOOKUP_RESULT_CODES.PROVIDER_TIMEOUT, LOOKUP_RESULT_CODES.PROVIDER_RATE_LIMITED, LOOKUP_RESULT_CODES.PROVIDER_UNAVAILABLE, LOOKUP_RESULT_CODES.STALE_CACHE]) {
    assert.strictEqual(RETRYABLE_LOOKUP_CODES.has(code), true);
  }
  console.log('✅ Test 13: Retry error codes PASS');

  // Test 14: Wicket in over grader handles Innings 2 correctly
  const fakeMatch = { id: sampleBet.match_id, matchId: sampleBet.match_id, liveDetails: { inningsId: 2, chaseOvers: '14.4', overHistory: [{ overNum: 12, balls: ['1', '0', '4', '1', '2', '0'], isCurrent: false }] } };
  const graded14 = await evaluateWicketInOverMarketBet(sampleBet, fakeMatch);
  assert.strictEqual(graded14.outcome, 'LOST');
  console.log('✅ Test 14: Wicket in over grading PASS');

  console.log('\n🎉 ALL 14 SCENARIOS PASSED WITH ZERO FAILURES!');
}

runTests().catch((err) => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});
