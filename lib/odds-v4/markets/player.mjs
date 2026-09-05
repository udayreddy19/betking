/**
 * OddsEngineV4 — player run markets (P2). Requires named batters.
 */

import { priceTwoWay, DEFAULT_V4_MARGIN } from '../pricing/MarginPolicy.mjs';
import { createMarketDefinition, emitMarket } from './helpers.mjs';

function slug(name = '') {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
}

function milestoneProb(currentRuns, balls, milestone, ballsRemaining, wicketsInHand) {
  if (currentRuns >= milestone) return 0.97;
  const need = milestone - currentRuns;
  const rpb = Math.max(0.5, (currentRuns + 8) / Math.max(1, balls + 6));
  const expected = rpb * Math.min(ballsRemaining, 60) * Math.min(1, wicketsInHand / 6);
  const ratio = expected / Math.max(1, need);
  return Math.max(0.05, Math.min(0.95, 1 / (1 + Math.exp(-2.1 * (ratio - 1)))));
}

export function generatePlayerMarkets(state, quality, margins = DEFAULT_V4_MARGIN) {
  if (!quality?.battersOk && !state.hasNamedBatters) return [];
  if (state.status !== 'LIVE') return [];

  const overround = margins.totalsOverround ?? DEFAULT_V4_MARGIN.totalsOverround;
  const markets = [];
  const batters = [state.batter1, state.batter2].filter((b) => b?.name);

  for (const batter of batters) {
    const idBase = slug(batter.name);
    const runs = Number(batter.runs) || 0;
    const balls = Number(batter.balls) || 0;
    for (const ms of [25, 50]) {
      if (runs >= ms) continue;
      const pYes = milestoneProb(
        runs,
        balls,
        ms,
        Number(state.ballsRemaining) || 0,
        Number(state.wicketsInHand) || 0,
      );
      const priced = priceTwoWay(
        'Yes', `player_${ms}_${idBase}_yes`, pYes,
        'No', `player_${ms}_${idBase}_no`, 1 - pYes,
        overround,
      );
      if (priced.suspended) continue;
      const m = emitMarket(createMarketDefinition({
        marketId: `player_${ms}_${idBase}`,
        marketType: 'PLAYER',
        name: `${batter.name} to Reach ${ms} runs`,
        status: 'OPEN',
        selections: priced.selections,
        overround,
      }));
      if (m) markets.push(m);
    }

    // Alt line ~ current + 12.5
    const altLine = Math.floor(runs + 12) + 0.5;
    const pOver = milestoneProb(runs, balls, Math.ceil(altLine), Number(state.ballsRemaining) || 0, Number(state.wicketsInHand) || 0);
    const altPriced = priceTwoWay(
      'Over', `player_alt_${idBase}_over`, pOver,
      'Under', `player_alt_${idBase}_under`, 1 - pOver,
      overround,
    );
    if (!altPriced.suspended) {
      const alt = emitMarket(createMarketDefinition({
        marketId: `player_alt_${idBase}`,
        marketType: 'PLAYER',
        name: `${batter.name} Runs`,
        status: 'OPEN',
        line: altLine,
        selections: altPriced.selections,
        overround,
      }));
      if (alt) markets.push(alt);
    }
  }

  return markets;
}
