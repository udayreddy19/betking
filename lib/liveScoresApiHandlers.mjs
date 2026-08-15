import { aggregateLiveScores, getCachedAggregatedLiveScores } from './aggregator.mjs';
import { fetchMatchDetail } from './matchDetailFetcher.mjs';
import { LIVE_SCORES_POLL_MS } from './livePolling.mjs';
import { generate as generateV3 } from './odds-v3/OddsEngineV3.mjs';
import { buildCanonicalFromMatch } from './odds-v3/buildCanonicalFromMatch.mjs';
import { adaptV3SnapshotToPublicContract } from './odds-v3/adapters/V3ApiAdapter.mjs';

function flag(value) {
  return value === '1' || value === 'true';
}

const matchOddsCache = new Map();
const MATCH_ODDS_TTL_MS = 4_000;

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
} = {}) {
  if (!matchId) {
    const err = new Error('matchId required');
    err.statusCode = 400;
    throw err;
  }

  const cacheKey = `${matchId}|${team1 || ''}|${team2 || ''}`;
  const cached = matchOddsCache.get(cacheKey);
  if (!force && cached && (Date.now() - cached.at < MATCH_ODDS_TTL_MS)) {
    return cached.data;
  }

  const aggregated =
    getCachedAggregatedLiveScores()
    || await aggregateLiveScores({ force: false });
  let matchObj = (aggregated?.matches || []).find(
    (m) => m.id === matchId || m.matchId === matchId,
  ) || null;

  if (!matchObj) {
    matchObj = {
      id: matchId,
      matchId,
      sport: 'cricket',
      isLive: true,
      matchState: 'in',
      team1: { name: team1 || 'Team 1' },
      team2: { name: team2 || 'Team 2' },
      liveDetails: {},
    };
  }

  if (team1) {
    matchObj = {
      ...matchObj,
      team1: { ...(typeof matchObj.team1 === 'object' ? matchObj.team1 : {}), name: String(team1) },
    };
  }
  if (team2) {
    matchObj = {
      ...matchObj,
      team2: { ...(typeof matchObj.team2 === 'object' ? matchObj.team2 : {}), name: String(team2) },
    };
  }

  const canonical = buildCanonicalFromMatch(matchObj);
  const rawSnapshot = generateV3(canonical, { debug: false });
  const publicSnapshot = adaptV3SnapshotToPublicContract(rawSnapshot, matchObj);
  const payload = {
    success: true,
    ...publicSnapshot,
    cached: false,
  };

  matchOddsCache.set(cacheKey, { at: Date.now(), data: { ...payload, cached: true } });
  return payload;
}
