/**
 * OddsEngineV3 — MatchTotalMarket
 * 
 * Generates Over/Under market for total match runs (both teams combined).
 */

import { calculateExpectedTotal } from '../pricing/ProbabilityModel.mjs';
import { expectedMatchRuns } from '../models/scoringModel.mjs';
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
export function generateMatchTotalMarket(state, validation = {}, marginConfig = DEFAULT_MARGIN_CONFIG) {
  const overround = marginConfig.liveMatchTotalOverround;

  if (validation.determined) {
    return createMarketDefinition({
      marketId: 'match_total',
      marketType: 'MATCH_TOTAL',
      name: 'Total Match Runs',
      status: 'SETTLED',
      selections: [],
    });
  }

  // First innings — full match projection. Chase innings — capped live total (never empty suspend).
  const rules = getFormatRules(state.format) || getFormatRules('THE_HUNDRED');

  const battingTeam = state.battingTeamId === state.team1.id ? state.team1 : state.team2;
  const fieldingTeam = state.bowlingTeamId === state.team1.id ? state.team1 : state.team2;
  const wicketsRemaining = Math.max(1, rules.maxWickets - (battingTeam.wickets || 0));

  let expectedMatchTotal = rules.ballsPerInnings * rules.historicalRunsPerBall * 2;
  let currentCombined = (state.team1.runs || 0) + (state.team2.runs || 0);

  if (state.status === 'LIVE') {
    const { expectedTotal: expectedBattingTotal } = calculateExpectedTotal({
      currentScore: battingTeam.runs || 0,
      ballsRemaining: state.ballsRemaining,
      wicketsRemaining,
      ballsCompleted: state.ballsCompleted,
      format: state.format,
      target: state.currentInnings === 2 ? state.target : null,
    });
    expectedMatchTotal = expectedMatchRuns({
      currentInnings: state.currentInnings,
      expectedBattingTotal,
      firstInningsRuns: fieldingTeam.runs || 0,
      rules,
      currentCombined,
    });
    if (state.currentInnings === 2 && state.target != null) {
      const maxPossibleMatchTotal = (fieldingTeam.runs || 0) + state.target + 2;
      expectedMatchTotal = Math.min(maxPossibleMatchTotal, expectedMatchTotal);
    }
  }

  const rawLine = generateLine(expectedMatchTotal);
  let effectiveLine = Math.max(rawLine, currentCombined + 0.5);

  if (state.currentInnings === 2 && state.target != null) {
    const maxLineAllowed = (fieldingTeam.runs || 0) + state.target + 2.5;
    effectiveLine = Math.min(effectiveLine, maxLineAllowed);
  }

  const { pOver, pUnder } = calculateLineProbability(expectedMatchTotal, effectiveLine);

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
    marketId: 'match_total',
    marketType: 'MATCH_TOTAL',
    name: 'Total Match Runs',
    status: 'OPEN',
    line: effectiveLine,
    selections: [overSelection, underSelection],
  });
}
