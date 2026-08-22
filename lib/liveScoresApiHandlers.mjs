import { aggregateLiveScores, getCachedAggregatedLiveScores } from './aggregator.mjs';
import { fetchMatchDetail } from './matchDetailFetcher.mjs';
import { LIVE_SCORES_POLL_MS } from './livePolling.mjs';
import { generate as generateV3 } from './odds-v3/OddsEngineV3.mjs';
import { buildCanonicalFromMatch } from './odds-v3/buildCanonicalFromMatch.mjs';
import { adaptV3SnapshotToPublicContract } from './odds-v3/adapters/V3ApiAdapter.mjs';
import { isCricketSport } from './odds-v3/otherSportsOdds.mjs';
import { getIplSrlMatchById, getIplSrlMatches } from './iplSrlSimulator.mjs';
import { applyLiveOddsOverlay, matchOddsStateKey } from './matchOddsStateKey.mjs';
import { matchIdAliases, matchIdsEqual } from './matchIdPublic.mjs';

function flag(value) {
  return value === '1' || value === 'true';
}

const matchOddsCache = new Map();
const matchOddsInFlight = new Map();
const MATCH_ODDS_TTL_MS = 2_000;

function findMatchInList(matches, matchId) {
  if (!matchId || !Array.isArray(matches)) return null;
  const aliases = new Set(matchIdAliases(matchId));
  return matches.find((m) => {
    const id = String(m.id || m.matchId || '');
    return aliases.has(id) || matchIdsEqual(id, matchId);
  }) || null;
}

function resolveMatchObject(matchId) {
  const fromCache = findMatchInList(getCachedAggregatedLiveScores()?.matches, matchId);
  if (fromCache) return fromCache;

  if (String(matchId).startsWith('srl_') || String(matchId).includes('srl')) {
    const srl = findMatchInList(getIplSrlMatches() || [], matchId)
      || getIplSrlMatchById(matchId);
    if (srl) return srl;
  }

  return null;
}

export function matchFromQuery(get) {
  const isLive = flag(get('isLive'));
  return {
    id: get('matchId') || get('id'),
    sport: get('sport') || 'cricket',
    source: get('source') || '',
    league: get('league') || '',
    isLive: isLive || undefined,
    matchState: get('matchState') || (isLive ? 'in' : undefined),
    cricbuzzMatchId: get('cricbuzzMatchId') ? Number(get('cricbuzzMatchId')) : undefined,
    espnEventId: get('espnEventId') || undefined,
    espnPath: get('espnPath') || undefined,
    fancodeMatchId: get('fancodeMatchId') || undefined,
    team1: { name: get('team1') || '' },
    team2: { name: get('team2') || '' },
  };
}

export async function buildLiveScoresPayload({ force = false } = {}) {
  const payload = await aggregateLiveScores({ force });
  return { ...payload, pollIntervalMs: LIVE_SCORES_POLL_MS };
}

export async function buildMatchDetailPayload(get, { fast = false } = {}) {
  const match = matchFromQuery(get);
  if (!match.id) {
    const err = new Error('matchId query param required');
    err.statusCode = 400;
    throw err;
  }
  return fetchMatchDetail(match, { fast });
}

/**
 * Fast authoritative odds snapshot.
 * Uses the warm live-scores aggregator cache — does NOT wait on match-detail scrapes.
 */
export async function buildMatchOddsPayload({
  matchId,
  team1,
  team2,
  force = false,
  stateKey = '',
  overlay = {},
} = {}) {
  if (!matchId) {
    const err = new Error('matchId required');
    err.statusCode = 400;
    throw err;
  }

  const flightKey = `${matchId}|${stateKey || matchOddsStateKey({ liveDetails: overlay })}`;
  if (!force && matchOddsInFlight.has(flightKey)) {
    return matchOddsInFlight.get(flightKey);
  }

  const run = (async () => {
    let matchObj = resolveMatchObject(matchId);

    if (!matchObj) {
      const aggregated = await aggregateLiveScores({ force: false });
      matchObj = findMatchInList(aggregated?.matches, matchId);
    }

    if (!matchObj) {
      const err = new Error('Match not found or not available');
      err.statusCode = 404;
      err.code = 'NOT_AVAILABLE';
      throw err;
    }

    if (team1 && matchObj.team1) {
      matchObj = {
        ...matchObj,
        team1: { ...(typeof matchObj.team1 === 'object' ? matchObj.team1 : {}), name: String(team1) },
      };
    }
    if (team2 && matchObj.team2) {
      matchObj = {
        ...matchObj,
        team2: { ...(typeof matchObj.team2 === 'object' ? matchObj.team2 : {}), name: String(team2) },
      };
    }

    matchObj = applyLiveOddsOverlay(matchObj, overlay);
    const liveKey = `${matchId}|${matchOddsStateKey(matchObj)}`;

    if (!force) {
      const cached = matchOddsCache.get(liveKey);
      if (cached && (Date.now() - cached.at < MATCH_ODDS_TTL_MS)) {
        return cached.data;
      }
    }

    const rawSnapshot = isCricketSport(matchObj.sport)
      ? generateV3(buildCanonicalFromMatch(matchObj), { debug: false })
      : generateV3({
        ...matchObj,
        matchId: matchObj.id || matchObj.matchId || matchId,
      }, { debug: false });
    const publicSnapshot = adaptV3SnapshotToPublicContract(rawSnapshot, matchObj);
    const payload = {
      success: true,
      ...publicSnapshot,
      cached: false,
    };

    matchOddsCache.set(liveKey, { at: Date.now(), data: { ...payload, cached: true } });
    try {
      const { broadcastOddsSnapshot } = await import('./websocketEngine.mjs');
      broadcastOddsSnapshot(matchId, payload);
    } catch {
      // WS is optional in vite-plugin / test environments
    }
    return payload;
  })();

  matchOddsInFlight.set(flightKey, run);
  try {
    return await run;
  } finally {
    matchOddsInFlight.delete(flightKey);
  }
}
