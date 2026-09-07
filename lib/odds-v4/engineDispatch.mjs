/**
 * Dispatch cricket vs other-sports pricing.
 * Cricket: ODDS_ENGINE / OddsEngineV4 (unchanged).
 * Other sports: OTHER_SPORTS_ENGINE → OtherSportsEngineV4 | V3 otherSportsOdds.
 */

import { generate as generateV3 } from '../odds-v3/OddsEngineV3.mjs';
import { buildCanonicalFromMatch } from '../odds-v3/buildCanonicalFromMatch.mjs';
import { extractMatchWinnerOdds } from '../odds-v3/extractMatchWinnerOdds.mjs';
import { adaptV3SnapshotToPublicContract } from '../odds-v3/adapters/V3ApiAdapter.mjs';
import { generateOtherSportsSnapshot, isCricketSport } from '../odds-v3/otherSportsOdds.mjs';
import { isMatchSRL } from '../cricketSnapshot.mjs';
import { generate as generateV4 } from './OddsEngineV4.mjs';
import { resolveOddsEngineMode, resolveOddsEngineModeAsync } from './EngineModeControl.mjs';
import {
  generate as generateOtherSportsV4,
  isOtherSportsV4Sport,
  OSV4_ENGINE_VERSION,
} from '../other-sports-v4/OtherSportsEngineV4.mjs';
import {
  resolveOtherSportsEngineMode,
  resolveOtherSportsEngineModeAsync,
} from '../other-sports-v4/EngineModeControl.mjs';
import {
  runOtherSportsShadowCompare,
  getOtherSportsShadowMetrics,
} from '../other-sports-v4/shadowCompare.mjs';

