/**
 * OddsEngineV4 — delivery O/U markets (P1).
 */

import {
  projectDeliveryRuns,
  normalOuFair,
} from '../models/ScoreDistributionEngine.mjs';
import { priceExclusive, DEFAULT_V4_MARGIN } from '../pricing/MarginPolicy.mjs';
import { ouMarket } from './helpers.mjs';

function nextBallSlot(state) {
  const balls = Number(state.ballsCompleted) || 0;
  const overNum = Math.floor(balls / 6) + 1;
  const ballNum = (balls % 6) + 1;
  return { overNum, ballNum };
}

export function generateDeliveryMarkets(state, quality, margins = DEFAULT_V4_MARGIN) {
  if (!quality?.ballFeedOk && !state.hasBallFeed) return [];
  if (Number(state.ballsRemaining) <= 0) return [];
  if (state.status === 'COMPLETED' || state.phase === 'PREMATCH') return [];

  const overround = margins.deliveryOverround ?? DEFAULT_V4_MARGIN.deliveryOverround;
  const { overNum, ballNum } = nextBallSlot(state);
  const inn = Number(state.currentInnings) || 1;
  const proj = projectDeliveryRuns(state);
  const markets = [];

  for (const line of [0.5, 1.5, 3.5]) {
    const fair = normalOuFair(proj.mean, proj.sd, line);
    const m = ouMarket({
      marketId: `i${inn}_next_delivery_runs_ou_${String(line).replace('.', '_')}`,
      marketType: 'DELIVERY_TOTAL',
      name: `${overNum}.${ballNum} Runs O/U ${line}`,
      line,
      pOver: fair.pOver,
      pUnder: fair.pUnder,
      overround,
      priceExclusive,
    });
    if (m) markets.push(m);
  }

  return markets;
}
