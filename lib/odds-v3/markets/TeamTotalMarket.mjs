/**
 * OddsEngineV3 — TeamTotalMarket
 * 
 * Generates Over/Under market for team total runs.
 */

import { calculateExpectedTotal } from '../pricing/ProbabilityModel.mjs';
import { generateLine, calculateLineProbability } from '../lines/TotalLineGenerator.mjs';
import { priceSelection } from '../pricing/OddsCalculator.mjs';
import { createMarketDefinition } from '../models/MarketDefinition.mjs';
import { DEFAULT_MARGIN_CONFIG } from '../pricing/MarginCalculator.mjs';
import { getFormatRules } from '../format/CricketFormatRules.mjs';
import { lineScopedSelectionId } from '../lineIdentity.mjs';

/**
 * @param {import('../models/CanonicalMatchState.mjs').CanonicalMatchState} state
 * @param {Object} [validation]
 * @param {Object} [marginConfig]
 * @returns {import('../models/MarketDefinition.mjs').MarketDefinition}
 */
export function generateTeamTotalMarket(state, validation = {}, marginConfig = DEFAULT_MARGIN_CONFIG) {
  const overround = marginConfig.liveTeamTotalOverround;

  if (validation.determined) {
    return createMarketDefinition({
      marketId: 'team_total',
      marketType: 'TEAM_TOTAL',
      name: 'Team Total Runs',
      status: 'SETTLED',
      selections: [],
    });
  }

  // First innings only — once the other side bats, this market type is removed
  if ((Number(state.currentInnings) || 1) >= 2) {
    return createMarketDefinition({
      marketId: 'team_total',
      marketType: 'TEAM_TOTAL',
      name: 'Team Total Runs',
      status: 'SUSPENDED',
      selections: [],
    });
  }

  const rules = getFormatRules(state.format) || getFormatRules('THE_HUNDRED');

  // Resolve batting team
  const battingTeam = state.battingTeamId === state.team1.id ? state.team1 : state.team2;
  const wicketsRemaining = Math.max(1, rules.maxWickets - (battingTeam.wickets || 0));

  let expectedTotal = rules.ballsPerInnings * rules.historicalRunsPerBall;

  if (state.status === 'LIVE') {
    const calc = calculateExpectedTotal({
      currentScore: battingTeam.runs || 0,
      ballsRemaining: state.ballsRemaining,
      wicketsRemaining,
      ballsCompleted: state.ballsCompleted,
      format: state.format,
      target: state.currentInnings === 2 ? state.target : null,
    });
    expectedTotal = calc.expectedTotal;
  }

  const rawLine = generateLine(expectedTotal);
  let effectiveLine = Math.max(rawLine, (battingTeam.runs || 0) + 0.5);

  if (state.currentInnings === 2 && state.target != null) {
    const maxTeamLine = state.target + 2.5;
    effectiveLine = Math.min(effectiveLine, maxTeamLine);
  }

  const { pOver, pUnder } = calculateLineProbability(expectedTotal, effectiveLine);

  // Line-scoped selection ids so cashout/placement cannot match a bumped line
  const overSelection = priceSelection({
    selectionId: lineScopedSelectionId('over', effectiveLine),
    name: `Over ${effectiveLine}`,
    probability: pOver,
    overround,
  });

  const underSelection = priceSelection({
    selectionId: lineScopedSelectionId('under', effectiveLine),
    name: `Under ${effectiveLine}`,
    probability: pUnder,
    overround,
  });

  return createMarketDefinition({
    marketId: 'team_total',
    marketType: 'TEAM_TOTAL',
    name: `${battingTeam.name} Total Runs`,
    status: 'OPEN',
    line: effectiveLine,
    selections: [overSelection, underSelection],
  });
}
