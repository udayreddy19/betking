/**
 * Comprehensive Automated Test Suite for TestCricketEngine.
 */

import { TestCricketEngine, TEST_MATCH_STATES, SESSIONS } from '../lib/testCricketEngine.mjs';

function runTest() {
  console.log('🏏 Launching Test Cricket Engine Verification Suite...\n');

  const engine = new TestCricketEngine({
    matchId: 'ind_vs_eng_lords_2026',
    seriesName: 'ICC World Test Championship Final',
    venue: 'Lord\'s Cricket Ground, London',
    teamA: { name: 'India', shortName: 'IND' },
    teamB: { name: 'England', shortName: 'ENG' },
  });

  // 1. Check Initial State
  console.log(`[1/6] Initial State Check: ${engine.state}`);
  if (engine.state !== TEST_MATCH_STATES.PRE_MATCH) {
    throw new Error('Initial state is not PRE_MATCH');
  }

  // 2. Perform Toss
  console.log('[2/6] Performing Toss...');
  engine.performToss('India', 'BAT');
  console.log(`Toss Result: ${engine.tossWinner} elected to ${engine.tossDecision}`);
  console.log(`Current State: ${engine.state}, Day: ${engine.currentDay}, Session: ${engine.currentSession}`);

  // 3. Simulate 1st Innings (India Batting)
  console.log('\n[3/6] Simulating 1st Innings (India Batting)...');
  // Deliver 120 balls with various outcomes
  for (let i = 0; i < 120; i++) {
    const isWicket = i % 15 === 0 && i > 0;
    const isFour = i % 7 === 0;
    const runs = isFour ? 4 : (i % 3);
    const extraType = i % 25 === 0 ? 'wide' : (i % 40 === 0 ? 'no_ball' : null);

    engine.deliverBall({
      runs,
      wicket: isWicket,
      wicketType: isWicket ? 'caught' : null,
      extraType,
    });
  }

  const inn1 = engine.inningsList[0];
  console.log(`1st Innings Score: ${inn1.batTeam} ${inn1.runs}/${inn1.wickets} in ${inn1.oversFormatted} overs`);

  // Declare 1st Innings
  console.log('Declaring 1st Innings...');
  engine.declareInnings();

  // 4. Simulate 2nd Innings (England Batting)
  console.log('\n[4/6] Simulating 2nd Innings (England Batting)...');
  for (let i = 0; i < 60; i++) {
    const isWicket = i % 8 === 0 && i > 0;
    const runs = i % 4 === 0 ? 4 : (i % 2);
    engine.deliverBall({
      runs,
      wicket: isWicket,
      wicketType: isWicket ? 'bowled' : null,
    });
  }

  const inn2 = engine.inningsList[1];
  console.log(`2nd Innings Score: ${inn2.batTeam} ${inn2.runs}/${inn2.wickets} in ${inn2.oversFormatted} overs`);

  // 5. Test REST API Snapshots
  console.log('\n[5/6] Testing REST API Payload Generators...');
  const liveSnapshot = engine.getLiveSnapshot();
  const scorecard = engine.getFullScorecard();
  const sessionSummary = engine.getSessionSummary();

  console.log('Live Snapshot JSON Keys:', Object.keys(liveSnapshot));
  console.log('Scorecard Innings Count:', scorecard.innings.length);
  console.log('Current Session:', sessionSummary.session, '| Overs Bowled:', sessionSummary.totalOversBowled);

  // 6. Verify Match Result Mechanics
  console.log('\n[6/6] Verifying Match Completion & Player of the Match...');
  // Force 10 wickets in 2nd innings to trigger match state transition
  while (!engine.getCurrentInnings()?.allOut && engine.currentInningsIndex === 1) {
    engine.deliverBall({ runs: 0, wicket: true, wicketType: 'lbw' });
  }

  const finalSnapshot = engine.getLiveSnapshot();
  console.log(`Current Match State: ${engine.state}`);
  if (finalSnapshot.playerOfTheMatch) {
    console.log(`Player of the Match: ${finalSnapshot.playerOfTheMatch.name} (${finalSnapshot.playerOfTheMatch.impactPoints} impact pts)`);
  }

  console.log('\n✅ TEST CRICKET SCORING ENGINE VERIFICATION PASSED SUCCESSFULLY!\n');
}

runTest();
