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

import { calculateScoringExpectation } from '../models/scoringModel.mjs';
import { calculateOverUnderProbability, calculateRangeProbability } from '../models/distributionModel.mjs';
import { priceSelection } from '../pricing/OddsCalculator.mjs';
import { createMarketDefinition } from '../models/MarketDefinition.mjs';

export function generateExtendedMatchTotals(state, validation = {}, marginConfig = {}) {
  const overround = marginConfig.liveMatchTotalOverround || 0.055;
  const currentTotal = (state.team1.runs || 0) + (state.team2.runs || 0);

  const calc = calculateScoringExpectation({
    currentScore: currentTotal,
    ballsRemaining: state.ballsRemaining,
    wicketsRemaining: 10 - (state.team1.wickets || 0),
    ballsCompleted: state.ballsCompleted,
    format: state.format,
    target: state.target,
  });

  let expectedMatchTotal = Math.max(currentTotal + 5, calc.expectedTotal);
  if (state.currentInnings === 2) {
    const firstInningsRuns = (state.bowlingTeamId === state.team1.id ? state.team1 : state.team2).runs || (state.team1.runs || 0);
    const maxMatchTotal = state.target != null ? (firstInningsRuns + state.target + 2) : (firstInningsRuns + (state.team2.runs || 0) + 30);
    expectedMatchTotal = Math.min(maxMatchTotal, expectedMatchTotal);
  }
  const mainLine = Math.floor(expectedMatchTotal) + 0.5;
  const altLine = Math.max(currentTotal + 0.5, mainLine - 10.0);

  const markets = [];

  // 1. Alternate Match Total
  const { pOver: pAltOver, pUnder: pAltUnder } = calculateOverUnderProbability(expectedMatchTotal, altLine);
  markets.push(createMarketDefinition({
    marketId: 'match_total_alt',
    marketType: 'TOTAL_MATCH_RUNS_ALT',
    category: 'totals',
    name: 'Total Match Runs (Alternate Line)',
    status: 'OPEN',
    line: altLine,
    selections: [
      priceSelection({ selectionId: 'sel_alt_over', name: `Over ${altLine}`, probability: pAltOver, overround }),
      priceSelection({ selectionId: 'sel_alt_under', name: `Under ${altLine}`, probability: pAltUnder, overround }),
    ],
  }));

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

  const pR1 = calculateRangeProbability(expectedMatchTotal, r1Min, r1Max);
  const pR2 = calculateRangeProbability(expectedMatchTotal, r2Min, r2Max);
  const pR3 = Math.max(0.10, 1.0 - (pR1 + pR2));

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
  const pBtts = Math.max(0.20, Math.min(0.85, (expectedMatchTotal - 250) / 100));
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
