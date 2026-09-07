/**
 * Shadow dual-run metrics for OtherSportsEngineV4 vs V3 other-sports book.
 */

import { generateOtherSportsSnapshot } from '../odds-v3/otherSportsOdds.mjs';
import { extractMatchWinnerOdds } from '../odds-v3/extractMatchWinnerOdds.mjs';
import { generate as generateV4 } from './OtherSportsEngineV4.mjs';
import { bookPoints } from './book/helpers.mjs';

const shadowRing = [];
const SHADOW_MAX = 200;

function favSide(o) {
  if (!o?.team1 || !o?.team2) return null;
  if (o.draw != null && o.draw > 1) {
    const vals = [
      { side: 'team1', odds: Number(o.team1) },
      { side: 'draw', odds: Number(o.draw) },
      { side: 'team2', odds: Number(o.team2) },
    ];
    vals.sort((a, b) => a.odds - b.odds);
    return vals[0].side;
  }
  return Number(o.team1) <= Number(o.team2) ? 'team1' : 'team2';
}

export function runOtherSportsShadowCompare(match) {
  let v3Odds = null;
  let v4Odds = null;
  let v4MwPoints = null;
  try {
    const s3 = generateOtherSportsSnapshot(match, { winnerOnly: true, allowModelOnly: true });
    v3Odds = extractMatchWinnerOdds(s3, match);
    const s4 = generateV4(match, { winnerOnly: true, allowModelOnly: true });
    v4Odds = extractMatchWinnerOdds(s4, match);
    const mw = (s4.markets || []).find((m) => m.marketId === 'match_winner');
    v4MwPoints = mw ? bookPoints(mw.selections) : null;
  } catch (err) {
    return { error: err.message };
  }
  const row = {
    at: Date.now(),
    matchId: match.id || match.matchId,
    sport: match.sport,
    v3: v3Odds,
    v4: v4Odds,
    v4MwPoints,
    sameFav: favSide(v3Odds) && favSide(v3Odds) === favSide(v4Odds),
  };
  shadowRing.push(row);
  if (shadowRing.length > SHADOW_MAX) shadowRing.shift();
  return row;
}

export function getOtherSportsShadowMetrics() {
  const rows = shadowRing.filter((r) => r.v3?.team1 && r.v4?.team1);
  const same = rows.filter((r) => r.sameFav).length;
  return {
    samples: rows.length,
    sameFavRate: rows.length ? same / rows.length : null,
    recent: shadowRing.slice(-15),
  };
}
