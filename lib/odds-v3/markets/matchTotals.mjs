/**
 * OddsEngineV3 — Extended Match Totals (Group 2)
 * 
 * Generates:
 * 1. Total Match Runs Alternate Line
 * 2. Total Match Sixes
 * 3. Total Match Fours
 * 4. Total Match Wickets
 * 5. Match Run Range (e.g. 250-299, 300-349, 350+)
 * 6. Both Teams To Score 150+ / 175+ / 200+
 */

import { calculateScoringExpectation, expectedMatchRuns } from '../models/scoringModel.mjs';
import { calculateOverUnderProbability, calculateRangeProbability } from '../models/distributionModel.mjs';
import { priceSelection } from '../pricing/OddsCalculator.mjs';
import { createMarketDefinition } from '../models/MarketDefinition.mjs';
import { getFormatRules } from '../format/CricketFormatRules.mjs';
import {
  DEFAULT_MARGIN_CONFIG,
  MAX_LIVE_TOTAL_OVER_ODDS,
} from '../pricing/MarginCalculator.mjs';
import { applyLiveTotalOverOddsCap } from './TeamTotalMarket.mjs';

export function generateExtendedMatchTotals(state, validation = {}, marginConfig = {}) {
  const overround = marginConfig.liveMatchTotalOverround
    ?? DEFAULT_MARGIN_CONFIG.liveMatchTotalOverround
    ?? 0.10;
  const overExtra = marginConfig.liveTotalsOverExtraOverround
    ?? DEFAULT_MARGIN_CONFIG.liveTotalsOverExtraOverround
    ?? 0;
  const maxOverOdds = marginConfig.maxLiveTotalOverOdds ?? MAX_LIVE_TOTAL_OVER_ODDS;
  const rules = getFormatRules(state.format) || getFormatRules('T20');
  const currentTotal = (state.team1.runs || 0) + (state.team2.runs || 0);
  const firstInningsOnly = (Number(state.currentInnings) || 1) < 2;

  const battingTeam = state.battingTeamId === state.team1.id ? state.team1 : state.team2;
  const fieldingTeam = state.bowlingTeamId === state.team1.id ? state.team1 : state.team2;

  const calc = calculateScoringExpectation({
    currentScore: battingTeam.runs || 0,
    ballsRemaining: state.ballsRemaining,
    wicketsRemaining: Math.max(1, rules.maxWickets - (battingTeam.wickets || 0)),
    ballsCompleted: state.ballsCompleted,
    format: state.format,
    target: state.target,
  });

  let expectedMatchTotal = expectedMatchRuns({
    currentInnings: state.currentInnings,
    expectedBattingTotal: calc.expectedTotal,
    firstInningsRuns: fieldingTeam.runs || 0,
    rules,
    currentCombined: currentTotal,
  });

  const mainLine = Math.floor(expectedMatchTotal) + 0.5;
  let altLine = Math.max(currentTotal + 5.5, mainLine - 20.0);
  if (state.currentInnings === 2 && state.target != null) {
    const maxLineAllowed = (fieldingTeam.runs || 0) + state.target + 2.5;
    altLine = Math.min(altLine, maxLineAllowed);
  }

  const isAltDetermined = currentTotal >= altLine;
  const markets = [];

  // 1. Alternate Match Total — first innings only (same as Total Match Runs)
  if (firstInningsOnly) {
  if (isAltDetermined) {
    markets.push(createMarketDefinition({
      marketId: 'match_total_alt',
      marketType: 'TOTAL_MATCH_RUNS_ALT',
      category: 'totals',
      name: 'Total Match Runs (Alternate Line)',
      status: 'SETTLED',
      line: altLine,
      selections: [
        { selectionId: 'sel_alt_over', name: `Over ${altLine}`, status: 'WON', bettable: false, odds: null, won: true },
        { selectionId: 'sel_alt_under', name: `Under ${altLine}`, status: 'LOST', bettable: false, odds: null, won: false },
      ],
    }));
  } else {
    const { pOver: pAltOver, pUnder: pAltUnder } = calculateOverUnderProbability(expectedMatchTotal, altLine, 1.5, currentTotal);
    let overSel = priceSelection({
      selectionId: 'sel_alt_over',
      name: `Over ${altLine}`,
      probability: pAltOver,
      overround: overround + overExtra,
    });
    let underSel = priceSelection({
      selectionId: 'sel_alt_under',
      name: `Under ${altLine}`,
      probability: pAltUnder,
      overround,
    });
    if (state.status === 'LIVE') {
      const capped = applyLiveTotalOverOddsCap(overSel, underSel, overround + overExtra, maxOverOdds);
      overSel = capped.overSel;
      underSel = capped.underSel;
    }
    markets.push(createMarketDefinition({
      marketId: 'match_total_alt',
      marketType: 'TOTAL_MATCH_RUNS_ALT',
      category: 'totals',
      name: 'Total Match Runs (Alternate Line)',
      status: 'OPEN',
      line: altLine,
      selections: [overSel, underSel],
    }));
  }
  }

  // 2. Total Match Sixes
  const expectedSixes = Math.max(2.5, Math.floor(expectedMatchTotal * 0.055));
  const sixLine = expectedSixes + 0.5;
  const { pOver: pSixOver, pUnder: pSixUnder } = calculateOverUnderProbability(expectedSixes, sixLine);
  markets.push(createMarketDefinition({
    marketId: 'total_match_sixes',
    marketType: 'TOTAL_MATCH_SIXES',
    category: 'totals',
    name: 'Total Match Sixes',
    status: 'OPEN',
    line: sixLine,
    selections: [
      priceSelection({ selectionId: 'sel_six_over', name: `Over ${sixLine}`, probability: pSixOver, overround }),
      priceSelection({ selectionId: 'sel_six_under', name: `Under ${sixLine}`, probability: pSixUnder, overround }),
    ],
  }));

  // 3. Total Match Fours
  const expectedFours = Math.max(5.5, Math.floor(expectedMatchTotal * 0.11));
  const fourLine = expectedFours + 0.5;
  const { pOver: pFourOver, pUnder: pFourUnder } = calculateOverUnderProbability(expectedFours, fourLine);
  markets.push(createMarketDefinition({
    marketId: 'total_match_fours',
    marketType: 'TOTAL_MATCH_FOURS',
    category: 'totals',
    name: 'Total Match Fours',
    status: 'OPEN',
    line: fourLine,
    selections: [
      priceSelection({ selectionId: 'sel_four_over', name: `Over ${fourLine}`, probability: pFourOver, overround }),
      priceSelection({ selectionId: 'sel_four_under', name: `Under ${fourLine}`, probability: pFourUnder, overround }),
    ],
  }));

  // 4. Total Match Wickets
  const wktLine = 12.5;
  const { pOver: pWktOver, pUnder: pWktUnder } = calculateOverUnderProbability(11.5, wktLine);
  markets.push(createMarketDefinition({
    marketId: 'total_match_wickets',
    marketType: 'TOTAL_MATCH_WICKETS',
    category: 'totals',
    name: 'Total Match Wickets',
    status: 'OPEN',
    line: wktLine,
    selections: [
      priceSelection({ selectionId: 'sel_wkt_over', name: `Over ${wktLine}`, probability: pWktOver, overround }),
      priceSelection({ selectionId: 'sel_wkt_under', name: `Under ${wktLine}`, probability: pWktUnder, overround }),
    ],
  }));

  // 5. Match Run Range
  const baseRange = Math.floor(expectedMatchTotal / 50) * 50;
  const r1Min = Math.max(0, baseRange - 50);
  const r1Max = baseRange - 1;
  const r2Min = baseRange;
  const r2Max = baseRange + 49;
  const r3Min = baseRange + 50;

  const pR1Raw = r1Max < currentTotal ? 0 : calculateRangeProbability(expectedMatchTotal, r1Min, r1Max, currentTotal);
  const pR2Raw = r2Max < currentTotal ? 0 : calculateRangeProbability(expectedMatchTotal, r2Min, r2Max, currentTotal);
  const pR3Raw = calculateRangeProbability(expectedMatchTotal, r3Min, r3Min + 400, currentTotal);
  const rangeRaw = [pR1Raw, pR2Raw, pR3Raw].map((p) => Math.max(0, p));
  const rangeSum = rangeRaw.reduce((a, b) => a + b, 0);
  const rangeNorm = (rangeSum > 0 ? rangeRaw.map((p) => p / rangeSum) : [0.33, 0.34, 0.33])
    .map((p) => Math.max(0.0001, Math.min(0.9999, p)));
  const rangeNormSum = rangeNorm.reduce((a, b) => a + b, 0);
  const [pR1, pR2, pR3] = rangeNorm.map((p) => p / rangeNormSum);

  markets.push(createMarketDefinition({
    marketId: 'match_run_range',
    marketType: 'MATCH_RUN_RANGE',
    category: 'totals',
    name: 'Match Run Range',
    status: 'OPEN',
    selections: [
      priceSelection({ selectionId: 'sel_rr_1', name: `${r1Min}–${r1Max} runs`, probability: pR1, overround }),
      priceSelection({ selectionId: 'sel_rr_2', name: `${r2Min}–${r2Max} runs`, probability: pR2, overround }),
      priceSelection({ selectionId: 'sel_rr_3', name: `${r3Min}+ runs`, probability: pR3, overround }),
    ],
  }));

  // 6. Both Teams To Score 150+
  const bttsLine = state.format === 'THE_HUNDRED' ? 125 : 150;
  const battingExpected = calc.expectedTotal;
  const chasingExpected = state.currentInnings === 2
    ? battingExpected
    : expectedMatchTotal - battingExpected;
  const pBatReach = (battingTeam.runs || 0) >= bttsLine
    ? 0.99
    : calculateOverUnderProbability(battingExpected, bttsLine - 0.5, 2.0, battingTeam.runs || 0).pOver;
  const otherCurrent = fieldingTeam.runs || 0;
  const pOtherReach = otherCurrent >= bttsLine
    ? 0.99
    : calculateOverUnderProbability(
      state.currentInnings === 2 ? otherCurrent : chasingExpected,
      bttsLine - 0.5,
      2.0,
      otherCurrent,
    ).pOver;
  const pBtts = Math.max(0.0001, Math.min(0.9999, pBatReach * pOtherReach));
  markets.push(createMarketDefinition({
    marketId: 'btts_score_x',
    marketType: 'BOTH_TEAMS_TO_SCORE_X',
    category: 'totals',
    name: `Both Teams To Score ${bttsLine}+ Runs`,
    status: 'OPEN',
    selections: [
      priceSelection({ selectionId: 'sel_btts_yes', name: 'Yes', probability: pBtts, overround }),
      priceSelection({ selectionId: 'sel_btts_no', name: 'No', probability: 1.0 - pBtts, overround }),
    ],
  }));

  return markets;
}
