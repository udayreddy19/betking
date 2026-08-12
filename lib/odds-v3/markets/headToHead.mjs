/**
 * OddsEngineV3 — Extended Head-To-Head Markets (Group 8)
 * 
 * Generates:
 * 1. Batter Head-To-Head Runs (Batter A vs Batter B)
 * 2. Batter Head-To-Head Fours
 * 3. Batter Head-To-Head Sixes
 */

import { calculateBatterH2HProbability } from '../models/playerPerformanceModel.mjs';
import { getRosterForTeam } from '../../../src/data/cricketRosters.js';
import { priceSelection } from '../pricing/OddsCalculator.mjs';
import { createMarketDefinition } from '../models/MarketDefinition.mjs';

export function generateExtendedH2HMarkets(state, validation = {}, marginConfig = {}) {
  const overround = marginConfig.liveMatchWinnerOverround || 0.055;
  const battingTeam = state.battingTeamId === state.team1.id ? state.team1 : state.team2;
  const batRoster = getRosterForTeam(battingTeam.name);

  const batter1Name = state.batter1?.name || state.liveDetails?.batter1?.name || batRoster?.batters?.[0] || `${battingTeam.name} Batter 1`;
  const batter2Name = state.batter2?.name || state.liveDetails?.batter2?.name || batRoster?.batters?.[1] || `${battingTeam.name} Batter 2`;

  const b1Runs = Number(state.batter1?.runs ?? state.liveDetails?.batter1?.runs ?? 0);
  const b2Runs = Number(state.batter2?.runs ?? state.liveDetails?.batter2?.runs ?? 0);

  const { pPlayerA, pPlayerB, pTie } = calculateBatterH2HProbability(b1Runs, b2Runs);
  const markets = [];

  // 1. Batter H2H Runs
  markets.push(createMarketDefinition({
    marketId: `batter_h2h_runs`,
    marketType: 'BATTER_HEAD_TO_HEAD',
    category: 'h2h',
    name: `Batter H2H Runs: ${batter1Name} vs ${batter2Name}`,
    status: 'OPEN',
    selections: [
      priceSelection({ selectionId: 'sel_h2h_b1', name: batter1Name, probability: pPlayerA, overround }),
      priceSelection({ selectionId: 'sel_h2h_b2', name: batter2Name, probability: pPlayerB, overround }),
      priceSelection({ selectionId: 'sel_h2h_tie', name: 'Tie', probability: pTie, overround }),
    ],
  }));

  // 2. Batter H2H Sixes
  markets.push(createMarketDefinition({
    marketId: `batter_h2h_sixes`,
    marketType: 'BATTER_H2H_SIXES',
    category: 'h2h',
    name: `Batter H2H Sixes: ${batter1Name} vs ${batter2Name}`,
    status: 'OPEN',
    selections: [
      priceSelection({ selectionId: 'sel_h2h_six_b1', name: batter1Name, probability: 0.48, overround }),
      priceSelection({ selectionId: 'sel_h2h_six_b2', name: batter2Name, probability: 0.42, overround }),
      priceSelection({ selectionId: 'sel_h2h_six_tie', name: 'Tie', probability: 0.10, overround }),
    ],
  }));

  return markets;
}
