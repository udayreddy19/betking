/**
 * Engine dispatch: V5 live, V4 fallback. No V3 publish path.
 * Cricket defaults OddsEngineV5; other sports default OtherSportsEngineV5.
 */

import { createLogger } from '../logger.mjs';
const log = createLogger({ engine: 'engineDispatch' });

import { buildCanonicalFromMatch } from '../odds-shared/buildCanonicalFromMatch.mjs';
import { extractMatchWinnerOdds } from '../odds-shared/extractMatchWinnerOdds.mjs';
import { adaptV3SnapshotToPublicContract } from '../odds-shared/adapters/V3ApiAdapter.mjs';
import { isCricketSport } from '../odds-shared/otherSportsOdds.mjs';
import { isMatchSRL } from '../cricketSnapshot.mjs';

import { generate as generateV5, V5_ENGINE_VERSION } from './OddsEngineV5.mjs';
import { generate as generateV4, V4_ENGINE_VERSION } from '../odds-v4/OddsEngineV4.mjs';
import { resolveOddsEngineMode, resolveOddsEngineModeAsync } from './EngineModeControl.mjs';
import { defaultShadowMetricsStore } from './shadow/ShadowMetricsStore.mjs';

import {
  generate as generateOtherSportsV5,
  isOtherSportsV5Sport,
  OSV5_ENGINE_VERSION,
} from '../other-sports-v5/OtherSportsEngineV5.mjs';
import {
  generate as generateOtherSportsV4,
  OSV4_ENGINE_VERSION,
} from '../other-sports-v4/OtherSportsEngineV4.mjs';
import {
  resolveOtherSportsEngineMode,
  resolveOtherSportsEngineModeAsync,
} from '../other-sports-v5/EngineModeControl.mjs';
import {
  runOtherSportsShadowCompare,
  getOtherSportsShadowMetrics,
} from '../other-sports-v5/shadowCompare.mjs';

export const ENGINE_FALLBACK_REASONS = Object.freeze({
  V5_HEALTH_FAILURE: 'V5_HEALTH_FAILURE',
  V5_CONFIGURATION_ERROR: 'V5_CONFIGURATION_ERROR',
  V5_MARKET_UNSUPPORTED: 'V5_MARKET_UNSUPPORTED',
  V5_PROVIDER_STATE_INVALID: 'V5_PROVIDER_STATE_INVALID',
  V5_NO_OPEN_WINNER: 'V5_NO_OPEN_WINNER',
  V5_EMPTY_BOOK: 'V5_EMPTY_BOOK',
  V5_QUALITY_SUSPEND: 'V5_QUALITY_SUSPEND',
  MANUAL_ROLLBACK: 'MANUAL_ROLLBACK',
  CANARY_GATE_FAILURE: 'CANARY_GATE_FAILURE',
  V5_EXCEPTION: 'V5_EXCEPTION',
  NON_OSV5_SPORT: 'NON_OSV5_SPORT',
  MODE_V4: 'MODE_V4',
  MODE_SHADOW_COMPARE_V4: 'MODE_SHADOW_COMPARE_V4',
});

function shadowCompareEnabled(mode) {
  if (mode === 'shadow') return true;
  const flag = String(process.env.ODDS_SHADOW_COMPARE || '').toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
}

function snapshotHasOpenWinner(snapshot) {
  const markets = snapshot?.markets || [];
  return markets.some((m) => {
    if (!m || m.status !== 'OPEN') return false;
    const id = String(m.marketId || m.marketType || '').toLowerCase();
    return id === 'match_winner' || id.includes('match_winner');
  });
}

function isIntentionallyUnpriced(snapshot) {
  const st = String(snapshot?.status || '').toUpperCase();
  return ['SUSPENDED', 'INVALID_STATE', 'DETERMINED', 'NOT_AVAILABLE', 'NO_OPEN_MARKETS'].includes(st)
    || String(snapshot?.suspensionReason || '').length > 0;
}

function isEmptyOrUnavailableBook(raw) {
  if (!raw) return true;
  if (raw.error) return true;
  const st = String(raw.status || '').toUpperCase();
  const markets = Array.isArray(raw.markets) ? raw.markets : [];
  const open = markets.some((m) => m?.status === 'OPEN');
  if (open) return false;
  return st === 'NOT_AVAILABLE' || st === 'SUSPENDED' || markets.length === 0;
}

