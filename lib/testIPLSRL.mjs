/**
 * Module AL: IPLSRL Verification Test Suite
 * Automated tests for IPLSRL engines, simulation, deterministic seed reproducibility,
 * probability calculations, odds adjustments, market suspension, and settlement rules.
 */

import { createIPLSRLSeason, getIPLSRLSeason, getIPLSRLStandings, getIPLSRLPlayoffs } from './iplSrlEngine.mjs';
import { getAllIPLSRLTeams, createIPLSRLTeam, getIPLSRLTeamById } from './iplSrlTeamEngine.mjs';
import { getAllIPLSRLPlayers, createIPLSRLPlayer, getIPLSRLPlayerById } from './iplSrlPlayerEngine.mjs';
import { calculateIPLSRLPlayerForm } from './iplSrlFormEngine.mjs';
import { generateIPLSRLFixtures } from './iplSrlFixtureEngine.mjs';
import { initializeIPLSRLMatch, performIPLSRLToss } from './iplSrlMatchEngine.mjs';
import { simulateIPLSRLDelivery } from './iplSrlSimulationEngine.mjs';
import { recordIPLSRLDelivery, getIPLSRLDeliveries } from './iplSrlBallEngine.mjs';
import { buildIPLSRLScorecard } from './iplSrlScorecardEngine.mjs';
import { generateIPLSRLCommentary } from './iplSrlCommentaryEngine.mjs';
import { calculateIPLSRLMatchProbabilities } from './probabilityEngine.mjs';
import { predictIPLSRLMatchAI } from './aiPredictionEngine.mjs';
import { generateIPLSRLMarkets, handleIPLSRLMarketSuspension } from './marketEngine.mjs';
import { settleIPLSRLMarket } from './settlementRules.mjs';
import { getIPLSRLStatistics, getIPLSRLRecords } from './statisticsEngine.mjs';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ TEST FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✓ ${message}`);
}

console.log('======================================================');
console.log('🧪 RUNNING IPLSRL ENTERPRISE VERIFICATION TEST SUITE');
console.log('======================================================');

// 1. Team & Player Engine Test
const teams = getAllIPLSRLTeams();
assert(teams.length >= 6, 'Teams engine returned 6+ franchise teams');

const csk = getIPLSRLTeamById('csk_srl');
assert(csk && csk.shortName === 'CSK', 'CSK Team retrieved successfully');

const players = getAllIPLSRLPlayers();
assert(players.length >= 30, 'Player engine loaded 30+ player rosters');

const virat = getIPLSRLPlayerById('p_rcb_1');
assert(virat && virat.battingRating === 95, 'Player Virat Kohli retrieved with rating 95');

// 2. Form Engine Test
const form = calculateIPLSRLPlayerForm('p_rcb_1');
assert(form.currentFormRating >= 50 && form.currentFormRating <= 99, 'Player form calculated within valid range');

// 3. Season & Fixture Engine Test
const season = getIPLSRLSeason('IPLSRL_2026');
assert(season && season.edition === 5, 'IPLSRL Season 2026 loaded successfully');

const fixtures = generateIPLSRLFixtures('IPLSRL_2026', teams);
assert(fixtures.length >= 10, 'Fixture engine generated league round-robin matches');

const standings = getIPLSRLStandings('IPLSRL_2026');
assert(standings.length >= 6, 'Standings engine calculated points table');

const playoffs = getIPLSRLPlayoffs('IPLSRL_2026');
assert(playoffs.length === 4, 'Playoff engine generated Q1, Eliminator, Q2, and Final');

// 4. Match & Simulation Engine Test
const match = initializeIPLSRLMatch(fixtures[0]);
assert(match.status === 'SCHEDULED', 'Match initialized with SCHEDULED state');

const tossMatch = performIPLSRLToss(match, 12345);
assert(tossMatch.status === 'TOSS' && tossMatch.toss.winnerId, 'Toss executed successfully');

// 5. Ball Simulation & Deterministic Seed Reproducibility Test
const del1 = simulateIPLSRLDelivery({ overNum: 1, ballNum: 1, seed: 999 });
const del2 = simulateIPLSRLDelivery({ overNum: 1, ballNum: 1, seed: 999 });
assert(del1.outcome === del2.outcome && del1.runs === del2.runs, 'Deterministic simulation seed reproduced exact delivery outcome');

const deliveryLog = recordIPLSRLDelivery({ matchId: match.matchId, over: 1, ball: 1, striker: 'V Kohli', bowler: 'J Bumrah', runs: del1.runs, outcome: del1.outcome });
assert(deliveryLog.matchId === match.matchId, 'Ball delivery recorded in ball-by-ball engine');

// 6. Scorecard & Commentary Engine Test
const scorecard = buildIPLSRLScorecard(match);
assert(scorecard && scorecard.matchId === match.matchId, 'Scorecard built successfully');

const commentary = generateIPLSRLCommentary({ over: 1, ball: 1, striker: 'V Kohli', bowler: 'J Bumrah', outcome: 'SIX' });
assert(commentary.text.includes('SIX'), 'Commentary engine generated event-driven text');

// 7. Probability, Odds, Prediction & Market Engine Test
const probs = calculateIPLSRLMatchProbabilities(match);
assert(probs.homeWinProbability > 0 && probs.awayWinProbability > 0, 'Probability engine calculated win probabilities');

const aiPred = predictIPLSRLMatchAI(match);
assert(aiPred.predictedWinner && aiPred.confidenceScore > 0, 'AI prediction engine generated match predictions');

const markets = generateIPLSRLMarkets(match);
assert(markets.length >= 4, 'Dynamic market engine generated IPLSRL markets');

const susp = handleIPLSRLMarketSuspension({ isWicket: true });
assert(susp.suspend === true && susp.reason === 'Wicket Event', 'Market suspension engine triggered on Wicket');

// 8. Settlement Engine Test
const settlement = settleIPLSRLMarket('winner', '1', { status: 'COMPLETED', winnerId: match.homeTeam.teamId, homeTeam: match.homeTeam, awayTeam: match.awayTeam });
assert(settlement.outcome === 'WIN', 'Settlement engine correctly settled winning bet');

// 9. Statistics & Records Test
const stats = getIPLSRLStatistics();
assert(stats.goldenBatLeaderboard.length >= 5, 'Golden Bat leaderboard generated');

const records = getIPLSRLRecords();
assert(records.highestTeamScore && records.fastestFifty, 'Competition records retrieved');

console.log('======================================================');
console.log('✅ ALL IPLSRL ENTERPRISE VERIFICATION TESTS PASSED 100%');
console.log('======================================================');
