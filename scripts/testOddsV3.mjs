#!/usr/bin/env node
/**
 * OddsEngineV3 — CLI Debug Test Runner
 * 
 * Usage: node scripts/testOddsV3.mjs
 */

import { generate } from '../lib/odds-v3/OddsEngineV3.mjs';
import { createCanonicalMatchState } from '../lib/odds-v3/models/CanonicalMatchState.mjs';

// ═══════════════════════════════════════════════════════════════
// TEST STATES
// ═══════════════════════════════════════════════════════════════

const BASE = {
  matchId: 'cric_hundred_m_1',
  sport: 'CRICKET',
  format: 'THE_HUNDRED',
  status: 'LIVE',
  team1: { id: 'OVI', name: 'Oval Invincibles', runs: 142, wickets: 5, balls: 100 },
  currentInnings: 2,
  bowlingTeamId: 'OVI',
  ballsPerInnings: 100,
  providerTimestamp: Date.now(),
};

function makeState(overrides) {
  const input = { ...BASE, ...overrides };
  // Auto-calculate target and runsRequired from team1/team2
  if (input.currentInnings === 2 && input.target == null) {
    input.target = input.team1.runs + 1;
  }
  if (input.currentInnings === 2 && input.runsRequired == null) {
    input.runsRequired = input.target - input.team2.runs;
  }
  return createCanonicalMatchState(input);
}

function printSnapshot(label, snapshot) {
  console.log('\n' + '═'.repeat(60));
  console.log(label);
  console.log('═'.repeat(60));
  console.log(`Engine:        ${snapshot.engine} v${snapshot.engineVersion}`);
  console.log(`Match ID:      ${snapshot.matchId}`);
  console.log(`State Version: ${snapshot.stateVersion}`);
  console.log(`Status:        ${snapshot.status}`);
  console.log(`Markets:       ${snapshot.markets.length}`);
  console.log('');

  for (const m of snapshot.markets) {
    console.log(`  MARKET: ${m.name} [${m.status}]`);
    if (m.line != null) console.log(`  Line:   ${m.line}`);
    for (const s of m.selections) {
      console.log(`    ${s.name}`);
      console.log(`      Probability:      ${s.probability.toFixed(6)}`);
      console.log(`      Fair Odds:        ${s.fairOdds.toFixed(4)}`);
      console.log(`      Margin:           ${(s.margin * 100).toFixed(1)}%`);
      console.log(`      Final Probability:${s.finalProbability.toFixed(6)}`);
      console.log(`      Final Odds:       ${s.odds.toFixed(4)}`);
    }
    if (m.selections.length >= 2 && m.status === 'OPEN') {
      const impliedSum = m.selections.reduce((s, sel) => s + (1 / sel.odds), 0);
      console.log(`    Overround:          ${((impliedSum - 1) * 100).toFixed(2)}%`);
    }
    console.log('');
  }
}

// ═══════════════════════════════════════════════════════════════
// TEST 1: PRIMARY — Oval Invincibles vs Trent Rockets
// ═══════════════════════════════════════════════════════════════

console.log('\n🏏 OddsEngineV3 — CLI Debug Test Runner\n');

const stateA = makeState({
  team2: { id: 'TRT', name: 'Trent Rockets', runs: 98, wickets: 3, balls: 58 },
  battingTeamId: 'TRT',
  ballsCompleted: 58,
  ballsRemaining: 42,
  stateVersion: 1,
});

const snapA = generate(stateA, { debug: false });
printSnapshot('STATE A: Trent 98/3, need 45 off 42', snapA);

// ═══════════════════════════════════════════════════════════════
// TEST 2: MOVEMENT — Trent scoring, probability should increase
// ═══════════════════════════════════════════════════════════════

const stateB = makeState({
  team2: { id: 'TRT', name: 'Trent Rockets', runs: 108, wickets: 3, balls: 68 },
  battingTeamId: 'TRT',
  ballsCompleted: 68,
  ballsRemaining: 32,
  stateVersion: 2,
});
const snapB = generate(stateB);
printSnapshot('STATE B: Trent 108/3, need 35 off 32', snapB);

const stateC = makeState({
  team2: { id: 'TRT', name: 'Trent Rockets', runs: 128, wickets: 3, balls: 80 },
  battingTeamId: 'TRT',
  ballsCompleted: 80,
  ballsRemaining: 20,
  stateVersion: 3,
});
const snapC = generate(stateC);
printSnapshot('STATE C: Trent 128/3, need 15 off 20', snapC);