const fallbackRing = [];
const FALLBACK_MAX = 200;

function recordFallback(entry) {
  fallbackRing.push({ ...entry, at: Date.now() });
  if (fallbackRing.length > FALLBACK_MAX) fallbackRing.shift();
  log.warn('engine_fallback', entry);
}

export function getEngineFallbackMetrics() {
  return {
    samples: fallbackRing.length,
    recent: fallbackRing.slice(-25),
    byReason: fallbackRing.reduce((acc, row) => {
      const k = row.reason || 'UNKNOWN';
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {}),
  };
}

/** SRL matches always use live V5 (or explicit v4 override), never skip shadow compare only. */
function forceLiveForSrl(match, mode) {
  if (mode === 'shadow') return 'shadow';
  if (isMatchSRL(match) && mode !== 'v4') return 'v5';
  return mode;
}

function attachWinner(baseMatch, snapshot, oddsSource) {
  const winner = extractMatchWinnerOdds(snapshot, baseMatch);
  if (winner.team1 == null || winner.team2 == null) return null;
  const odds = {
    home: winner.team1,
    away: winner.team2,
    team1: winner.team1,
    team2: winner.team2,
  };
  if (winner.draw != null && winner.draw > 1) odds.draw = winner.draw;
  return {
    ...baseMatch,
    odds,
    oddsSource,
    oddsVersion: winner.oddsVersion,
    stateVersion: winner.stateVersion,
    authoritativeOdds: winner,
  };
}

const shadowRing = [];
const SHADOW_MAX = 200;
const SHADOW_SAMPLE_EVERY_MS = 15_000;
const lastShadowByMatch = new Map();

/** Dual-run: V5 vs V4 metrics only (V5 remains the publish path). */
export function runShadowCompare(match, { force = false } = {}) {
  const id = String(match?.id || match?.matchId || '');
  if (!force && id) {
    const now = Date.now();
    const prev = lastShadowByMatch.get(id) || 0;
    if (now - prev < SHADOW_SAMPLE_EVERY_MS) {
      return { skipped: true, reason: 'throttled' };
    }
    lastShadowByMatch.set(id, now);
    if (lastShadowByMatch.size > 500) {
      for (const [k, ts] of lastShadowByMatch) {
        if (now - ts > 300_000) lastShadowByMatch.delete(k);
      }
    }
  }

  let v4Odds = null;
  let v5Odds = null;
  try {
    const c = buildCanonicalFromMatch(match);
    const s5 = generateV5(c, { winnerOnly: true, debug: false });
    v5Odds = extractMatchWinnerOdds(s5, match);
    const s4 = generateV4(c, { winnerOnly: true, debug: false });
    v4Odds = extractMatchWinnerOdds(s4, match);
  } catch (err) {
    return { error: err.message };
  }
  const fav = (o) => {
    if (!o?.team1 || !o?.team2) return null;
    return Number(o.team1) <= Number(o.team2) ? 'team1' : 'team2';
  };
  const shortOf = (o) => {
    if (!o?.team1 || !o?.team2) return null;
    return Math.min(Number(o.team1), Number(o.team2));
  };
  const s5 = shortOf(v5Odds);
  const s4 = shortOf(v4Odds);
  const shortDeltaAbs = (s5 != null && s4 != null) ? Math.abs(s5 - s4) : null;
  const row = {
    at: Date.now(),
    matchId: match.id || match.matchId,
    v5: v5Odds,
    v4: v4Odds,
    // legacy keys for older dashboards
    v3: v5Odds,
    sameFav: fav(v5Odds) && fav(v5Odds) === fav(v4Odds),
    shortDeltaAbs,
  };
  shadowRing.push(row);
  if (shadowRing.length > SHADOW_MAX) shadowRing.shift();
  try {
    defaultShadowMetricsStore.recordCricketCompare(row);
  } catch { /* non-fatal */ }
  return row;
}

export function getShadowMetrics() {
  const rows = shadowRing.filter((r) => r.v5?.team1 && r.v4?.team1);
  const same = rows.filter((r) => r.sameFav).length;
  let durable = null;
  try { durable = defaultShadowMetricsStore.snapshot(); } catch { durable = null; }
  return {
    samples: rows.length,
    sameFavRate: rows.length ? same / rows.length : null,
    recent: shadowRing.slice(-15),
    durable: durable?.cricket || null,
    otherSports: getOtherSportsShadowMetrics(),
    fallbacks: getEngineFallbackMetrics(),
  };
}

function otherSportsMatchPayload(baseMatch) {
  return {
    ...baseMatch,
    matchId: baseMatch.id || baseMatch.matchId,
  };
}

function v4OtherSportsResult(payload, otherMode, config, reason, matchId) {
  if (reason) {
    recordFallback({
      sport: payload.sport,
      matchId: matchId || payload.matchId,
      from: 'OtherSportsEngineV5',
      to: 'OtherSportsEngineV4',
      reason,
      mode: otherMode,
    });
  }
  return {
    raw: generateOtherSportsV4(payload, config),
    engine: 'OtherSportsEngineV4',
    engineVersion: OSV4_ENGINE_VERSION,
    mode: otherMode === 'shadow' ? 'shadow' : 'v4',
    fallbackReason: reason || null,
  };
}

function generateOtherSportsRaw(matchObj, otherMode, config = {}) {
  const payload = otherSportsMatchPayload(matchObj);
  const osv5Eligible = isOtherSportsV5Sport(matchObj.sport);
  const matchId = payload.matchId;

  if (shadowCompareEnabled(otherMode)) {
    try { runOtherSportsShadowCompare(payload); } catch (err) {
      log.warn('other-sports shadow compare failed', { matchId, err });
    }
  }

  // Explicit V4 mode — publish V4 only
  if (otherMode === 'v4') {
    return v4OtherSportsResult(payload, otherMode, config, ENGINE_FALLBACK_REASONS.MODE_V4, matchId);
  }

  // shadow + default v5: try V5 first
  if (!osv5Eligible) {
    return v4OtherSportsResult(payload, otherMode, config, ENGINE_FALLBACK_REASONS.NON_OSV5_SPORT, matchId);
  }

  try {
    const raw = generateOtherSportsV5(payload, config);
    if (isEmptyOrUnavailableBook(raw)) {
      return v4OtherSportsResult(
        payload,
        otherMode,
        config,
        raw?.error
          ? ENGINE_FALLBACK_REASONS.V5_PROVIDER_STATE_INVALID
          : ENGINE_FALLBACK_REASONS.V5_EMPTY_BOOK,
        matchId,
      );
    }
    return {
      raw,
      engine: 'OtherSportsEngineV5',
      engineVersion: OSV5_ENGINE_VERSION,
      mode: otherMode === 'shadow' ? 'shadow' : 'v5',
      fallbackReason: null,
    };
  } catch (err) {
    log.error('OtherSportsEngineV5 exception — falling back to V4', { matchId, err: err?.message });
    return v4OtherSportsResult(payload, otherMode, config, ENGINE_FALLBACK_REASONS.V5_EXCEPTION, matchId);
  }
}

function priceCricketWithMode(baseMatch, cricketMode) {
  if (shadowCompareEnabled(cricketMode)) {
    try { runShadowCompare(baseMatch); } catch (err) { log.warn('cricket shadow compare failed', { err }); }
  }

  const tryV5 = cricketMode === 'v5' || cricketMode === 'shadow';
  if (tryV5) {
    try {
      const snap = generateV5(buildCanonicalFromMatch(baseMatch), { debug: false, winnerOnly: true });
      const priced = attachWinner(baseMatch, snap, 'OddsEngineV5');
      if (priced) return { ...priced, odds: { ...priced.odds, draw: priced.odds.draw ?? null } };

      // V5 intentionally suspended/invalid — do not reopen via V4.
      if (isIntentionallyUnpriced(snap) && !snapshotHasOpenWinner(snap)) {
        recordFallback({
          sport: 'cricket',
          matchId: baseMatch.id || baseMatch.matchId,
          from: 'OddsEngineV5',
          to: 'none',
          reason: ENGINE_FALLBACK_REASONS.V5_QUALITY_SUSPEND,
          mode: cricketMode,
          status: snap?.status,
          suspensionReason: snap?.suspensionReason || null,
        });
        return null;
      }

      recordFallback({
        sport: 'cricket',
        matchId: baseMatch.id || baseMatch.matchId,
        from: 'OddsEngineV5',
        to: 'OddsEngineV4',
        reason: ENGINE_FALLBACK_REASONS.V5_NO_OPEN_WINNER,
        mode: cricketMode,
        status: snap?.status || null,
      });
    } catch (err) {
      recordFallback({
        sport: 'cricket',
        matchId: baseMatch.id || baseMatch.matchId,
        from: 'OddsEngineV5',
        to: 'OddsEngineV4',
        reason: ENGINE_FALLBACK_REASONS.V5_EXCEPTION,
        mode: cricketMode,
        error: err?.message,
      });
    }
  }

  // V4 path (explicit mode or fallback)
  try {
    const snap = generateV4(buildCanonicalFromMatch(baseMatch), { debug: false, winnerOnly: true });
    const priced = attachWinner(baseMatch, snap, 'OddsEngineV4');
    if (priced) return { ...priced, odds: { ...priced.odds, draw: priced.odds.draw ?? null } };
  } catch (err) {
    log.error('OddsEngineV4 fallback failed', { err: err?.message });
  }
  return null;
}

function priceOtherWithMode(baseMatch, otherMode) {
  if (shadowCompareEnabled(otherMode)) {
    try { runOtherSportsShadowCompare(otherSportsMatchPayload(baseMatch)); } catch (err) {
      log.warn('other-sports shadow compare failed', { err });
    }
  }

  const tryV5 = (otherMode === 'v5' || otherMode === 'shadow') && isOtherSportsV5Sport(baseMatch.sport);
  if (tryV5) {
    try {
      const snap = generateOtherSportsV5(otherSportsMatchPayload(baseMatch), {
        debug: false,
        winnerOnly: true,
      });
      const priced = attachWinner(baseMatch, snap, 'OtherSportsEngineV5');
      if (priced) return { ...priced, odds: { ...priced.odds, draw: priced.odds.draw ?? null } };

      if (isIntentionallyUnpriced(snap) && !snapshotHasOpenWinner(snap)) {
        recordFallback({
          sport: baseMatch.sport,
          matchId: baseMatch.id || baseMatch.matchId,
          from: 'OtherSportsEngineV5',
          to: 'none',
          reason: ENGINE_FALLBACK_REASONS.V5_QUALITY_SUSPEND,
          mode: otherMode,
          status: snap?.status,
        });
        return null;
      }

      recordFallback({
        sport: baseMatch.sport,
        matchId: baseMatch.id || baseMatch.matchId,
        from: 'OtherSportsEngineV5',
        to: 'OtherSportsEngineV4',
        reason: ENGINE_FALLBACK_REASONS.V5_NO_OPEN_WINNER,
        mode: otherMode,
        status: snap?.status || null,
      });
    } catch (err) {
      recordFallback({
        sport: baseMatch.sport,
        matchId: baseMatch.id || baseMatch.matchId,
        from: 'OtherSportsEngineV5',
        to: 'OtherSportsEngineV4',
        reason: ENGINE_FALLBACK_REASONS.V5_EXCEPTION,
        mode: otherMode,
        error: err?.message,
      });
    }
  }

  try {
    const snap = generateOtherSportsV4(otherSportsMatchPayload(baseMatch), {
      debug: false,
      winnerOnly: true,
    });
    return attachWinner(baseMatch, snap, 'OtherSportsEngineV4');
  } catch (err) {
    log.error('OtherSportsEngineV4 fallback failed', { err: err?.message });
    return null;
  }
}

function priceWithMode(baseMatch, cricketMode, { isCricket = true } = {}, otherMode = 'v5') {
  if (!isCricket) return priceOtherWithMode(baseMatch, otherMode);
  return priceCricketWithMode(baseMatch, cricketMode);
}

export function priceMatchWinnerForAggregator(baseMatch, { isCricket = true } = {}) {
  const cricketMode = forceLiveForSrl(baseMatch, resolveOddsEngineMode());
  const otherMode = resolveOtherSportsEngineMode();
  return priceWithMode(baseMatch, cricketMode, { isCricket }, otherMode);
}

export async function priceMatchWinnerForAggregatorAsync(baseMatch, opts = {}) {
  const cricketMode = forceLiveForSrl(baseMatch, await resolveOddsEngineModeAsync());
  const otherMode = await resolveOtherSportsEngineModeAsync();
  return priceWithMode(baseMatch, cricketMode, opts, otherMode);
}

function snapshotWithMode(matchObj, cricketMode, otherMode, config = {}) {
  const cricket = isCricketSport(matchObj.sport);
  const effectiveCricketMode = forceLiveForSrl(matchObj, cricketMode);

  if (!cricket) {
    const { raw, engine, engineVersion, mode, fallbackReason } = generateOtherSportsRaw(matchObj, otherMode, config);
    const publicSnapshot = adaptV3SnapshotToPublicContract(raw, matchObj);
    if (publicSnapshot) {
      publicSnapshot.engine = engine;
      if (engineVersion) publicSnapshot.engineVersion = engineVersion;
      publicSnapshot.source = engine === 'OtherSportsEngineV5'
        ? 'OTHER_SPORTS_ENGINE_V5'
        : 'OTHER_SPORTS_ENGINE_V4';
      if (fallbackReason) publicSnapshot.engineFallbackReason = fallbackReason;
    }
    return { rawSnapshot: raw, publicSnapshot, mode, fallbackReason: fallbackReason || null };
  }

  if (shadowCompareEnabled(effectiveCricketMode) || shadowCompareEnabled(cricketMode)) {
    try { runShadowCompare(matchObj); } catch (err) { log.warn('cricket shadow compare failed', { err }); }
  }

  const preferV5 = effectiveCricketMode === 'v5'
    || effectiveCricketMode === 'shadow'
    || (cricketMode === 'shadow' && isMatchSRL(matchObj));

  if (preferV5) {
    try {
      const raw = generateV5(buildCanonicalFromMatch(matchObj), config);
      const hasOpen = (raw?.markets || []).some((m) => m?.status === 'OPEN');
      // Keep intentional suspends as V5 (do not reopen via V4).
      if (hasOpen || isIntentionallyUnpriced(raw)) {
        const publicSnapshot = adaptV3SnapshotToPublicContract(raw, matchObj);
        if (publicSnapshot) {
          publicSnapshot.engine = 'OddsEngineV5';
          publicSnapshot.engineVersion = V5_ENGINE_VERSION;
          publicSnapshot.source = 'ODDS_ENGINE_V5';
        }
        return {
          rawSnapshot: raw,
          publicSnapshot,
          mode: effectiveCricketMode === 'shadow' ? 'shadow' : 'v5',
          fallbackReason: null,
        };
      }
      recordFallback({
        sport: 'cricket',
        matchId: matchObj.id || matchObj.matchId,
        from: 'OddsEngineV5',
        to: 'OddsEngineV4',
        reason: ENGINE_FALLBACK_REASONS.V5_EMPTY_BOOK,
        mode: effectiveCricketMode,
        status: raw?.status || null,
      });
    } catch (err) {
      recordFallback({
        sport: 'cricket',
        matchId: matchObj.id || matchObj.matchId,
        from: 'OddsEngineV5',
        to: 'OddsEngineV4',
        reason: ENGINE_FALLBACK_REASONS.V5_EXCEPTION,
        mode: effectiveCricketMode,
        error: err?.message,
      });
    }
  }

  const fallbackReason = preferV5
    ? ENGINE_FALLBACK_REASONS.V5_EMPTY_BOOK
    : (effectiveCricketMode === 'v4' ? ENGINE_FALLBACK_REASONS.MODE_V4 : null);
  const rawSnapshot = generateV4(buildCanonicalFromMatch(matchObj), config);
  const publicSnapshot = adaptV3SnapshotToPublicContract(rawSnapshot, matchObj);
  if (publicSnapshot) {
    publicSnapshot.engine = 'OddsEngineV4';
    publicSnapshot.engineVersion = V4_ENGINE_VERSION;
    publicSnapshot.source = 'ODDS_ENGINE_V4';
    if (preferV5) publicSnapshot.engineFallbackReason = fallbackReason || ENGINE_FALLBACK_REASONS.V5_EXCEPTION;
  }
  return {
    rawSnapshot,
    publicSnapshot,
    mode: 'v4',
    fallbackReason,
  };
}

export function generatePublicMatchOddsSnapshot(matchObj, config = {}) {
  return snapshotWithMode(
    matchObj,
    resolveOddsEngineMode(),
    resolveOtherSportsEngineMode(),
    config,
  );
}

export async function generatePublicMatchOddsSnapshotAsync(matchObj, config = {}) {
  const cricketMode = await resolveOddsEngineModeAsync();
  const otherMode = await resolveOtherSportsEngineModeAsync();
  return snapshotWithMode(matchObj, cricketMode, otherMode, config);
}

export { getOtherSportsShadowMetrics, runOtherSportsShadowCompare };
