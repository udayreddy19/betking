/**
 * Dispatch cricket pricing by ODDS_ENGINE / admin toggle.
 */

import { generate as generateV3 } from '../odds-v3/OddsEngineV3.mjs';
import { buildCanonicalFromMatch } from '../odds-v3/buildCanonicalFromMatch.mjs';
import { extractMatchWinnerOdds } from '../odds-v3/extractMatchWinnerOdds.mjs';
import { adaptV3SnapshotToPublicContract } from '../odds-v3/adapters/V3ApiAdapter.mjs';
import { isCricketSport } from '../odds-v3/otherSportsOdds.mjs';
import { generate as generateV4 } from './OddsEngineV4.mjs';
import { resolveOddsEngineMode, resolveOddsEngineModeAsync } from './EngineModeControl.mjs';

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

/** Shadow dual-run ring (in-process metrics). */
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
  };
}

function priceWithMode(baseMatch, mode, { isCricket = true } = {}) {
  if (!isCricket) {
    const snapshot = generateV3({
      ...baseMatch,
      matchId: baseMatch.id || baseMatch.matchId,
    }, { debug: false, winnerOnly: true });
    return attachWinner(baseMatch, snapshot, 'OddsEngineV3');
  }

  if (mode === 'shadow') {
    try { runShadowCompare(baseMatch); } catch { /* ignore */ }
  }

  if (mode === 'v4') {
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
  return priceWithMode(baseMatch, resolveOddsEngineMode(), { isCricket });
}

export async function priceMatchWinnerForAggregatorAsync(baseMatch, opts = {}) {
  const mode = await resolveOddsEngineModeAsync();
  return priceWithMode(baseMatch, mode, opts);
}

function snapshotWithMode(matchObj, mode, v3Config = {}) {
  const cricket = isCricketSport(matchObj.sport);

  if (cricket && mode === 'shadow') {
    try { runShadowCompare(matchObj); } catch { /* ignore */ }
  }

  if (cricket && mode === 'v4') {
    const raw = generateV4(buildCanonicalFromMatch(matchObj), v3Config);
    const publicSnapshot = adaptV3SnapshotToPublicContract(raw, matchObj);
    if (publicSnapshot) {
      publicSnapshot.engine = 'OddsEngineV4';
      publicSnapshot.engineVersion = '4.2.0';
      publicSnapshot.source = 'ODDS_ENGINE_V4';
    }
    return { rawSnapshot: raw, publicSnapshot, mode: 'v4' };
  }

  const rawSnapshot = cricket
    ? generateV3(buildCanonicalFromMatch(matchObj), v3Config)
    : generateV3({
      ...matchObj,
      matchId: matchObj.id || matchObj.matchId,
    }, v3Config);
  const publicSnapshot = adaptV3SnapshotToPublicContract(rawSnapshot, matchObj);
  return { rawSnapshot, publicSnapshot, mode: mode === 'shadow' ? 'shadow' : 'v3' };
}

export function generatePublicMatchOddsSnapshot(matchObj, v3Config = {}) {
  return snapshotWithMode(matchObj, resolveOddsEngineMode(), v3Config);
}

export async function generatePublicMatchOddsSnapshotAsync(matchObj, v3Config = {}) {
  const mode = await resolveOddsEngineModeAsync();
  return snapshotWithMode(matchObj, mode, v3Config);
}
