/**
 * OddsEngineV3 — MatchWinnerMarket
 * 
 * Generates the Match Winner market from a validated CanonicalMatchState.
 * Supports Pre-match (SCHEDULED/UPCOMING), Innings 1 (LIVE), and Innings 2 Chase (LIVE).
 */

import { calculateMatchWinnerProbability } from '../pricing/ProbabilityModel.mjs';
import { calculateWinProbability } from '../models/winProbabilityModel.mjs';
import { priceExclusiveSelections } from '../pricing/OddsCalculator.mjs';
import { createMarketDefinition } from '../models/MarketDefinition.mjs';
import { DEFAULT_MARGIN_CONFIG } from '../pricing/MarginCalculator.mjs';
import { formatRulesOrDefault } from '../format/CricketFormatRules.mjs';

function priceTwoWay({ team1, team2, p1, p2, overround }) {
  const priced = priceExclusiveSelections([
    { selectionId: `sel_${team1.id}`, name: team1.name, probability: p1 },
    { selectionId: `sel_${team2.id}`, name: team2.name, probability: p2 },
  ], overround);
  if (priced.suspended) {
    return { suspended: true, selections: [] };
  }
  return { suspended: false, selections: priced.selections };
}

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
    const settledSel = (team, status) => ({
      selectionId: `sel_${team.id}`,
      name: team.name,
      status,
      bettable: false,
      probability: null,
      fairOdds: null,
      margin: null,
      finalProbability: null,
      odds: null,
      won: status === 'WON',
    });

    // Tie / scores level — both sides push (no winner)
    if (validation.tied || !validation.winnerId) {
      return createMarketDefinition({
        marketId: 'match_winner',
        marketType: 'MATCH_WINNER',
        name: 'Match Winner',
        status: 'SETTLED',
        selections: [
          settledSel(state.team1, 'PUSH'),
          settledSel(state.team2, 'PUSH'),
        ],
      });
    }

    const winnerTeam = state.team1.id === validation.winnerId ? state.team1 : state.team2;
    const loserTeam = state.team1.id === validation.winnerId ? state.team2 : state.team1;

    return createMarketDefinition({
      marketId: 'match_winner',
      marketType: 'MATCH_WINNER',
      name: 'Match Winner',
      status: 'SETTLED',
      selections: [
        settledSel(winnerTeam, 'WON'),
        settledSel(loserTeam, 'LOST'),
      ],
    });
  }

  const rules = formatRulesOrDefault(state.format);

  // Provider odds (10Cric etc.) — preferred when present for any status.
  const providerOdds = state.odds || state.liveDetails?.odds || null;
  const providerHome = Number(providerOdds?.home ?? providerOdds?.team1);
  const providerAway = Number(providerOdds?.away ?? providerOdds?.team2);
  const hasProviderOdds = providerHome > 1 && providerAway > 1;

  // 2. PRE-MATCH / SCHEDULED / UPCOMING MATCH
  if (state.status === 'SCHEDULED' || state.status === 'UPCOMING') {
    if (!hasProviderOdds) {
      return createMarketDefinition({
        marketId: 'match_winner',
        marketType: 'MATCH_WINNER',
        name: 'Match Winner',
        status: 'SUSPENDED',
        selections: [],
      });
    }

    const raw1 = 1 / providerHome;
    const raw2 = 1 / providerAway;
    const sumP = raw1 + raw2;
    const priced = priceTwoWay({
      team1: state.team1,
      team2: state.team2,
      p1: raw1 / sumP,
      p2: raw2 / sumP,
      overround,
    });
    if (priced.suspended) {
      return createMarketDefinition({
        marketId: 'match_winner',
        marketType: 'MATCH_WINNER',
        name: 'Match Winner',
        status: 'SUSPENDED',
        selections: [],
      });
    }

    return createMarketDefinition({
      marketId: 'match_winner',
      marketType: 'MATCH_WINNER',
      name: 'Match Winner',
      status: 'OPEN',
      selections: priced.selections,
    });
  }

  // 3. INNINGS 1 (LIVE) MATCH — same model as Winner (incl. Super Over)
  if (state.status === 'LIVE' && state.currentInnings === 1) {
    const { pTeam1, pTeam2 } = calculateWinProbability(state);
    const priced = priceTwoWay({
      team1: state.team1,
      team2: state.team2,
      p1: pTeam1,
      p2: pTeam2,
      overround,
    });
    if (priced.suspended) {
      return createMarketDefinition({
        marketId: 'match_winner',
        marketType: 'MATCH_WINNER',
        name: 'Match Winner',
        status: 'SUSPENDED',
        selections: [],
      });
    }

    return createMarketDefinition({
      marketId: 'match_winner',
      marketType: 'MATCH_WINNER',
      name: 'Match Winner',
      status: 'OPEN',
      selections: priced.selections,
    });
  }

  // 4. INNINGS 2 (LIVE CHASE) MATCH — never invent a target
  const battingTeam = state.battingTeamId === state.team1.id ? state.team1 : state.team2;
  const fieldingTeam = state.bowlingTeamId === state.team1.id ? state.team1 : state.team2;

  if (state.target == null || state.target <= 0 || state.runsRequired == null) {
    if (hasProviderOdds) {
      const raw1 = 1 / providerHome;
      const raw2 = 1 / providerAway;
      const sumP = raw1 + raw2;
      const priced = priceTwoWay({
        team1: state.team1,
        team2: state.team2,
        p1: raw1 / sumP,
        p2: raw2 / sumP,
        overround,
      });
      if (priced.suspended) {
        return createMarketDefinition({
          marketId: 'match_winner',
          marketType: 'MATCH_WINNER',
          name: 'Match Winner',
          status: 'SUSPENDED',
          selections: [],
        });
      }
      return createMarketDefinition({
        marketId: 'match_winner',
        marketType: 'MATCH_WINNER',
        name: 'Match Winner',
        status: 'OPEN',
        selections: priced.selections,
      });
    }
    // Tests have no limited-overs target until the 4th innings — still price a winner.
    if (state.status === 'LIVE' && state.format === 'TEST') {
      const { pTeam1, pTeam2 } = calculateWinProbability(state);
      const priced = priceTwoWay({
        team1: state.team1,
        team2: state.team2,
        p1: pTeam1,
        p2: pTeam2,
        overround,
      });
      if (!priced.suspended) {
        return createMarketDefinition({
          marketId: 'match_winner',
          marketType: 'MATCH_WINNER',
          name: 'Match Winner',
          status: 'OPEN',
          selections: priced.selections,
        });
      }
    }
    return createMarketDefinition({
      marketId: 'match_winner',
      marketType: 'MATCH_WINNER',
      name: 'Match Winner',
      status: 'SUSPENDED',
      selections: [],
    });
  }

  const wicketsRemaining = Math.max(1, rules.maxWickets - battingTeam.wickets);

  const { pChase, pField } = calculateMatchWinnerProbability({
    runsRequired: Math.max(0, state.runsRequired),
    ballsRemaining: state.ballsRemaining,
    wicketsRemaining,
    ballsCompleted: state.ballsCompleted,
    ballsPerInnings: state.ballsPerInnings,
    target: state.target,
    chasingScore: battingTeam.runs,
    format: state.format,
    chasingTeamId: state.battingTeamId,
    fieldingTeamId: state.bowlingTeamId,
  });

  const chasePriced = priceTwoWay({
    team1: battingTeam,
    team2: fieldingTeam,
    p1: pChase,
    p2: pField,
    overround,
  });
  if (chasePriced.suspended) {
    return createMarketDefinition({
      marketId: 'match_winner',
      marketType: 'MATCH_WINNER',
      name: 'Match Winner',
      status: 'SUSPENDED',
      selections: [],
    });
  }

  const selections = state.team1.id === battingTeam.id
    ? chasePriced.selections
    : [chasePriced.selections[1], chasePriced.selections[0]];

  return createMarketDefinition({
    marketId: 'match_winner',
    marketType: 'MATCH_WINNER',
    name: 'Match Winner',
    status: 'OPEN',
    selections,
  });
}
