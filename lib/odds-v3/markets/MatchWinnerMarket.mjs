/**
 * OddsEngineV3 — MatchWinnerMarket
 * 
 * Generates the Match Winner market from a validated CanonicalMatchState.
 * Supports Pre-match (SCHEDULED/UPCOMING), Innings 1 (LIVE), and Innings 2 Chase (LIVE).
 */

import { calculateMatchWinnerProbability, calculateExpectedTotal } from '../pricing/ProbabilityModel.mjs';
import { priceSelection } from '../pricing/OddsCalculator.mjs';
import { createMarketDefinition } from '../models/MarketDefinition.mjs';
import { DEFAULT_MARGIN_CONFIG } from '../pricing/MarginCalculator.mjs';
import { getFormatRules } from '../format/CricketFormatRules.mjs';

/**
 * @param {import('../models/CanonicalMatchState.mjs').CanonicalMatchState} state
 * @param {Object} [validation] - Result from MatchStateValidator
 * @param {Object} [marginConfig]
 * @returns {import('../models/MarketDefinition.mjs').MarketDefinition}
 */
export function generateMatchWinnerMarket(state, validation = {}, marginConfig = DEFAULT_MARGIN_CONFIG) {
  const overround = marginConfig.liveMatchWinnerOverround;

  // 1. DETERMINED / SETTLED MATCH
  if (validation.determined) {
    const winnerTeam = state.team1.id === validation.winnerId ? state.team1 : state.team2;
    const loserTeam = state.team1.id === validation.winnerId ? state.team2 : state.team1;

    return createMarketDefinition({
      marketId: 'match_winner',
      marketType: 'MATCH_WINNER',
      name: 'Match Winner',
      status: 'SETTLED',
      selections: [
        { selectionId: `sel_${winnerTeam.id}`, name: winnerTeam.name, probability: 1, fairOdds: 1, margin: 0, finalProbability: 1, odds: 1, won: true },
        { selectionId: `sel_${loserTeam.id}`, name: loserTeam.name, probability: 0, fairOdds: Infinity, margin: 0, finalProbability: 0, odds: Infinity, won: false },
      ],
    });
  }

  const rules = getFormatRules(state.format) || getFormatRules('THE_HUNDRED');

  // 2. PRE-MATCH / SCHEDULED / UPCOMING MATCH
  if (state.status === 'SCHEDULED' || state.status === 'UPCOMING') {
    const sel1 = priceSelection({
      selectionId: `sel_${state.team1.id}`,
      name: state.team1.name,
      probability: 0.50,
      overround,
    });
    const sel2 = priceSelection({
      selectionId: `sel_${state.team2.id}`,
      name: state.team2.name,
      probability: 0.50,
      overround,
    });

    return createMarketDefinition({
      marketId: 'match_winner',
      marketType: 'MATCH_WINNER',
      name: 'Match Winner',
      status: 'OPEN',
      selections: [sel1, sel2],
    });
  }

  // 3. INNINGS 1 (LIVE) MATCH
  if (state.status === 'LIVE' && state.currentInnings === 1) {
    const battingTeam = state.battingTeamId === state.team1.id ? state.team1 : state.team2;
    const fieldingTeam = state.bowlingTeamId === state.team1.id ? state.team1 : state.team2;
    const wicketsRemaining = Math.max(1, rules.maxWickets - battingTeam.wickets);

    const { expectedTotal } = calculateExpectedTotal({
      currentScore: battingTeam.runs,
      ballsRemaining: state.ballsRemaining,
      wicketsRemaining,
      ballsCompleted: state.ballsCompleted,
      format: state.format,
    });

    const avgTarget = rules.ballsPerInnings * rules.historicalRunsPerBall;
    const pBat = Math.max(0.10, Math.min(0.90, 0.50 + (expectedTotal - avgTarget) / (avgTarget * 0.8)));
    const pField = 1 - pBat;

    const batSel = priceSelection({
      selectionId: `sel_${battingTeam.id}`,
      name: battingTeam.name,
      probability: pBat,
      overround,
    });
    const fieldSel = priceSelection({
      selectionId: `sel_${fieldingTeam.id}`,
      name: fieldingTeam.name,
      probability: pField,
      overround,
    });

    const selections = state.team1.id === battingTeam.id ? [batSel, fieldSel] : [fieldSel, batSel];

    return createMarketDefinition({
      marketId: 'match_winner',
      marketType: 'MATCH_WINNER',
      name: 'Match Winner',
      status: 'OPEN',
      selections,
    });
  }

  // 4. INNINGS 2 (LIVE CHASE) MATCH
  const battingTeam = state.battingTeamId === state.team1.id ? state.team1 : state.team2;
  const fieldingTeam = state.bowlingTeamId === state.team1.id ? state.team1 : state.team2;
  const wicketsRemaining = Math.max(1, rules.maxWickets - battingTeam.wickets);

  const { pChase, pField } = calculateMatchWinnerProbability({
    runsRequired: state.runsRequired ?? Math.max(1, (state.target || 143) - battingTeam.runs),
    ballsRemaining: state.ballsRemaining,
    wicketsRemaining,
    ballsCompleted: state.ballsCompleted,
    ballsPerInnings: state.ballsPerInnings,
    target: state.target || 143,
    chasingScore: battingTeam.runs,
    format: state.format,
    chasingTeamId: state.battingTeamId,
    fieldingTeamId: state.bowlingTeamId,
  });

  const chaserSelection = priceSelection({
    selectionId: `sel_${battingTeam.id}`,
    name: battingTeam.name,
    probability: pChase,
    overround,
  });

  const fielderSelection = priceSelection({
    selectionId: `sel_${fieldingTeam.id}`,
    name: fieldingTeam.name,
    probability: pField,
    overround,
  });

  const selections = state.team1.id === battingTeam.id ? [chaserSelection, fielderSelection] : [fielderSelection, chaserSelection];

  return createMarketDefinition({
    marketId: 'match_winner',
    marketType: 'MATCH_WINNER',
    name: 'Match Winner',
    status: 'OPEN',
    selections,
  });
}
