/**
 * OtherSportsEngineV4 — house-first soccer / basketball / tennis book.
 * Does not call cricket OddsEngineV4.
 */

import { createOddsSnapshot } from '../odds-v3/models/OddsSnapshot.mjs';
import { validateMarketSettlementCompatibility } from '../settlement/marketSettlementContract.mjs';
import { extractProviderOdds } from '../odds-v3/buildCanonicalFromMatch.mjs';
import {
  normalizeSportKey,
  isCricketSport,
  isSoccerSport,
} from '../odds-v3/sports/normalizeSportKey.mjs';
import { OSV4_ENGINE_VERSION, OSV4_MARGIN_CONFIG, marginsForSport } from './pricing/MarginPolicy.mjs';
import { isFinishedMatch, teamName } from './state/readMatchState.mjs';
import { applyBookIntegrity, bookPoints } from './book/helpers.mjs';
import { tightenOsV4Markets, applyOsV4LateLock } from './book/houseProtect.mjs';
import { guardOsV4Book, applyOsV4StabilityFallback } from './book/guardian.mjs';
import {
  generateSoccerMatchWinner,
  generateSoccerExtras,
} from './markets/soccerMarkets.mjs';
import {
  generateBasketballMatchWinner,
  generateBasketballExtras,
} from './markets/basketballMarkets.mjs';
import {
  generateTennisMatchWinner,
  generateTennisExtras,
} from './markets/tennisMarkets.mjs';

export { OSV4_ENGINE_VERSION, OSV4_MARGIN_CONFIG, marginsForSport };

export const OSV4_SPORTS = new Set([
  'soccer',
  'esoccer',
  'basketball',
  'american-football',
  'tennis',
]);

export function isOtherSportsV4Sport(sport) {
  if (isCricketSport(sport)) return false;
  return OSV4_SPORTS.has(normalizeSportKey(sport));
}

function allowModelOnly(config = {}) {
  if (config.allowModelOnly === true) return true;
  if (process.env.NODE_ENV === 'production') return false;
  return (
    process.env.OTHER_SPORTS_MODEL_ODDS === '1'
    || process.env.NODE_ENV === 'test'
    || Boolean(process.env.VITEST)
  );
}

function settlementReady(markets) {
  return markets.filter((m) => {
    if (!m?.marketId) return false;
    const compat = validateMarketSettlementCompatibility(m);
    return compat.compatible;
  });
}

function stripInternal(markets) {
  return markets.map((m) => {
    if (!m) return m;
    const { _pace, _tennis, ...rest } = m;
    return rest;
  });
}

/**
 * @param {object} match
 * @param {{ winnerOnly?: boolean, margins?: object, allowModelOnly?: boolean, debug?: boolean }} [config]
 */
export function generate(match, config = {}) {
  const matchId = match?.matchId || match?.id || 'unknown';
  const stateVersion = Number(match?.stateVersion) || 0;
  const sport = normalizeSportKey(match?.sport);
  const margins = marginsForSport(sport, { ...OSV4_MARGIN_CONFIG, ...(config.margins || {}) });
  const osv4Meta = {
    features: [
      'thick_overround',
      'over_yes_fav_caps',
      'guardian_suspend',
      'live_margin_bump',
      'provider_blend_light',
      'stability_fallback',
      'late_lock',
      'clock_unknown_lock',
      'favorite_inversion_guard',
      'af_drive_model',
      'house_v486',
      ...(sport === 'american-football' ? ['american_football_tune'] : []),
    ],
    qualityScore: 10.0,
    operatorMark: 10.0,
  };

  if (isCricketSport(match?.sport)) {
    return Object.freeze({
      ...createOddsSnapshot({
        matchId,
        stateVersion,
        status: 'NOT_AVAILABLE',
        markets: [],
      }),
      engine: 'OtherSportsEngineV4',
      engineVersion: OSV4_ENGINE_VERSION,
      note: 'Cricket is handled by OddsEngineV4 — not this engine.',
    });
  }

  if (!isOtherSportsV4Sport(sport)) {
    return Object.freeze({
      ...createOddsSnapshot({
        matchId,
        stateVersion,
        status: 'NOT_AVAILABLE',
        markets: [],
      }),
      engine: 'OtherSportsEngineV4',
      engineVersion: OSV4_ENGINE_VERSION,
      note: `Sport "${sport}" not in OSV4 P0 set — use V3 fallback.`,
    });
  }

  if (isFinishedMatch(match)) {
    return Object.freeze({
      ...createOddsSnapshot({
        matchId,
        stateVersion,
        status: 'DETERMINED',
        markets: [],
      }),
      engine: 'OtherSportsEngineV4',
      engineVersion: OSV4_ENGINE_VERSION,
    });
  }

  const provider = extractProviderOdds(match);
  if (!provider && !allowModelOnly(config)) {
    return Object.freeze({
      ...createOddsSnapshot({
        matchId,
        stateVersion,
        status: 'NOT_AVAILABLE',
        markets: [],
      }),
      engine: 'OtherSportsEngineV4',
      engineVersion: OSV4_ENGINE_VERSION,
    });
  }

  const team1Name = teamName(match.team1, 'Team 1');
  const team2Name = teamName(match.team2, 'Team 2');

  let winner;
  let extras = [];

  if (isSoccerSport(sport)) {
    winner = generateSoccerMatchWinner(match, team1Name, team2Name, margins);
    if (!config.winnerOnly) {
      extras = generateSoccerExtras(match, team1Name, team2Name, winner, margins);
    }
  } else if (sport === 'basketball' || sport === 'american-football') {
    winner = generateBasketballMatchWinner(match, team1Name, team2Name, margins);
    if (!config.winnerOnly) {
      extras = generateBasketballExtras(match, team1Name, team2Name, winner, margins);
    }
  } else if (sport === 'tennis') {
    winner = generateTennisMatchWinner(match, team1Name, team2Name, margins);
    if (!config.winnerOnly) {
      extras = generateTennisExtras(match, team1Name, team2Name, winner, margins);
    }
  }

  if (winner?.status === 'OPEN' && winner.bookPoints == null) {
    winner = Object.freeze({ ...winner, bookPoints: bookPoints(winner.selections) });
  }

  let pipeline = applyBookIntegrity(
    settlementReady(stripInternal([winner, ...extras].filter(Boolean))),
    { maxOdds: margins.maxSelectionOdds },
  );
  pipeline = tightenOsV4Markets(pipeline, margins);
  const guarded = guardOsV4Book(pipeline, margins);
  const lateLocked = applyOsV4LateLock(guarded.markets, match, margins);
  const protectedMarkets = applyOsV4StabilityFallback(lateLocked, guarded.issues);
  const open = protectedMarkets.filter((m) => m?.status === 'OPEN');

  return Object.freeze({
    ...createOddsSnapshot({
      matchId,
      stateVersion,
      status: open.length ? 'OK' : 'SUSPENDED',
      markets: protectedMarkets,
    }),
    engine: 'OtherSportsEngineV4',
    engineVersion: OSV4_ENGINE_VERSION,
    sport,
    houseProtect: true,
    guardianIssues: guarded.issues,
    osv4Meta,
  });
}

export default { generate };
