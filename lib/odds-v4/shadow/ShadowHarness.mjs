/**
 * Shadow dual-run: V3 vs V4 vs optional 10cric reference.
 * Never publishes 10cric prices — reference only.
 */

import { generate as generateV3 } from '../../odds-v3/OddsEngineV3.mjs';
import { buildCanonicalFromMatch } from '../../odds-v3/buildCanonicalFromMatch.mjs';
import { extractMatchWinnerOdds } from '../../odds-v3/extractMatchWinnerOdds.mjs';
import { generate as generateV4, buildCanonicalFromMatchV4 } from '../OddsEngineV4.mjs';
import { extractMatchWinnerOddsV4 } from '../adapters/extractWinnerOdds.mjs';
import { getCanonicalMatchPairKey } from '../../matchPairKey.mjs';

const ring = [];
const RING_MAX = 500;

function shortPrice(o) {
  if (!o?.team1 || !o?.team2) return null;
  return Math.min(Number(o.team1), Number(o.team2));
}

function favoriteSide(o) {
  if (!o?.team1 || !o?.team2) return null;
  return Number(o.team1) <= Number(o.team2) ? 'team1' : 'team2';
}

export function compareWinnerBooks(v3Odds, v4Odds, refOdds = null) {
  const sameFavV3V4 = favoriteSide(v3Odds) && favoriteSide(v3Odds) === favoriteSide(v4Odds);
  const sameFavV4Ref = refOdds && favoriteSide(v4Odds) && favoriteSide(v4Odds) === favoriteSide(refOdds);
  const deltaShortV4Ref = (refOdds && shortPrice(v4Odds) != null && shortPrice(refOdds) != null)
    ? Math.abs(shortPrice(v4Odds) - shortPrice(refOdds))
    : null;
  return {
    sameFavV3V4: Boolean(sameFavV3V4),
    sameFavV4Ref: refOdds ? Boolean(sameFavV4Ref) : null,
    deltaShortV4Ref,
    v3: v3Odds,
    v4: v4Odds,
    ref: refOdds,
  };
}

/**
 * @param {object} match
 * @param {{ referenceOdds?: { home:number, away:number }, enableP3?: boolean }} [opts]
 */
export function runShadowCompare(match, opts = {}) {
  let v3Odds = { team1: null, team2: null, status: 'ERROR' };
  let v4Odds = { team1: null, team2: null, status: 'ERROR' };
  let v3Snap = null;
  let v4Snap = null;

  try {
    const c3 = buildCanonicalFromMatch(match);
    v3Snap = generateV3(c3, { winnerOnly: true, debug: false });
    v3Odds = extractMatchWinnerOdds(v3Snap, match);
  } catch (err) {
    v3Odds = { team1: null, team2: null, status: 'ERROR', error: err.message };
  }

  try {
    const c4 = buildCanonicalFromMatchV4(match);
    v4Snap = generateV4(c4, { winnerOnly: true, enableP3: Boolean(opts.enableP3) });
    v4Odds = extractMatchWinnerOddsV4(v4Snap, match);
  } catch (err) {
    v4Odds = { team1: null, team2: null, status: 'ERROR', error: err.message };
  }

  let refOdds = null;
  if (opts.referenceOdds?.home > 1 && opts.referenceOdds?.away > 1) {
    refOdds = {
      team1: Number(opts.referenceOdds.home),
      team2: Number(opts.referenceOdds.away),
      home: Number(opts.referenceOdds.home),
      away: Number(opts.referenceOdds.away),
      status: 'OPEN',
    };
  } else if (match.marketReferenceData?.providerOdds?.home > 1) {
    const p = match.marketReferenceData.providerOdds;
    refOdds = {
      team1: Number(p.home ?? p.team1),
      team2: Number(p.away ?? p.team2),
      home: Number(p.home ?? p.team1),
      away: Number(p.away ?? p.team2),
      status: 'OPEN',
    };
  }

  const comparison = compareWinnerBooks(v3Odds, v4Odds, refOdds);
  const row = {
    at: Date.now(),
    matchId: match.id || match.matchId,
    pairKey: getCanonicalMatchPairKey(match),
    teams: `${match.team1?.name || '?'} vs ${match.team2?.name || '?'}`,
    ...comparison,
  };

  ring.push(row);
  if (ring.length > RING_MAX) ring.shift();

  return {
    ...row,
    v3SnapshotStatus: v3Snap?.status,
    v4SnapshotStatus: v4Snap?.status,
    v4Format: v4Snap?.meta?.format,
    v4Phase: v4Snap?.meta?.phase,
  };
}

export function getShadowMetrics() {
  const rows = ring.filter((r) => r.v4?.status === 'OPEN' && r.ref?.status === 'OPEN');
  const sameFav = rows.filter((r) => r.sameFavV4Ref).length;
  const deltas = rows.map((r) => r.deltaShortV4Ref).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  const medianDelta = deltas.length ? deltas[Math.floor(deltas.length / 2)] : null;
  return {
    samples: rows.length,
    sameFavRate: rows.length ? sameFav / rows.length : null,
    medianShortDelta: medianDelta,
    ringSize: ring.length,
    recent: ring.slice(-20),
  };
}

export function clearShadowRing() {
  ring.length = 0;
}