function forceV4ForSrl(match, mode) {
  if (mode === 'shadow') return 'shadow';
  if (isMatchSRL(match)) return 'v4';
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

/** Cricket shadow dual-run ring (in-process metrics). */
const shadowRing = [];
const SHADOW_MAX = 200;

export function runShadowCompare(match) {
  let v3Odds = null;
  let v4Odds = null;
  try {
    const c = buildCanonicalFromMatch(match);
    const s3 = generateV3(c, { winnerOnly: true, debug: false });
    v3Odds = extractMatchWinnerOdds(s3, match);
    const s4 = generateV4(c, { winnerOnly: true, debug: false });
    v4Odds = extractMatchWinnerOdds(s4, match);
  } catch (err) {
    return { error: err.message };
  }
  const fav = (o) => {
    if (!o?.team1 || !o?.team2) return null;
    return Number(o.team1) <= Number(o.team2) ? 'team1' : 'team2';
  };
  const row = {
    at: Date.now(),
    matchId: match.id || match.matchId,
    v3: v3Odds,
    v4: v4Odds,
    sameFav: fav(v3Odds) && fav(v3Odds) === fav(v4Odds),
  };
  shadowRing.push(row);
  if (shadowRing.length > SHADOW_MAX) shadowRing.shift();
  return row;
}

export function getShadowMetrics() {
  const rows = shadowRing.filter((r) => r.v3?.team1 && r.v4?.team1);
  const same = rows.filter((r) => r.sameFav).length;
  return {
    samples: rows.length,
    sameFavRate: rows.length ? same / rows.length : null,
    recent: shadowRing.slice(-15),
    otherSports: getOtherSportsShadowMetrics(),
  };
}

function otherSportsMatchPayload(baseMatch) {
  return {
    ...baseMatch,
    matchId: baseMatch.id || baseMatch.matchId,
  };
}

/**
 * Non-cricket snapshot: OTHER_SPORTS_ENGINE controls V4 vs V3.
 * Never routes through cricket OddsEngineV4 generate().
 */
function generateOtherSportsRaw(matchObj, otherMode, v3Config = {}) {
  const payload = otherSportsMatchPayload(matchObj);
  const osv4Eligible = isOtherSportsV4Sport(matchObj.sport);

  if (otherMode === 'shadow') {
    try { runOtherSportsShadowCompare(payload); } catch { /* ignore */ }
  }

  if (otherMode === 'v4' && osv4Eligible) {
    return {
      raw: generateOtherSportsV4(payload, v3Config),
      engine: 'OtherSportsEngineV4',
      engineVersion: OSV4_ENGINE_VERSION,
      mode: 'v4',
    };
  }

  // v3, shadow (serve V3), or non-P0 sports under v4 → V3 other-sports book
  return {
    raw: generateOtherSportsSnapshot(payload, v3Config),
    engine: 'OddsEngineV3',
    engineVersion: null,
    mode: otherMode === 'shadow' ? 'shadow' : 'v3',
  };
}

function priceWithMode(baseMatch, cricketMode, { isCricket = true } = {}, otherMode = 'v3') {
  if (!isCricket) {
    if (otherMode === 'shadow') {
      try { runOtherSportsShadowCompare(otherSportsMatchPayload(baseMatch)); } catch { /* ignore */ }
    }
    const useOsv4 = otherMode === 'v4' && isOtherSportsV4Sport(baseMatch.sport);
    if (useOsv4) {
      const snap = generateOtherSportsV4(otherSportsMatchPayload(baseMatch), {
        debug: false,
        winnerOnly: true,
      });
      const priced = attachWinner(baseMatch, snap, 'OtherSportsEngineV4');
      if (priced) return { ...priced, odds: { ...priced.odds, draw: priced.odds.draw ?? null } };
      return null;
    }
    const snapshot = generateV3(otherSportsMatchPayload(baseMatch), {
      debug: false,
      winnerOnly: true,
    });
    return attachWinner(baseMatch, snapshot, 'OddsEngineV3');
  }

  if (cricketMode === 'shadow') {
    try { runShadowCompare(baseMatch); } catch { /* ignore */ }
  }

  if (cricketMode === 'v4') {
    const snap = generateV4(buildCanonicalFromMatch(baseMatch), { debug: false, winnerOnly: true });
    const priced = attachWinner(baseMatch, snap, 'OddsEngineV4');
    if (priced) return { ...priced, odds: { ...priced.odds, draw: priced.odds.draw ?? null } };
    return null;
  }

  const snap = generateV3(buildCanonicalFromMatch(baseMatch), { debug: false, winnerOnly: true });
  const priced = attachWinner(baseMatch, snap, 'OddsEngineV3');
  if (priced) return { ...priced, odds: { ...priced.odds, draw: priced.odds.draw ?? null } };
  return null;
}

export function priceMatchWinnerForAggregator(baseMatch, { isCricket = true } = {}) {
  const cricketMode = forceV4ForSrl(baseMatch, resolveOddsEngineMode());
  const otherMode = resolveOtherSportsEngineMode();
  return priceWithMode(baseMatch, cricketMode, { isCricket }, otherMode);
}

export async function priceMatchWinnerForAggregatorAsync(baseMatch, opts = {}) {
  const cricketMode = forceV4ForSrl(baseMatch, await resolveOddsEngineModeAsync());
  const otherMode = await resolveOtherSportsEngineModeAsync();
  return priceWithMode(baseMatch, cricketMode, opts, otherMode);
}

function snapshotWithMode(matchObj, cricketMode, otherMode, v3Config = {}) {
  const cricket = isCricketSport(matchObj.sport);
  const effectiveCricketMode = forceV4ForSrl(matchObj, cricketMode);

  if (!cricket) {
    const { raw, engine, engineVersion, mode } = generateOtherSportsRaw(matchObj, otherMode, v3Config);
    const publicSnapshot = adaptV3SnapshotToPublicContract(raw, matchObj);
    if (publicSnapshot) {
      publicSnapshot.engine = engine;
      if (engineVersion) publicSnapshot.engineVersion = engineVersion;
      publicSnapshot.source = engine === 'OtherSportsEngineV4' ? 'OTHER_SPORTS_ENGINE_V4' : 'ODDS_ENGINE_V3';
    }
    return { rawSnapshot: raw, publicSnapshot, mode };
  }

  if (cricketMode === 'shadow' || effectiveCricketMode === 'shadow') {
    try { runShadowCompare(matchObj); } catch { /* ignore */ }
  }

  const useV4 = effectiveCricketMode === 'v4' || (cricketMode === 'shadow' && isMatchSRL(matchObj));

  if (useV4) {
    const raw = generateV4(buildCanonicalFromMatch(matchObj), v3Config);
    const publicSnapshot = adaptV3SnapshotToPublicContract(raw, matchObj);
    if (publicSnapshot) {
      publicSnapshot.engine = 'OddsEngineV4';
      publicSnapshot.engineVersion = '4.6.0';
      publicSnapshot.source = 'ODDS_ENGINE_V4';
    }
    return { rawSnapshot: raw, publicSnapshot, mode: 'v4' };
  }

  const rawSnapshot = generateV3(buildCanonicalFromMatch(matchObj), v3Config);
  const publicSnapshot = adaptV3SnapshotToPublicContract(rawSnapshot, matchObj);
  return { rawSnapshot, publicSnapshot, mode: cricketMode === 'shadow' ? 'shadow' : 'v3' };
}

export function generatePublicMatchOddsSnapshot(matchObj, v3Config = {}) {
  return snapshotWithMode(
    matchObj,
    resolveOddsEngineMode(),
    resolveOtherSportsEngineMode(),
    v3Config,
  );
}

export async function generatePublicMatchOddsSnapshotAsync(matchObj, v3Config = {}) {
  const cricketMode = await resolveOddsEngineModeAsync();
  const otherMode = await resolveOtherSportsEngineModeAsync();
  return snapshotWithMode(matchObj, cricketMode, otherMode, v3Config);
}

export { getOtherSportsShadowMetrics, runOtherSportsShadowCompare };
