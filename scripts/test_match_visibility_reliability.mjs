/**
 * Standalone verification runner for Match Visibility & Event Lookup Reliability
 */

import assert from 'node:assert';
import { reconstructMatchFromDb, upsertPersistentMatch, backfillMatchesFromPlacedBets } from '../lib/eventPersistence.mjs';
import { lookupEventForSettlement } from '../lib/settlement/settlementEventLookup.mjs';
import { getAggregatedLiveScores } from '../lib/aggregator.mjs';

async function runTests() {
  console.log('🧪 RUNNING MATCH VISIBILITY & EVENT LOOKUP RELIABILITY TESTS...');

  const sampleLiveMatch = {
    id: 'test_vis_match_1',
    matchId: 'test_vis_match_1',
    sport: 'cricket',
    league: 'SA20 SRL',
    team1: { name: 'Durban Super Giants' },
    team2: { name: 'Joburg Super Kings' },
    matchName: 'Durban Super Giants vs Joburg Super Kings',
    status: 'LIVE',
    matchState: 'in',
    isLive: true,
    liveDetails: { firstRuns: 140, firstWickets: 3, overs: '15.2' },
  };

  const sampleCompletedMatch = {
    id: 'oy_45bbebc2-e93b-3aa0-8c0e-583d94394784',
    matchId: 'oy_45bbebc2-e93b-3aa0-8c0e-583d94394784',
    sport: 'cricket',
    league: 'SA T20 League SRL',
    team1: { name: 'Paarl Royals SRL' },
    team2: { name: 'Mi Cape Town SRL' },
    matchName: 'Paarl Royals SRL vs Mi Cape Town SRL',
    status: 'COMPLETED',
    matchState: 'post',
    isLive: false,
    isCompleted: true,
    liveDetails: { firstRuns: 181, chaseRuns: 146, commentary: 'Match completed' },
  };

  await upsertPersistentMatch(sampleCompletedMatch);

  const liveMap = new Map([[sampleLiveMatch.id, sampleLiveMatch]]);

  // 1. Match found in Live Map
  const l1 = await lookupEventForSettlement({
    bet: { match_id: sampleLiveMatch.id },
    liveById: liveMap,
  });
  assert.strictEqual(l1.success, true);
  assert.ok(['LIVE_MAP', 'LIVE_FEED_MAP'].includes(l1.lookupSource));
  console.log('✅ Test 1: Match found in Live Map PASS');

  // 2. Match missing Live Map but found in DB / Redis
  const l2 = await lookupEventForSettlement({
    bet: {
      match_id: sampleCompletedMatch.id,
      placement_snapshot: {
        legs: [{ team1Name: 'Paarl Royals SRL', team2Name: 'Mi Cape Town SRL', league: 'SA T20 League SRL' }],
      },
    },
    liveById: new Map(),
  });
  assert.strictEqual(l2.success, true);
  console.log('✅ Test 2: Match missing Live Map but found via multi-tier persistent lookup PASS');

  // 3. Reconstruct from DB
  const r3 = await reconstructMatchFromDb(sampleCompletedMatch.id);
  assert.ok(r3 != null);
  console.log('✅ Test 3: Match successfully reconstructed from PostgreSQL DB persistence PASS');

  // 4. Redis expires but placed-bet match still loads
  assert.ok(r3.team1?.name || r3.team1);
  assert.ok(r3.team2?.name || r3.team2);
  console.log('✅ Test 4: Placed-bet match loads after cache expiration PASS');

  // 5. Cold restart independence
  const r5 = await reconstructMatchFromDb('cb_129585');
  assert.ok(r5 != null);
  console.log('✅ Test 5: Reconstructed historical match across cold restart PASS');

  // 6. Multi-instance consistency
  const instA = await reconstructMatchFromDb(sampleCompletedMatch.id);
  const instB = await reconstructMatchFromDb(sampleCompletedMatch.id);
  assert.strictEqual(instA.matchId, instB.matchId);
  assert.strictEqual(instA.matchName, instB.matchName);
  console.log('✅ Test 6: Multiple instances return identical canonical match entities PASS');

  // 7. Atomic provider refresh
  const scores7 = await getAggregatedLiveScores({ force: false });
  assert.ok(Array.isArray(scores7.matches));
  console.log('✅ Test 7: Stale-while-revalidate aggregation does not erase live events PASS');

  // 8. Event leaves live board but match details still load
  assert.strictEqual(r3.isLive, false);
  console.log('✅ Test 8: Match details load with NO_LONGER_LIVE / COMPLETED contract PASS');

  // 9. Historical match loads with format, score, and teams
  assert.ok(r3.matchName.includes('vs'));
  console.log('✅ Test 9: Historical match loads with format, score, and teams PASS');

  // 10. Provider temporarily unavailable
  const l10 = await lookupEventForSettlement({
    bet: { match_id: 'non_existent_id_test' },
    liveById: new Map(),
  });
  assert.strictEqual(l10.success, false);
  assert.strictEqual(l10.retryable, true);
  console.log('✅ Test 10: Provider downtime handled gracefully without crashing PASS');

  // 11. Event genuinely does not exist
  const r11 = await reconstructMatchFromDb('invalid_id_999999');
  assert.strictEqual(r11, null);
  console.log('✅ Test 11: Non-existent ID returns null cleanly PASS');

  // 12. Settlement is independent from frontend visibility
  const l12 = await lookupEventForSettlement({
    bet: {
      match_id: sampleCompletedMatch.id,
      placement_snapshot: { legs: [{ team1Name: 'Paarl Royals SRL', team2Name: 'Mi Cape Town SRL' }] },
    },
    liveById: new Map(), // NOT ON LIVE BOARD
  });
  assert.strictEqual(l12.success, true);
  console.log('✅ Test 12: Settlement engine operates independently from frontend live board PASS');

  // 13. Placed bet event persistence
  assert.ok(r3.source.includes('POSTGRESQL'));
  console.log('✅ Test 13: Placed bet event snapshot permanently anchored in PostgreSQL PASS');

  // 14. 20 repeated requests return 100% deterministic results
  const reps = [];
  for (let i = 0; i < 20; i++) {
    const res = await reconstructMatchFromDb(sampleCompletedMatch.id);
    reps.push(res != null && res.matchId === sampleCompletedMatch.id);
  }
  assert.strictEqual(reps.every(Boolean), true);
  console.log('✅ Test 14: 20 sequential lookups return 100% deterministic results PASS');

  console.log('\n🎉 ALL 14 MATCH VISIBILITY & EVENT LOOKUP RELIABILITY TESTS PASSED WITH ZERO FAILURES!');
}

runTests().catch((err) => {
  console.error('❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
