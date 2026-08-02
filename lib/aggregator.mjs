/**
 * Live Scores Aggregator — server-side merge, dedup, and cache layer.
 * Combines results from Cricbuzz, FanCode, and ESPN into a single response.
 */

import { fetchCricbuzzMatches } from './cricbuzzLiveScores.mjs';
import { fetchFanCodeLiveScores } from './fancodeLiveScores.mjs';
import { fetchEspnLiveScores } from './espnLiveScores.mjs';

// ---------------------------------------------------------------------------
// Source priority — higher number = preferred when both have equal score data
// ---------------------------------------------------------------------------
const SOURCE_PRIORITY = { cricbuzz: 4, fancode: 3, espn: 2 };

// ---------------------------------------------------------------------------
// Team name normalization for dedup matching
// ---------------------------------------------------------------------------
function normalizeTeamName(name = '') {
  return String(name)
    .toLowerCase()
    .replace(/\(men\)|\(women\)/gi, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getMatchPairKey(match) {
  return match.pairKey
    || [normalizeTeamName(match.team1?.name), normalizeTeamName(match.team2?.name)].sort().join('|');
}

// ---------------------------------------------------------------------------
// Merge logic — pick the best version of a match when duplicated across sources
// ---------------------------------------------------------------------------
function hasScoreData(match) {
  if (match.sport === 'cricket') {
    return (match.liveDetails?.runs > 0 || match.liveDetails?.score2 > 0);
  }
  return (match.liveDetails?.score1 > 0 || match.liveDetails?.score2 > 0);
}

function pickPreferredMatch(existing, incoming) {
  const existingPriority = SOURCE_PRIORITY[existing.source] || 0;
  const incomingPriority = SOURCE_PRIORITY[incoming.source] || 0;
  const existingHasScore = hasScoreData(existing);
  const incomingHasScore = hasScoreData(incoming);

  let preferred = incomingPriority >= existingPriority ? incoming : existing;
  let fallback = preferred === incoming ? existing : incoming;

  if (incomingHasScore && !existingHasScore) {
    preferred = incoming;
    fallback = existing;
  } else if (existingHasScore && !incomingHasScore) {
    preferred = existing;
    fallback = incoming;
  }

  return {
    ...fallback,
    ...preferred,
    liveDetails: {
      ...fallback.liveDetails,
      ...preferred.liveDetails,
    },
    isLive: preferred.isLive || fallback.isLive,
    matchState: preferred.isLive ? preferred.matchState : fallback.matchState,
    time: preferred.isLive ? preferred.time : (preferred.time || fallback.time),
  };
}

function mergeLiveScoreSources(...sourceLists) {
  const merged = new Map();

  for (const matches of sourceLists) {
    for (const match of matches) {
      const key = getMatchPairKey(match);
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, match);
        continue;
      }
      merged.set(key, pickPreferredMatch(existing, match));
    }
  }

  return [...merged.values()];
}

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------
let cachedResponse = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30_000; // 30 seconds

function isCacheValid() {
  return cachedResponse && (Date.now() - cacheTimestamp) < CACHE_TTL_MS;
}

// ---------------------------------------------------------------------------
// Main aggregation function
// ---------------------------------------------------------------------------
export async function aggregateLiveScores() {
  // Return cached data if still fresh
  if (isCacheValid()) {
    return { ...cachedResponse, cached: true };
  }

  const sourceStatus = { cricbuzz: 'pending', fancode: 'pending', espn: 'pending' };

  // Fetch all sources in parallel
  let cricbuzzResult = { matches: [], series: [], counts: {} };
  let fancodeResult = { matches: [], counts: {} };
  let espnResult = { matches: [], counts: {} };

  const [cbSettled, fcSettled, espnSettled] = await Promise.allSettled([
    fetchCricbuzzMatches(),
    fetchFanCodeLiveScores(),
    fetchEspnLiveScores(),
  ]);

  if (cbSettled.status === 'fulfilled') {
    cricbuzzResult = cbSettled.value;
    sourceStatus.cricbuzz = 'ok';
  } else {
    sourceStatus.cricbuzz = 'error';
    console.warn('[Aggregator] Cricbuzz fetch error:', cbSettled.reason?.message || cbSettled.reason);
  }

  if (fcSettled.status === 'fulfilled') {
    fancodeResult = fcSettled.value;
    sourceStatus.fancode = 'ok';
  } else {
    sourceStatus.fancode = 'error';
    console.warn('[Aggregator] FanCode fetch error:', fcSettled.reason?.message || fcSettled.reason);
  }

  if (espnSettled.status === 'fulfilled') {
    espnResult = espnSettled.value;
    sourceStatus.espn = 'ok';
  } else {
    sourceStatus.espn = 'error';
    console.warn('[Aggregator] ESPN fetch error:', espnSettled.reason?.message || espnSettled.reason);
  }

  // Merge all matches with priority-based dedup
  const matches = mergeLiveScoreSources(
    cricbuzzResult.matches || [],
    fancodeResult.matches || [],
    espnResult.matches || [],
  );

  const liveCount = matches.filter((m) => m.isLive).length;
  const cricketCount = matches.filter((m) => m.sport === 'cricket').length;
  const soccerCount = matches.filter((m) => m.sport === 'soccer').length;

  const response = {
    matches,
    series: cricbuzzResult.series || [],
    counts: {
      total: matches.length,
      live: liveCount,
      cricket: cricketCount,
      soccer: soccerCount,
      cricbuzzTotal: cricbuzzResult.counts?.total || cricbuzzResult.matches?.length || 0,
      fancodeTotal: fancodeResult.counts?.total || fancodeResult.matches?.length || 0,
      espnTotal: espnResult.counts?.total || espnResult.matches?.length || 0,
    },
    sources: sourceStatus,
    fetchedAt: new Date().toISOString(),
    cached: false,
  };

  // Update cache
  cachedResponse = response;
  cacheTimestamp = Date.now();

  return response;
}
