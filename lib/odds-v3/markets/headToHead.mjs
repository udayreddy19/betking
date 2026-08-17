/**
 * OddsEngineV3 — Extended Head-To-Head Markets (Group 8)
 * 
 * Generates:
 * 1. Batter Head-To-Head Runs (Batter A vs Batter B)
 * 2. Batter Head-To-Head Fours
 * 3. Batter Head-To-Head Sixes
 */

import { calculateBatterH2HProbability } from '../models/playerPerformanceModel.mjs';
import { priceSelection } from '../pricing/OddsCalculator.mjs';
import { createMarketDefinition } from '../models/MarketDefinition.mjs';

export function generateExtendedH2HMarkets(state, validation = {}, marginConfig = {}) {
  const overround = marginConfig.liveMatchWinnerOverround || 0.055;

  const batter1Name = state.batter1?.name || state.liveDetails?.batter1?.name;
  const batter2Name = state.batter2?.name || state.liveDetails?.batter2?.name;
  if (!batter1Name || !batter2Name) return [];

  const b1Runs = Number(state.batter1?.runs ?? state.liveDetails?.batter1?.runs ?? 0);
  const b2Runs = Number(state.batter2?.runs ?? state.liveDetails?.batter2?.runs ?? 0);
  const b1Sixes = Number(state.batter1?.sixes ?? state.liveDetails?.batter1?.sixes ?? 0);
  const b2Sixes = Number(state.batter2?.sixes ?? state.liveDetails?.batter2?.sixes ?? 0);

  const { pPlayerA, pPlayerB, pTie } = calculateBatterH2HProbability(b1Runs, b2Runs, state.ballsRemaining || 60);
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

  // 2. Batter H2H Sixes — dynamically modeled from sixes count and run pace
  const sixDiff = (b1Sixes - b2Sixes) + (b1Runs - b2Runs) * 0.05;
  const pTieSix = 0.15;
  const pSixARaw = 1 / (1 + Math.exp(-sixDiff * 0.4));
  const pSixA = Math.max(0.05, Math.min(0.85, pSixARaw * (1.0 - pTieSix)));
  const pSixB = Math.max(0.05, Math.min(0.85, (1.0 - pSixARaw) * (1.0 - pTieSix)));

  markets.push(createMarketDefinition({
    marketId: `batter_h2h_sixes`,
    marketType: 'BATTER_H2H_SIXES',
    category: 'h2h',
    name: `Batter H2H Sixes: ${batter1Name} vs ${batter2Name}`,
    status: 'OPEN',
    selections: [
      priceSelection({ selectionId: 'sel_h2h_six_b1', name: batter1Name, probability: pSixA, overround }),
      priceSelection({ selectionId: 'sel_h2h_six_b2', name: batter2Name, probability: pSixB, overround }),
      priceSelection({ selectionId: 'sel_h2h_six_tie', name: 'Tie', probability: pTieSix, overround }),
    ],
  }));

  return markets;
}
