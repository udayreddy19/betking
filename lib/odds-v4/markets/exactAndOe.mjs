/**
 * OddsEngineV4 — odd/even, exact delivery runs, method of wicket (P3).
 * Enabled only when quality gates + config.enableP3.
 */

import { deliveryOutcomeProbs } from '../models/ScoreDistributionEngine.mjs';
import { priceExclusive, priceTwoWay, DEFAULT_V4_MARGIN } from '../pricing/MarginPolicy.mjs';
import { createMarketDefinition, emitMarket } from './helpers.mjs';

export function generateP3Markets(state, quality, margins = DEFAULT_V4_MARGIN, config = {}) {
  if (!config.enableP3) return [];
  if (!quality?.ballFeedOk && !state.hasBallFeed) return [];
  if (state.status !== 'LIVE') return [];

  const multi = margins.multiwayOverround ?? DEFAULT_V4_MARGIN.multiwayOverround;
  const twoWay = margins.overMarketsOverround ?? DEFAULT_V4_MARGIN.overMarketsOverround;
  const markets = [];
  const inn = Number(state.currentInnings) || 1;

  // Innings runs odd/even — slight even lean historically.
  const pOdd = 0.48;
  const oe = priceTwoWay(
    'Odd', `i${inn}_team_total_odd_even_odd`, pOdd,
    'Even', `i${inn}_team_total_odd_even_even`, 1 - pOdd,
    twoWay,
  );
  // Settlement contract uses next_over odd_even pattern — use next over OE.
  const overNum = Math.floor((Number(state.ballsCompleted) || 0) / 6) + 1;
  if (!oe.suspended) {
    const m = emitMarket(createMarketDefinition({
      marketId: `i${inn}_next_over_${overNum}_odd_even`,
      marketType: 'ODD_EVEN',
      name: `Over ${overNum} Runs Odd or Even`,
      status: 'OPEN',
      selections: oe.selections,
      overround: twoWay,
    }));
    if (m) markets.push(m);
  }

  const dist = deliveryOutcomeProbs(state);
  const exactPriced = priceExclusive([
    { id: 'exact_0', name: 'Zero Runs', probability: dist[0] },
    { id: 'exact_1', name: 'Exactly One Run', probability: dist[1] },
    { id: 'exact_2', name: 'Exactly Two Runs', probability: dist[2] },
    { id: 'exact_3', name: 'Exactly Three Runs', probability: dist[3] },
    { id: 'exact_4', name: 'Exactly Four Runs', probability: dist[4] },
    { id: 'exact_6', name: 'More than Four Runs', probability: dist['6plus'] },
  ], multi);
  if (!exactPriced.suspended) {
    const m = emitMarket(createMarketDefinition({
      marketId: `i${inn}_next_delivery_runs_exact`,
      marketType: 'DELIVERY_EXACT',
      name: 'Exact Runs off Next Delivery',
      status: 'OPEN',
      selections: exactPriced.selections,
      overround: multi,
    }));
    // May be orphan if contract doesn't list exact — helpers will drop.
    if (m) markets.push(m);
  }

  const dismissN = (Number(state.battingWickets) || 0) + 1;
  const methodPriced = priceExclusive([
    { id: 'caught', name: 'Caught', probability: 0.55 },
    { id: 'bowled', name: 'Bowled', probability: 0.18 },
    { id: 'lbw', name: 'LBW', probability: 0.12 },
    { id: 'runout', name: 'Run Out', probability: 0.08 },
    { id: 'stumped', name: 'Stumped', probability: 0.07 },
  ], multi);
  if (!methodPriced.suspended && dismissN <= 10) {
    const m = emitMarket(createMarketDefinition({
      marketId: `i${inn}_method_of_next_wicket_${dismissN}`,
      marketType: 'DISMISSAL',
      name: `Method of ${dismissN}${dismissN === 1 ? 'st' : dismissN === 2 ? 'nd' : dismissN === 3 ? 'rd' : 'th'} Wicket Dismissal`,
      status: 'OPEN',
      selections: methodPriced.selections,
      overround: multi,
    }));
    if (m) markets.push(m);
  }

  return markets;
}
