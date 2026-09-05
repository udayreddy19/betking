/**
 * OddsEngineV4 — master generate pipeline.
 *
 * Phases:
 *   P0 winner + totals (always when quality allows)
 *   P1 overs/deliveries (ball feed)
 *   P2 player/wicket (named batters / ball feed)
 *   P3 OE/exact/dismissal (config.enableP3)
 */

import { evaluateStateQuality } from './state/StateQualityGate.mjs';
import { buildCanonicalFromMatchV4 } from './state/buildCanonicalFromMatchV4.mjs';
import { DEFAULT_V4_MARGIN } from './pricing/MarginPolicy.mjs';
import { generateMatchWinnerMarkets } from './markets/matchWinner.mjs';
import { generateTotalMarkets } from './markets/totals.mjs';
import { generateOverMarkets } from './markets/overs.mjs';
import { generateDeliveryMarkets } from './markets/deliveries.mjs';
import { generateWicketMarkets } from './markets/wickets.mjs';
import { generatePlayerMarkets } from './markets/player.mjs';
import { generateP3Markets } from './markets/exactAndOe.mjs';
import { assembleBook, createOddsSnapshotV4 } from './book/BookAssembler.mjs';

export function generateFromState(state, config = {}) {
  const margins = { ...DEFAULT_V4_MARGIN, ...(config.margins || {}) };
  const quality = evaluateStateQuality(state);

  if (quality.suspendAll) {
    return createOddsSnapshotV4({
      matchId: state?.matchId || 'unknown',
      markets: [],
      stateVersion: state?.stateVersion,
      quality,
      meta: { reason: quality.reasons.join(',') },
    });
  }

  const enableP3 = Boolean(config.enableP3 ?? (process.env.ODDS_V4_ENABLE_P3 === '1'));
  const cfg = { ...config, enableP3 };

  let markets = [];
  const winnerMarkets = quality.suspendWinner
    ? []
    : generateMatchWinnerMarkets(state, margins);

  if (cfg.winnerOnly) {
    markets = winnerMarkets;
  } else {
    markets = [
      ...winnerMarkets,
      ...generateTotalMarkets(state, margins),
      ...generateOverMarkets(state, quality, margins),
      ...generateDeliveryMarkets(state, quality, margins),
      ...generateWicketMarkets(state, quality, margins),
      ...generatePlayerMarkets(state, quality, margins),
      ...generateP3Markets(state, quality, margins, cfg),
    ];
  }

  // Never emit flat 1.90/1.90 for live chase with complete state — regenerate if needed.
  markets = assembleBook(markets);
  const mw = markets.find((m) => m.marketId === 'match_winner' && m.status === 'OPEN');
  if (
    mw?.selections?.length === 2
    && Number(mw.selections[0].odds) === 1.9
    && Number(mw.selections[1].odds) === 1.9
    && state.phase === 'CHASE'
    && Number(state.runsRequired) >= 0
  ) {
    markets = markets.filter((m) => m.marketId !== 'match_winner' && m.marketId !== 'match_winner_super_over');
    markets = [
      ...generateMatchWinnerMarkets(state, margins),
      ...markets,
    ];
    markets = assembleBook(markets);
  }

  return createOddsSnapshotV4({
    matchId: state.matchId,
    markets,
    stateVersion: state.stateVersion,
    quality,
    meta: {
      format: state.format,
      phase: state.phase,
      winnerOnly: Boolean(cfg.winnerOnly),
      enableP3: Boolean(cfg.enableP3),
    },
  });
}

/**
 * @param {object} matchOrState — aggregator match blob OR CanonicalMatchStateV4
 * @param {object} [config]
 */
export function generate(matchOrState, config = {}) {
  const isCanonical = matchOrState
    && matchOrState.team1?.id
    && matchOrState.ballsPerInnings != null
    && matchOrState.phase != null
    && !matchOrState.liveDetails;

  const state = isCanonical
    ? matchOrState
    : buildCanonicalFromMatchV4(matchOrState, { stateVersion: config.stateVersion });

  return generateFromState(state, config);
}

export { buildCanonicalFromMatchV4 } from './state/buildCanonicalFromMatchV4.mjs';
export { evaluateStateQuality } from './state/StateQualityGate.mjs';
export { DEFAULT_V4_MARGIN } from './pricing/MarginPolicy.mjs';
