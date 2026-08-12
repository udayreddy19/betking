/**
 * OddsEngineV3 — Extended Over Markets (Group 4)
 * 
 * Generates:
 * 1. Current Over Total Runs
 * 2. Next Over Total Runs
 * 3. Next Over Team Runs
 * 4. First Innings Overs 0–5 Total (Powerplay)
 * 5. First Innings Overs 0–15 Total
 * 6. First Innings Overs 0–20 Total
 * 7. Current Over Odd/Even
 * 8. Next Over Odd/Even
 */

import { priceSelection } from '../pricing/OddsCalculator.mjs';
import { createMarketDefinition } from '../models/MarketDefinition.mjs';

export function generateExtendedOverMarkets(state, validation = {}, marginConfig = {}) {
  const overround = marginConfig.liveTeamTotalOverround || 0.055;
  const battingTeam = state.battingTeamId === state.team1.id ? state.team1 : state.team2;
  const currentBalls = state.ballsCompleted || 0;
  const currentOverNum = Math.floor(currentBalls / 6) + 1;
  const nextOverNum = currentOverNum + 1;

  const markets = [];

  // 1. Next Over Total
  const nextOverLine = 7.5;
  markets.push(createMarketDefinition({
    marketId: `next_over_${nextOverNum}_total`,
    marketType: 'NEXT_OVER_TOTAL',
    category: 'overs',
    name: `Next Over (${nextOverNum}) - ${battingTeam.name} Total Runs`,
    status: 'OPEN',
    line: nextOverLine,
    selections: [
      priceSelection({ selectionId: 'sel_next_over_over', name: `Over ${nextOverLine}`, probability: 0.48, overround }),
      priceSelection({ selectionId: 'sel_next_over_under', name: `Under ${nextOverLine}`, probability: 0.52, overround }),
    ],
  }));

  const innLabel = state.currentInnings === 2 ? '2nd Innings' : '1st Innings';

  // 2. Overs 0 to 5 Total (Powerplay)
  const line05 = 38.5;
  markets.push(createMarketDefinition({
    marketId: 'overs_0_5_total',
    marketType: 'OVERS_0_5_TOTAL',
    category: 'overs',
    name: `${innLabel} Overs 0 to 5 - ${battingTeam.name} Total`,
    status: currentBalls <= 30 ? 'OPEN' : 'SUSPENDED',
    line: line05,
    selections: [
      priceSelection({ selectionId: 'sel_05_over', name: `Over ${line05}`, probability: 0.51, overround }),
      priceSelection({ selectionId: 'sel_05_under', name: `Under ${line05}`, probability: 0.49, overround }),
    ],
  }));

  // 3. Overs 0 to 15 Total
  let line015 = 112.5;
  if (state.currentInnings === 2 && state.target != null && line015 > state.target) {
    line015 = Math.max(state.target - 20.5, 95.5);
  }
  markets.push(createMarketDefinition({
    marketId: 'overs_0_15_total',
    marketType: 'OVERS_0_15_TOTAL',
    category: 'overs',
    name: `${innLabel} Overs 0 to 15 - ${battingTeam.name} Total`,
    status: currentBalls <= 90 ? 'OPEN' : 'SUSPENDED',
    line: line015,
    selections: [
      priceSelection({ selectionId: 'sel_015_over', name: `Over ${line015}`, probability: 0.50, overround }),
      priceSelection({ selectionId: 'sel_015_under', name: `Under ${line015}`, probability: 0.50, overround }),
    ],
  }));

  // 4. Overs 0 to 20 Total
  let line020 = 152.5;
  if (state.currentInnings === 2 && state.target != null && line020 > state.target) {
    line020 = Math.max(state.target - 5.5, (battingTeam.runs || 0) + 10.5);
  }
  markets.push(createMarketDefinition({
    marketId: 'overs_0_20_total',
    marketType: 'OVERS_0_20_TOTAL',
    category: 'overs',
    name: `${innLabel} Overs 0 to 20 - ${battingTeam.name} Total`,
    status: currentBalls <= 120 ? 'OPEN' : 'SUSPENDED',
    line: line020,
    selections: [
      priceSelection({ selectionId: 'sel_020_over', name: `Over ${line020}`, probability: 0.52, overround }),
      priceSelection({ selectionId: 'sel_020_under', name: `Under ${line020}`, probability: 0.48, overround }),
    ],
  }));

  // 5. Current Over Odd / Even
  markets.push(createMarketDefinition({
    marketId: `current_over_${currentOverNum}_odd_even`,
    marketType: 'CURRENT_OVER_ODD_EVEN',
    category: 'overs',
    name: `Current Over (${currentOverNum}) - Odd/Even Total Runs`,
    status: 'OPEN',
    selections: [
      priceSelection({ selectionId: 'sel_cov_odd', name: 'Odd', probability: 0.49, overround }),
      priceSelection({ selectionId: 'sel_cov_even', name: 'Even', probability: 0.51, overround }),
    ],
  }));

  // 6. Next Over Odd / Even
  markets.push(createMarketDefinition({
    marketId: `next_over_${nextOverNum}_odd_even`,
    marketType: 'NEXT_OVER_ODD_EVEN',
    category: 'overs',
    name: `Next Over (${nextOverNum}) - Odd/Even Total Runs`,
    status: 'OPEN',
    selections: [
      priceSelection({ selectionId: 'sel_nov_odd', name: 'Odd', probability: 0.49, overround }),
      priceSelection({ selectionId: 'sel_nov_even', name: 'Even', probability: 0.51, overround }),
    ],
  }));

  return markets;
}