const stateD = makeState({
  team2: { id: 'TRT', name: 'Trent Rockets', runs: 138, wickets: 3, balls: 90 },
  battingTeamId: 'TRT',
  ballsCompleted: 90,
  ballsRemaining: 10,
  stateVersion: 4,
});
const snapD = generate(stateD);
printSnapshot('STATE D: Trent 138/3, need 5 off 10', snapD);

// ═══════════════════════════════════════════════════════════════
// MOVEMENT VERIFICATION
// ═══════════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(60));
console.log('MOVEMENT VERIFICATION — Trent Rockets P(win) should increase');
console.log('═'.repeat(60));

const winnerMarkets = [snapA, snapB, snapC, snapD].map((s, i) => {
  const wm = s.markets.find(m => m.marketType === 'MATCH_WINNER');
  if (!wm || wm.status !== 'OPEN') return { state: String.fromCharCode(65 + i), pTrent: 'N/A' };
  const trentSel = wm.selections.find(s => s.name === 'Trent Rockets');
  return { state: String.fromCharCode(65 + i), pTrent: trentSel?.probability?.toFixed(6) || 'N/A', odds: trentSel?.odds?.toFixed(4) || 'N/A' };
});

for (const wm of winnerMarkets) {
  console.log(`  State ${wm.state}: P(Trent) = ${wm.pTrent}, Odds = ${wm.odds}`);
}

// Check monotonic increase
let movementPass = true;
for (let i = 1; i < winnerMarkets.length; i++) {
  if (winnerMarkets[i].pTrent !== 'N/A' && winnerMarkets[i - 1].pTrent !== 'N/A') {
    if (Number(winnerMarkets[i].pTrent) <= Number(winnerMarkets[i - 1].pTrent)) {
      console.log(`  ❌ MOVEMENT FAIL: State ${winnerMarkets[i].state} P not greater than State ${winnerMarkets[i - 1].state}`);
      movementPass = false;
    }
  }
}
if (movementPass) console.log('  ✅ MOVEMENT PASS: Trent probability monotonically increases');

// ═══════════════════════════════════════════════════════════════
// TEST 3: IMPOSSIBLE STATE — 0 balls remaining
// ═══════════════════════════════════════════════════════════════

const stateImpossible = makeState({
  team2: { id: 'TRT', name: 'Trent Rockets', runs: 98, wickets: 3, balls: 100 },
  battingTeamId: 'TRT',
  ballsCompleted: 100,
  ballsRemaining: 0,
  stateVersion: 5,
});
const snapImpossible = generate(stateImpossible);
printSnapshot('IMPOSSIBLE: Trent 98/3, 0 balls remaining → DETERMINED', snapImpossible);

// ═══════════════════════════════════════════════════════════════
// TEST 4: WIN STATE — Target reached
// ═══════════════════════════════════════════════════════════════

const stateWin = makeState({
  team2: { id: 'TRT', name: 'Trent Rockets', runs: 143, wickets: 3, balls: 85 },
  battingTeamId: 'TRT',
  target: 143,
  runsRequired: 0,
  ballsCompleted: 85,
  ballsRemaining: 15,
  stateVersion: 6,
});
const snapWin = generate(stateWin);
printSnapshot('WIN: Trent 143/3, target reached → DETERMINED', snapWin);

// ═══════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(60));
console.log('FINAL SUMMARY');
console.log('═'.repeat(60));
console.log(`  State A (98/3 need 45):     ${snapA.status} — ${snapA.markets.length} markets`);
console.log(`  State B (108/3 need 35):    ${snapB.status} — ${snapB.markets.length} markets`);
console.log(`  State C (128/3 need 15):    ${snapC.status} — ${snapC.markets.length} markets`);
console.log(`  State D (138/3 need 5):     ${snapD.status} — ${snapD.markets.length} markets`);
console.log(`  Impossible (98/3 0 balls):  ${snapImpossible.status} — ${snapImpossible.markets.length} markets`);
console.log(`  Win (143/3 target met):     ${snapWin.status} — ${snapWin.markets.length} markets`);
console.log(`  Movement:                   ${movementPass ? '✅ PASS' : '❌ FAIL'}`);
console.log('');
