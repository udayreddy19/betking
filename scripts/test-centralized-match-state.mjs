/**
 * Automated Verification Script for Centralized Match State Engine.
 */

import { centralizedMatchEngine } from '../src/services/centralizedMatchStateEngine.js';

function runTest() {
  console.log('🧪 Launching Centralized Match State Engine Verification Suite...\n');

  const matchId = 'ire_vs_afg_test_01';
  let callbackCount = 0;

  // 1. Subscribe Listener
  const unsubscribe = centralizedMatchEngine.subscribe(matchId, () => {
    callbackCount++;
  });

  // 2. Initial 1st Innings Event (Afghanistan 242/10 in 49.5 ov)
  console.log('[1/8] Ingesting 1st Innings Payload...');
  const state1 = centralizedMatchEngine.updateMatchState(matchId, {
    matchId,
    team1: { name: 'Ireland', shortName: 'IRE' },
    team2: { name: 'Afghanistan', shortName: 'AFG' },
    isLive: true,
    runs: 242,
    wickets: 10,
    overs: '49.5',
    commentary: 'Afghanistan 242 all out in 49.5 overs',
  });

  console.log(`Innings: ${state1.currentInnings.number}`);
  console.log(`Target (Must be null in 1st Innings): ${state1.chaseState?.target}`);
  console.log(`Team 1 Score: ${state1.teams.team1.score}`);

  if (state1.chaseState?.target !== null && state1.chaseState?.target !== undefined) {
    throw new Error('Target must be null in 1st innings!');
  }

  // 3. Ingest 2nd Innings Target Chase Event (Ireland chasing 243)
  console.log('\n[2/8] Ingesting 2nd Innings Target Chase Payload...');
  const state2 = centralizedMatchEngine.updateMatchState(matchId, {
    matchId,
    team1: { name: 'Ireland', shortName: 'IRE' },
    team2: { name: 'Afghanistan', shortName: 'AFG' },
    isLive: true,
    runs: 39,
    wickets: 1,
    overs: '3.0',
    commentary: 'Ireland need 204 runs in 222 balls at 5.5 RPO',
  });

  console.log(`Innings: ${state2.currentInnings.number}`);
  console.log(`Target: ${state2.chaseState?.target}`);
  console.log(`Required Runs: ${state2.chaseState?.requiredRuns}`);
  console.log(`Required Run Rate: ${state2.chaseState?.requiredRunRate}`);

  if (state2.chaseState?.target !== 243) {
    throw new Error(`Target calculation incorrect! Expected 243, got ${state2.chaseState?.target}`);
  }
  if (state2.chaseState?.requiredRuns !== 204) {
    throw new Error(`Required Runs calculation incorrect! Expected 204, got ${state2.chaseState?.requiredRuns}`);
  }

  // 4. Verify Subscriber Callback Trigger
  console.log('\n[3/8] Checking Subscriber Callbacks...');
  console.log(`Total Subscriber Notifications Received: ${callbackCount}`);
  if (callbackCount < 2) {
    throw new Error('Subscribers were not notified on state updates!');
  }

  // 5. Verify Betting Markets Auto-Recalculation
  console.log('\n[4/8] Checking Centralized Betting Markets Output...');
  console.log(`Betting Markets Count: ${state2.bettingMarkets.length}`);
  console.log(`Match Winner Odds:`, state2.bettingMarkets[0].odds);

  unsubscribe();

  // ═══════════════════════════════════════════════════
  // TEST MATCH 4-INNINGS VERIFICATION
  // ═══════════════════════════════════════════════════
  const testMatchId = 'wi_vs_pak_test_01';

  console.log('\n[5/8] Test Match: Ingesting Innings 1 & 2...');
  const testState1 = centralizedMatchEngine.updateMatchState(testMatchId, {
    matchId: testMatchId,
    team1: { name: 'West Indies', shortName: 'WI' },
    team2: { name: 'Pakistan', shortName: 'PAK' },
    matchFormat: 'Test',
    isLive: true,
    liveDetails: {
      matchFormat: 'Test',
      testInnings: [
        { inningsId: 1, batTeam: 'WI', runs: 350, wickets: 10, overs: '98.4' },
        { inningsId: 2, batTeam: 'PAK', runs: 280, wickets: 10, overs: '85.2' },
      ],
      inningsId: 2,
      commentary: 'Pakistan 280 all out. West Indies lead by 70 runs.',
      batter1: { name: 'Shaheen Afridi', runs: 12, balls: 30, fours: 2, sixes: 0 },
      bowler: { name: 'Kemar Roach', overs: '18.2', runs: 45, wickets: 3 },
    },
  });

  console.log(`Match Format: ${testState1.matchFormat}`);
  console.log(`testInnings count: ${testState1.testInnings?.length}`);
  console.log(`Current Innings Number: ${testState1.currentInnings.number}`);
  console.log(`Lead: ${testState1.leadTrailState.lead}, Leading Team: ${testState1.leadTrailState.leadingTeam}`);
  console.log(`Chase State (Must be null — Not Innings 4): ${testState1.chaseState}`);

  if (testState1.matchFormat !== 'Test') throw new Error('matchFormat must be Test');
  if (testState1.testInnings?.length !== 2) throw new Error('testInnings must have 2 entries');
  if (testState1.chaseState !== null) throw new Error('Chase state must be null in innings 2 of Test match');
  if (testState1.leadTrailState.lead !== 70) throw new Error(`Lead must be 70, got ${testState1.leadTrailState.lead}`);

  console.log('\n[6/8] Test Match: Ingesting Innings 3...');
  const testState2 = centralizedMatchEngine.updateMatchState(testMatchId, {
    matchId: testMatchId,
    team1: { name: 'West Indies', shortName: 'WI' },
    team2: { name: 'Pakistan', shortName: 'PAK' },
    matchFormat: 'Test',
    isLive: true,
    liveDetails: {
      matchFormat: 'Test',
      testInnings: [
        { inningsId: 1, batTeam: 'WI', runs: 350, wickets: 10, overs: '98.4' },
        { inningsId: 2, batTeam: 'PAK', runs: 280, wickets: 10, overs: '85.2' },
        { inningsId: 3, batTeam: 'WI', runs: 200, wickets: 7, overs: '65.3', declared: true },
      ],
      inningsId: 3,
      commentary: 'West Indies 200/7d. WI lead by 270 runs.',
    },
  });

  console.log(`Current Innings Number: ${testState2.currentInnings.number}`);
  console.log(`WI Total: ${testState2.teams.team1.runs} (350 + 200 = 550)`);
  console.log(`Lead: ${testState2.leadTrailState.lead}`);
  console.log(`Chase State (Must be null — Not Innings 4): ${testState2.chaseState}`);

  if (testState2.teams.team1.runs !== 550) throw new Error(`WI total must be 550, got ${testState2.teams.team1.runs}`);
  if (testState2.chaseState !== null) throw new Error('Chase state must be null in innings 3 of Test match');
  if (testState2.leadTrailState.lead !== 270) throw new Error(`Lead must be 270, got ${testState2.leadTrailState.lead}`);

  console.log('\n[7/8] Test Match: Ingesting Innings 4 Target Chase...');
  const testState3 = centralizedMatchEngine.updateMatchState(testMatchId, {
    matchId: testMatchId,
    team1: { name: 'West Indies', shortName: 'WI' },
    team2: { name: 'Pakistan', shortName: 'PAK' },
    matchFormat: 'Test',
    isLive: true,
    liveDetails: {
      matchFormat: 'Test',
      testInnings: [
        { inningsId: 1, batTeam: 'WI', runs: 350, wickets: 10, overs: '98.4' },
        { inningsId: 2, batTeam: 'PAK', runs: 280, wickets: 10, overs: '85.2' },
        { inningsId: 3, batTeam: 'WI', runs: 200, wickets: 7, overs: '65.3', declared: true },
        { inningsId: 4, batTeam: 'PAK', runs: 85, wickets: 3, overs: '28.1' },
      ],
      inningsId: 4,
      testTarget: 271,
      commentary: 'Pakistan need 186 runs to win.',
      batter1: { name: 'Babar Azam', runs: 42, balls: 65, fours: 5, sixes: 0 },
      batter2: { name: 'Shan Masood', runs: 28, balls: 48, fours: 3, sixes: 0 },
      bowler: { name: 'Jason Holder', overs: '8.1', runs: 22, wickets: 1 },
    },
  });

  console.log(`Current Innings Number: ${testState3.currentInnings.number}`);
  console.log(`isChase: ${testState3.currentInnings.isChase}`);
  console.log(`Target: ${testState3.chaseState?.target}`);
  console.log(`Required Runs: ${testState3.chaseState?.requiredRuns}`);
  console.log(`Batter 1: ${testState3.currentBatters.striker.name}`);
  console.log(`Bowler: ${testState3.currentBowler.name}`);
  console.log(`PAK Score: ${testState3.teams.team2.score}`);
  console.log(`WI Score: ${testState3.teams.team1.score}`);

  if (testState3.currentInnings.number !== 4) throw new Error('Must be innings 4');
  if (testState3.currentInnings.isChase !== true) throw new Error('Innings 4 must be chase');
  if (testState3.chaseState?.target !== 271) throw new Error(`Target must be 271, got ${testState3.chaseState?.target}`);
  if (testState3.chaseState?.requiredRuns !== 186) throw new Error(`Req runs must be 186, got ${testState3.chaseState?.requiredRuns}`);
  if (testState3.currentBatters.striker.name !== 'Babar Azam') throw new Error('Batter name mismatch');

  console.log('\n[8/8] Verifying Test Scoring Format (& notation)...');
  console.log(`WI Innings array: ${JSON.stringify(testState3.teams.team1.innings)}`);
  console.log(`PAK Innings array: ${JSON.stringify(testState3.teams.team2.innings)}`);

  if (!testState3.teams.team1.innings || testState3.teams.team1.innings.length !== 2) {
    throw new Error('WI must have 2 innings entries');
  }
  if (!testState3.teams.team2.innings || testState3.teams.team2.innings.length !== 2) {
    throw new Error('PAK must have 2 innings entries');
  }

  console.log('\n✅ CENTRALIZED MATCH STATE ENGINE VERIFICATION PASSED SUCCESSFULLY (LIMITED-OVERS + TEST MATCH)!\n');
}

runTest();
