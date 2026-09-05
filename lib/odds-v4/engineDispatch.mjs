/**
 * Shared OddsEngine mode dispatch for aggregator + match-odds API.
 * Modes: v3 (default) | shadow | v4
 */

import { generate as generateV3 } from '../odds-v3/OddsEngineV3.mjs';
import { buildCanonicalFromMatch } from '../odds-v3/buildCanonicalFromMatch.mjs';
import { extractMatchWinnerOdds } from '../odds-v3/extractMatchWinnerOdds.mjs';
import { adaptV3SnapshotToPublicContract } from '../odds-v3/adapters/V3ApiAdapter.mjs';
import { isCricketSport } from '../odds-v3/otherSportsOdds.mjs';
import { generate as generateV4, buildCanonicalFromMatchV4 } from './OddsEngineV4.mjs';
import { extractMatchWinnerOddsV4 } from './adapters/extractWinnerOdds.mjs';
import { runShadowCompare } from './shadow/ShadowHarness.mjs';
import { resolveOddsEngineMode, evaluateCutoverReadiness } from './shadow/CutoverGate.mjs';

export { resolveOddsEngineMode, evaluateCutoverReadiness };

function attachWinnerFromExtract(baseMatch, winner, oddsSource) {
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

/**
 * Price cricket list-card winner odds according to ODDS_ENGINE mode.
 * Non-cricket always stays on V3.
 */
export function priceMatchWinnerForAggregator(baseMatch, { isCricket = true } = {}) {
  const mode = resolveOddsEngineMode();

  if (!isCricket) {
    const snapshot = generateV3({
      ...baseMatch,
      matchId: baseMatch.id || baseMatch.matchId,
    }, { debug: false, winnerOnly: true });
    const winner = extractMatchWinnerOdds(snapshot, baseMatch);
    return attachWinnerFromExtract(baseMatch, winner, 'OddsEngineV3');
  }

  if (mode === 'shadow') {
    try {
      runShadowCompare(baseMatch);
    } catch {
      // Shadow never blocks customer pricing.
    }
  }

  if (mode === 'v4') {
    // Exclusive: V4 on means V3 publish path is off for cricket.
    const c4 = buildCanonicalFromMatchV4(baseMatch);
    const snap = generateV4(c4, { winnerOnly: true, debug: false });
    const winner = extractMatchWinnerOddsV4(snap, baseMatch);
    const priced = attachWinnerFromExtract(baseMatch, winner, 'OddsEngineV4');
    if (priced) {
      return {
        ...priced,
        odds: { ...priced.odds, draw: priced.odds.draw ?? null },
      };
    }
    return null;
  }

  const canonical = buildCanonicalFromMatch(baseMatch);
  const snapshot = generateV3(canonical, { debug: false, winnerOnly: true });
  const winner = extractMatchWinnerOdds(snapshot, baseMatch);
  const priced = attachWinnerFromExtract(baseMatch, winner, 'OddsEngineV3');
  if (priced) {
    return {
      ...priced,
      odds: { ...priced.odds, draw: priced.odds.draw ?? null },
    };
  }
  return null;
}

/**
 * Full match-detail book snapshot (adapted to public contract).
 */
export function generatePublicMatchOddsSnapshot(matchObj, v3Config = {}) {
  const mode = resolveOddsEngineMode();
  const cricket = isCricketSport(matchObj.sport);

  if (cricket && mode === 'shadow') {
    try {
      runShadowCompare(matchObj);
    } catch {
      // ignore
    }
  }

  if (cricket && mode === 'v4') {
    const raw = generateV4(buildCanonicalFromMatchV4(matchObj), {
      debug: false,
      enableP3: process.env.ODDS_V4_ENABLE_P3 === '1',
      ...(v3Config.margins ? { margins: v3Config.margins } : {}),
    });
    const publicSnapshot = adaptV3SnapshotToPublicContract({
      ...raw,
      engine: 'OddsEngineV4',
      engineVersion: '4.0.0',
    }, matchObj);
    if (publicSnapshot) {
      publicSnapshot.source = 'ODDS_ENGINE_V4';
      publicSnapshot.engineVersion = '4.0.0';
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
