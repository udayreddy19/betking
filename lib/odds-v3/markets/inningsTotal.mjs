/**
 * OddsEngineV3 — Extended Innings Totals (Group 3)
 * 
 * Generates:
 * 1. Team 1 / Team 2 Innings Alternate Total
 * 2. Team 1 / Team 2 Run Range
 * 3. Team 1 / Team 2 Total Fours
 * 4. Team 1 / Team 2 Total Sixes
 */

import { calculateScoringExpectation } from '../models/scoringModel.mjs';
import { calculateOverUnderProbability, calculateRangeProbability } from '../models/distributionModel.mjs';
import { priceSelection } from '../pricing/OddsCalculator.mjs';
import { createMarketDefinition } from '../models/MarketDefinition.mjs';
import {
  DEFAULT_MARGIN_CONFIG,
  MAX_LIVE_TOTAL_OVER_ODDS,
} from '../pricing/MarginCalculator.mjs';
import { applyLiveTotalOverOddsCap } from './TeamTotalMarket.mjs';

export function generateExtendedInningsTotals(state, validation = {}, marginConfig = {}) {
  const overround = marginConfig.liveTeamTotalOverround
    ?? DEFAULT_MARGIN_CONFIG.liveTeamTotalOverround
    ?? 0.10;
  const overExtra = marginConfig.liveTotalsOverExtraOverround
    ?? DEFAULT_MARGIN_CONFIG.liveTotalsOverExtraOverround
    ?? 0;
  const maxOverOdds = marginConfig.maxLiveTotalOverOdds ?? MAX_LIVE_TOTAL_OVER_ODDS;
  const battingTeam = state.battingTeamId === state.team1.id ? state.team1 : state.team2;
  const bowlingTeam = state.battingTeamId === state.team1.id ? state.team2 : state.team1;

  // Team innings O/U totals are first-innings only (same rule as Team Total Runs)
  const firstInningsOnly = (Number(state.currentInnings) || 1) < 2;

  const currentScore = battingTeam.runs || 0;
  const currentWkts = battingTeam.wickets || 0;

  const calc = calculateScoringExpectation({
    currentScore,
    ballsRemaining: state.ballsRemaining,
    wicketsRemaining: 10 - currentWkts,
    ballsCompleted: state.ballsCompleted,
    format: state.format,
    target: state.target,
  });

  let expectedTeamTotal = Math.max(currentScore + 2, calc.expectedTotal);
  if (state.currentInnings === 2 && state.target != null) {
    expectedTeamTotal = Math.min(state.target + 2, expectedTeamTotal);
  }
  const mainLine = Math.floor(expectedTeamTotal) + 0.5;
  let altLineHigh = mainLine + 10.0;
  if (state.currentInnings === 2 && state.target != null) {
    altLineHigh = Math.min(state.target + 2.5, altLineHigh);
  }
  const altLineLow = Math.max(currentScore + 3.5, mainLine - 10.0);

  const markets = [];

  // 1–2. Team innings O/U alternate lines — first innings only
  if (firstInningsOnly) {
    if (currentScore >= altLineHigh) {
      markets.push(createMarketDefinition({
        marketId: 'team_total_alt_high',
        marketType: 'TEAM_TOTAL_ALT_HIGH',
        category: 'totals',
        name: `${battingTeam.name} Innings Total Runs (High Line)`,
        status: 'SETTLED',
        line: altLineHigh,
        selections: [
          { selectionId: 'sel_team_high_over', name: `Over ${altLineHigh}`, status: 'WON', bettable: false, odds: null, won: true },
          { selectionId: 'sel_team_high_under', name: `Under ${altLineHigh}`, status: 'LOST', bettable: false, odds: null, won: false },
        ],
      }));
    } else {
      const { pOver: pHighOver, pUnder: pHighUnder } = calculateOverUnderProbability(expectedTeamTotal, altLineHigh, 1.5, currentScore);
      let overSel = priceSelection({
        selectionId: 'sel_team_high_over',
        name: `Over ${altLineHigh}`,
        probability: pHighOver,
        overround: overround + overExtra,
      });
      let underSel = priceSelection({
        selectionId: 'sel_team_high_under',
        name: `Under ${altLineHigh}`,
        probability: pHighUnder,
        overround,
      });
      if (state.status === 'LIVE') {
        const capped = applyLiveTotalOverOddsCap(overSel, underSel, overround + overExtra, maxOverOdds);
        overSel = capped.overSel;
        underSel = capped.underSel;
      }
      markets.push(createMarketDefinition({
        marketId: 'team_total_alt_high',
        marketType: 'TEAM_TOTAL_ALT_HIGH',
        category: 'totals',
        name: `${battingTeam.name} Innings Total Runs (High Line)`,
        status: 'OPEN',
        line: altLineHigh,
        selections: [overSel, underSel],
      }));
    }

    if (currentScore >= altLineLow) {
      markets.push(createMarketDefinition({
        marketId: 'team_total_alt_low',
        marketType: 'TEAM_TOTAL_ALT_LOW',
        category: 'totals',
        name: `${battingTeam.name} Innings Total Runs (Low Line)`,
        status: 'SETTLED',
        line: altLineLow,
        selections: [
          { selectionId: 'sel_team_low_over', name: `Over ${altLineLow}`, status: 'WON', bettable: false, odds: null, won: true },
          { selectionId: 'sel_team_low_under', name: `Under ${altLineLow}`, status: 'LOST', bettable: false, odds: null, won: false },
        ],
      }));
    } else {
      const { pOver: pLowOver, pUnder: pLowUnder } = calculateOverUnderProbability(expectedTeamTotal, altLineLow, 1.5, currentScore);
      let overSel = priceSelection({
        selectionId: 'sel_team_low_over',
        name: `Over ${altLineLow}`,
        probability: pLowOver,
        overround: overround + overExtra,
      });
      let underSel = priceSelection({
        selectionId: 'sel_team_low_under',
        name: `Under ${altLineLow}`,
        probability: pLowUnder,
        overround,
      });
      if (state.status === 'LIVE') {
        const capped = applyLiveTotalOverOddsCap(overSel, underSel, overround + overExtra, maxOverOdds);
        overSel = capped.overSel;
        underSel = capped.underSel;
      }
      markets.push(createMarketDefinition({
        marketId: 'team_total_alt_low',
        marketType: 'TEAM_TOTAL_ALT_LOW',
        category: 'totals',
        name: `${battingTeam.name} Innings Total Runs (Low Line)`,
        status: 'OPEN',
        line: altLineLow,
        selections: [overSel, underSel],
      }));
    }
  }

  // 3. Team Total Fours — first innings only (same liability class as team totals)
  if (firstInningsOnly) {
    const expFours = Math.max(2.5, Math.floor(expectedTeamTotal * 0.10));
    const fourLine = expFours + 0.5;
    const { pOver: pFourOver, pUnder: pFourUnder } = calculateOverUnderProbability(expFours, fourLine);
    markets.push(createMarketDefinition({
      marketId: 'team_total_fours',
      marketType: 'TEAM_TOTAL_FOURS',
      category: 'totals',
      name: `${battingTeam.name} Total Fours`,
      status: 'OPEN',
      line: fourLine,
      selections: [
        priceSelection({ selectionId: 'sel_t_four_over', name: `Over ${fourLine}`, probability: pFourOver, overround }),
        priceSelection({ selectionId: 'sel_t_four_under', name: `Under ${fourLine}`, probability: pFourUnder, overround }),
      ],
    }));

    // 4. Team Total Sixes
    const expSixes = Math.max(1.5, Math.floor(expectedTeamTotal * 0.05));
    const sixLine = expSixes + 0.5;
    const { pOver: pSixOver, pUnder: pSixUnder } = calculateOverUnderProbability(expSixes, sixLine);
    markets.push(createMarketDefinition({
      marketId: 'team_total_sixes',
      marketType: 'TEAM_TOTAL_SIXES',
      category: 'totals',
      name: `${battingTeam.name} Total Sixes`,
      status: 'OPEN',
      line: sixLine,
      selections: [
        priceSelection({ selectionId: 'sel_t_six_over', name: `Over ${sixLine}`, probability: pSixOver, overround }),
        priceSelection({ selectionId: 'sel_t_six_under', name: `Under ${sixLine}`, probability: pSixUnder, overround }),
      ],
    }));
  }

  return markets;
}
