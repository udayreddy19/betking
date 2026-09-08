/**
 * OtherSportsEngineV4 — house-first multi-sport book (v4.9).
 * Multi-pass pipeline: generate → blend → integrity → tighten → guardian
 *   → late-lock → re-tighten → re-guard → quality-score → stability fallback.
 * Does not call cricket OddsEngineV4.
 */

import { createLogger } from '../logger.mjs';
const log = createLogger({ engine: 'OtherSportsEngineV4' });

import { createOddsSnapshot } from '../odds-v3/models/OddsSnapshot.mjs';
import { validateMarketSettlementCompatibility } from '../settlement/marketSettlementContract.mjs';
import { extractProviderOdds } from '../odds-v3/buildCanonicalFromMatch.mjs';
import { evaluateFeedCircuitBreaker, applyCircuitBreakerToMarkets } from '../odds-v3/circuitBreaker.mjs';
import { applyVolatilityProtection } from '../odds-v3/volatilityFilter.mjs';
import {
  normalizeSportKey,
  isCricketSport,
  isSoccerSport,
} from '../odds-v3/sports/normalizeSportKey.mjs';
import { OSV4_ENGINE_VERSION, OSV4_MARGIN_CONFIG, marginsForSport } from './pricing/MarginPolicy.mjs';
import { isFinishedMatch, isLiveMatch, teamName } from './state/readMatchState.mjs';
import { applyBookIntegrity, bookPoints } from './book/helpers.mjs';
import { tightenOsV4Markets, applyOsV4LateLock, liveMarginBump } from './book/houseProtect.mjs';
import { guardOsV4Book } from './book/guardian.mjs';
import { scoreOsV4Book, applyScoreDrivenFallback } from './book/scorecard.mjs';
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
import {
  generateBaseballMatchWinner,
  generateBaseballExtras,
} from './markets/baseballMarkets.mjs';
import {
  generateIceHockeyMatchWinner,
  generateIceHockeyExtras,
} from './markets/iceHockeyMarkets.mjs';

export { OSV4_ENGINE_VERSION, OSV4_MARGIN_CONFIG, marginsForSport };

export const OSV4_SPORTS = new Set([
  'soccer',
  'esoccer',
  'basketball',
  'american-football',
  'tennis',
  'baseball',
  'ice-hockey',
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
    const { _pace, _tennis, _bb, _hk, ...rest } = m;
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
  const live = isLiveMatch(match);
  const bump = live ? liveMarginBump(match, margins) : 0;
  const provider = extractProviderOdds(match);
  const blended = !!provider;

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
      'multi_pass_reguard',
      'quality_score_fallback',
      'circuit_breaker',
      'volatility_protection',
      'house_v486',
      'house_v487',
      'house_v49',
      'live_clock_integrity',
      'dc_no_settlement_fix',
      'tennis_completed_sets',
      'soccer_inversion_guard',
      'soft_longshot_suspend',
      ...(sport === 'american-football' ? ['american_football_tune'] : []),
      ...(sport === 'baseball' ? ['baseball_tune'] : []),
      ...(sport === 'ice-hockey' ? ['ice_hockey_tune'] : []),
    ],
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
      note: `Sport "${sport}" not in OSV4 set — use V3 fallback.`,
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

  try {
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
    } else if (sport === 'baseball') {
      winner = generateBaseballMatchWinner(match, team1Name, team2Name, margins);
      if (!config.winnerOnly) {
        extras = generateBaseballExtras(match, team1Name, team2Name, winner, margins);
      }
    } else if (sport === 'ice-hockey') {
      winner = generateIceHockeyMatchWinner(match, team1Name, team2Name, margins);
      if (!config.winnerOnly) {
        extras = generateIceHockeyExtras(match, team1Name, team2Name, winner, margins);
      }
    }
  } catch (err) {
    log.error('market generation failed', { matchId, sport, err });
  }

  if (winner?.status === 'OPEN' && winner.bookPoints == null) {
    winner = Object.freeze({ ...winner, bookPoints: bookPoints(winner.selections) });
  }

  // === Multi-pass pipeline ===

  // Pass 1: integrity → tighten → guardian → late-lock
  let pipeline = applyBookIntegrity(
    settlementReady(stripInternal([winner, ...extras].filter(Boolean))),
    { maxOdds: margins.maxSelectionOdds },
  );
  pipeline = tightenOsV4Markets(pipeline, margins);
  const guarded1 = guardOsV4Book(pipeline, margins);
  const lateLocked = applyOsV4LateLock(guarded1.markets, match, margins);

  // Pass 2: volatility protection → re-tighten → re-guard (belt-and-suspenders)
  let volatileProtected = lateLocked;
  try {
    volatileProtected = applyVolatilityProtection(lateLocked, matchId, {
      eventType: match?.liveDetails?.lastEvent || match?.event,
      isLive: live,
    });
  } catch (err) {
    log.warn('volatility protection failed', { matchId, err });
  }
  const reTightened = tightenOsV4Markets(volatileProtected, margins);
  const guarded2 = guardOsV4Book(reTightened, margins);

  // Circuit breaker
  let finalMarkets = guarded2.markets;
  let breakerTripped = false;
  try {
    const breakerStatus = evaluateFeedCircuitBreaker(matchId, {
      timestamp: match?.timestamp || match?.lastUpdated,
      stateVersion,
    }, config.circuitBreaker);
    if (breakerStatus.isTripped) {
      finalMarkets = applyCircuitBreakerToMarkets(finalMarkets, true, breakerStatus.reason);
      breakerTripped = true;
    }
  } catch (err) {
    log.warn('circuit breaker failed', { matchId, err });
  }

  // Quality scoring → score-driven stability fallback
  const allIssues = [...guarded1.issues, ...guarded2.issues];
  const quality = scoreOsV4Book({
    markets: finalMarkets,
    issues: allIssues,
    sport,
    blended,
    modelConfidence: winner?._tennis?.confidence ?? winner?._pace?.confidence ?? winner?._bb?.confidence ?? winner?._hk?.confidence ?? 0.8,
    liveMarginBump: bump,
    engineVersion: OSV4_ENGINE_VERSION,
  });

  const protectedMarkets = applyScoreDrivenFallback(finalMarkets, quality);
  const open = protectedMarkets.filter((m) => m?.status === 'OPEN');

  return Object.freeze({
    ...createOddsSnapshot({
      matchId,
      stateVersion,
      status: breakerTripped ? 'SUSPENDED' : (open.length ? 'OK' : 'SUSPENDED'),
      markets: protectedMarkets,
    }),
    engine: 'OtherSportsEngineV4',
    engineVersion: OSV4_ENGINE_VERSION,
    sport,
    houseProtect: true,
    guardianIssues: allIssues.slice(0, 12),
    osv4Meta: {
      ...osv4Meta,
      qualityScore: quality.qualityScore,
      // Derived from measured book quality — never a vanity constant.
      operatorMark: Number((Number(quality.qualityScore || 0) / 10).toFixed(1)),
      qualityBreakdown: quality.breakdown,
      openMarkets: open.length,
    },
  });
}

export default { generate };
