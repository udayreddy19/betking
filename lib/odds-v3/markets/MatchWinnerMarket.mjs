/**
 * OddsEngineV3 — MatchWinnerMarket
 * 
 * Generates the Match Winner market from a validated CanonicalMatchState.
 * Supports Pre-match (SCHEDULED/UPCOMING), Innings 1 (LIVE), and Innings 2 Chase (LIVE).
 */

import { calculateMatchWinnerProbability } from '../pricing/ProbabilityModel.mjs';
import { calculateWinProbability } from '../models/winProbabilityModel.mjs';
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
    const p1 = raw1 / sumP;
    const p2 = raw2 / sumP;

    const sel1 = priceSelection({
      selectionId: `sel_${state.team1.id}`,
      name: state.team1.name,
      probability: p1,
      overround,
    });
    const sel2 = priceSelection({
      selectionId: `sel_${state.team2.id}`,
      name: state.team2.name,
      probability: p2,
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

  // 3. INNINGS 1 (LIVE) MATCH — same model as Winner (incl. Super Over)
  if (state.status === 'LIVE' && state.currentInnings === 1) {
    const { pTeam1, pTeam2 } = calculateWinProbability(state);
    const sel1 = priceSelection({
      selectionId: `sel_${state.team1.id}`,
      name: state.team1.name,
      probability: pTeam1,
      overround,
    });
    const sel2 = priceSelection({
      selectionId: `sel_${state.team2.id}`,
      name: state.team2.name,
      probability: pTeam2,
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

  // 4. INNINGS 2 (LIVE CHASE) MATCH — never invent a target
  const battingTeam = state.battingTeamId === state.team1.id ? state.team1 : state.team2;
  const fieldingTeam = state.bowlingTeamId === state.team1.id ? state.team1 : state.team2;

  if (state.target == null || state.target <= 0 || state.runsRequired == null) {
    if (hasProviderOdds) {
      const raw1 = 1 / providerHome;
      const raw2 = 1 / providerAway;
      const sumP = raw1 + raw2;
      const sel1 = priceSelection({
        selectionId: `sel_${state.team1.id}`,
        name: state.team1.name,
        probability: raw1 / sumP,
        overround,
      });
      const sel2 = priceSelection({
        selectionId: `sel_${state.team2.id}`,
        name: state.team2.name,
        probability: raw2 / sumP,
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
