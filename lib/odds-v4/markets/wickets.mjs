/**
 * OddsEngineV4 — wicket markets (P2).
 */

import { priceTwoWay, priceExclusive, DEFAULT_V4_MARGIN } from '../pricing/MarginPolicy.mjs';
import { createMarketDefinition, emitMarket, ouMarket } from './helpers.mjs';
import { pickBalancedLine, normalOuFair } from '../models/ScoreDistributionEngine.mjs';

function nextOverNumber(state) {
  return Math.floor((Number(state.ballsCompleted) || 0) / 6) + 1;
}

export function generateWicketMarkets(state, quality, margins = DEFAULT_V4_MARGIN) {
  if (!quality?.ballFeedOk && !state.hasBallFeed) return [];
  if (state.status !== 'LIVE') return [];
  if (Number(state.wicketsInHand) <= 0 || Number(state.ballsRemaining) < 1) return [];

  const overround = margins.overMarketsOverround ?? DEFAULT_V4_MARGIN.overMarketsOverround;
  const inn = Number(state.currentInnings) || 1;
  const overNum = nextOverNumber(state);
  // ~ historic T20 wicket every ~20 balls → ~30% chance in an over.
  const pWicketOver = Math.min(0.55, 0.12 + (0.04 * (10 - Number(state.wicketsInHand))));
  const markets = [];

  const priced = priceTwoWay(
    'Yes', `i${inn}_wicket_in_over_${overNum}_yes`, pWicketOver,
    'No', `i${inn}_wicket_in_over_${overNum}_no`, 1 - pWicketOver,
    overround,
  );
  if (!priced.suspended) {
    const m = emitMarket(createMarketDefinition({
      marketId: `i${inn}_wicket_in_over_${overNum}`,
      marketType: 'WICKET',
      name: `Wicket In Over ${overNum}`,
      status: 'OPEN',
      selections: priced.selections,
      overround,
    }));
    if (m) markets.push(m);
  }

  const nextDismiss = (Number(state.battingWickets) || 0) + 1;
  if (nextDismiss <= 10) {
    const mean = Number(state.battingRuns) + 12 + Number(state.wicketsInHand);
    const line = pickBalancedLine(mean);
    const fair = normalOuFair(mean, 14, line);
    const scoreAt = ouMarket({
      marketId: `i${inn}_team_score_at_${nextDismiss}_dismissal`,
      marketType: 'WICKET',
      name: `Total at ${nextDismiss}${nextDismiss === 1 ? 'st' : nextDismiss === 2 ? 'nd' : nextDismiss === 3 ? 'rd' : 'th'} Dismissal`,
      line,
      pOver: fair.pOver,
      pUnder: fair.pUnder,
      overround,
      priceExclusive,
    });
    if (scoreAt) markets.push(scoreAt);
  }

  return markets;
}
