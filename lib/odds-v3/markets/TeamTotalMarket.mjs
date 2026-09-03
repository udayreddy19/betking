/**
 * OddsEngineV3 — TeamTotalMarket
 *
 * Generates Over/Under market for team total runs.
 */

import { calculateExpectedTotal } from '../pricing/ProbabilityModel.mjs';
import {
  generateLine,
  calculateLineProbability,
  resolveTotalLineSpread,
  minLiveTotalLineLead,
} from '../lines/TotalLineGenerator.mjs';
import { priceSelection } from '../pricing/OddsCalculator.mjs';
import { createMarketDefinition } from '../models/MarketDefinition.mjs';
import {
  DEFAULT_MARGIN_CONFIG,
  MAX_LIVE_TOTAL_OVER_ODDS,
  MIN_DECIMAL_ODDS,
} from '../pricing/MarginCalculator.mjs';
import { formatRulesOrDefault } from '../format/CricketFormatRules.mjs';
import { lineScopedSelectionId } from '../lineIdentity.mjs';

/**
 * Cap soft live Over odds and shift residual overround onto Under.
 * @param {import('../models/SelectionPrice.mjs').SelectionPrice} overSel
 * @param {import('../models/SelectionPrice.mjs').SelectionPrice} underSel
 * @param {number} overround
 * @param {number} [maxOverOdds]
 */
export function applyLiveTotalOverOddsCap(
  overSel,
  underSel,
  overround = 0.08,
  maxOverOdds = MAX_LIVE_TOTAL_OVER_ODDS,
) {
  if (!overSel || !underSel) return { overSel, underSel };
  const maxOver = Number(maxOverOdds) > 1 ? Number(maxOverOdds) : MAX_LIVE_TOTAL_OVER_ODDS;
  if (!(overSel.odds > maxOver)) return { overSel, underSel };

  const overFinalP = 1 / maxOver;
  const bookMass = 1 + Math.max(0, Number(overround) || 0);
  const underFinalP = Math.max(1 / 100, Math.min(1 / MIN_DECIMAL_ODDS, bookMass - overFinalP));

  return {
    overSel: {
      ...overSel,
      odds: Number(maxOver.toFixed(4)),
      finalProbability: Number(overFinalP.toFixed(8)),
      margin: Number(overround) || overSel.margin,
    },
    underSel: {
      ...underSel,
      odds: Number(Math.max(MIN_DECIMAL_ODDS, 1 / underFinalP).toFixed(4)),
      finalProbability: Number(underFinalP.toFixed(8)),
      margin: Number(overround) || underSel.margin,
    },
  };
}

/**
 * @param {import('../models/CanonicalMatchState.mjs').CanonicalMatchState} state
 * @param {Object} [validation]
 * @param {Object} [marginConfig]
 * @returns {import('../models/MarketDefinition.mjs').MarketDefinition}
 */
export function generateTeamTotalMarket(state, validation = {}, marginConfig = DEFAULT_MARGIN_CONFIG) {
  const overround = marginConfig.liveTeamTotalOverround ?? DEFAULT_MARGIN_CONFIG.liveTeamTotalOverround;
  const overExtra = marginConfig.liveTotalsOverExtraOverround
    ?? DEFAULT_MARGIN_CONFIG.liveTotalsOverExtraOverround
    ?? 0;
  const maxOverOdds = marginConfig.maxLiveTotalOverOdds ?? MAX_LIVE_TOTAL_OVER_ODDS;

  if (validation.determined) {
    return createMarketDefinition({
      marketId: 'team_total',
      marketType: 'TEAM_TOTAL',
      name: 'Team Total Runs',
      status: 'SETTLED',
      selections: [],
    });
  }

  // Chase innings — batting team total capped by target (same as match total semantics).
  const rules = formatRulesOrDefault(state.format);

  // Resolve batting team
  const battingTeam = state.battingTeamId === state.team1.id ? state.team1 : state.team2;
  const wicketsRemaining = Math.max(1, rules.maxWickets - (battingTeam.wickets || 0));
  const currentScore = battingTeam.runs || 0;
  const ballsRemaining = Number(state.ballsRemaining) || 0;

  let expectedTotal = rules.ballsPerInnings * rules.historicalRunsPerBall;

  if (state.status === 'LIVE') {
    const calc = calculateExpectedTotal({
      currentScore,
      ballsRemaining,
      wicketsRemaining,
      ballsCompleted: state.ballsCompleted,
      format: state.format,
      target: state.currentInnings === 2 ? state.target : null,
    });
    expectedTotal = calc.expectedTotal;
  }

  const rawLine = generateLine(expectedTotal);
  const lead = state.status === 'LIVE'
    ? minLiveTotalLineLead(ballsRemaining, rules.historicalRunsPerBall)
    : 0.5;
  let effectiveLine = Math.max(rawLine, currentScore + lead);

  if (state.currentInnings === 2 && state.target != null) {
    const maxTeamLine = state.target + 2.5;
    effectiveLine = Math.min(effectiveLine, maxTeamLine);
  }

  // Don't keep selling once current score already clears the line (any innings)
  if (state.status === 'LIVE' && currentScore >= effectiveLine) {
    return createMarketDefinition({
      marketId: 'team_total',
      marketType: 'TEAM_TOTAL',
      name: `${battingTeam.name} Total Runs`,
      status: 'SETTLED',
      line: effectiveLine,
      selections: [],
    });
  }

  const spread = state.status === 'LIVE'
    ? resolveTotalLineSpread(ballsRemaining, rules.ballsPerInnings)
    : 8;
  const { pOver, pUnder } = calculateLineProbability(expectedTotal, effectiveLine, spread);

  let overSelection = priceSelection({
    selectionId: lineScopedSelectionId('over', effectiveLine),
    name: `Over ${effectiveLine}`,
    probability: pOver,
    overround: overround + overExtra,
  });

  let underSelection = priceSelection({
    selectionId: lineScopedSelectionId('under', effectiveLine),
    name: `Under ${effectiveLine}`,
    probability: pUnder,
    overround,
  });

  if (state.status === 'LIVE') {
    const capped = applyLiveTotalOverOddsCap(
      overSelection,
      underSelection,
      overround + overExtra,
      maxOverOdds,
    );
    overSelection = capped.overSel;
    underSelection = capped.underSel;
  }

  return createMarketDefinition({
    marketId: 'team_total',
    marketType: 'TEAM_TOTAL',
    name: `${battingTeam.name} Total Runs`,
    status: 'OPEN',
    line: effectiveLine,
    selections: [overSelection, underSelection],
  });
}
