/**
 * Live Scores Aggregator — server-side merge, dedup, and cache layer.
 * Combines results from Cricbuzz, FanCode, and ESPN into a single response.
 */

import { fetchCricbuzzMatches } from './cricbuzzLiveScores.mjs';
import { fetchFanCodeLiveScores } from './fancodeLiveScores.mjs';
import { fetchEspnLiveScores } from './espnLiveScores.mjs';
import { fetchCrexCricketMatches } from './crexCricketProvider.mjs';
import { getIplSrlMatches } from './iplSrlSimulator.mjs';
import { normalizeMatchLiveFlags, getMatchState } from './matchState.mjs';
import { AGGREGATOR_CACHE_TTL_MS } from './livePolling.mjs';

// ---------------------------------------------------------------------------
// Source priority — higher number = preferred when both have equal score data
// ---------------------------------------------------------------------------
const SOURCE_PRIORITY = { crex: 5, cricbuzz: 4, fancode: 3, espn: 2 };

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

function isCacheValid() {
  if (!cachedResponse) return false;
  return (Date.now() - cacheTimestamp) < AGGREGATOR_CACHE_TTL_MS;
}

// ---------------------------------------------------------------------------
// Main aggregation function
// ---------------------------------------------------------------------------
export async function aggregateLiveScores(opts = {}) {
  // Return cached data if still fresh (unless force refresh requested)
  if (!opts.force && isCacheValid()) {
    return { ...cachedResponse, cached: true };
  }

  const sourceStatus = { crex: 'pending', cricbuzz: 'pending', fancode: 'pending', espn: 'pending' };

  // Fetch all sources in parallel
  let crexResult = { matches: [], counts: {} };
  let cricbuzzResult = { matches: [], series: [], counts: {} };
  let fancodeResult = { matches: [], counts: {} };
  let espnResult = { matches: [], counts: {} };

  const [crexSettled, cbSettled, fcSettled, espnSettled] = await Promise.allSettled([
    fetchCrexCricketMatches('all'),
    fetchCricbuzzMatches(),
    fetchFanCodeLiveScores(),
    fetchEspnLiveScores(),
  ]);

  if (crexSettled.status === 'fulfilled') {
    crexResult = crexSettled.value;
    sourceStatus.crex = 'ok';
  } else {
    sourceStatus.crex = 'error';
  }

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
  let matches = mergeLiveScoreSources(
    crexResult.matches || [],
    cricbuzzResult.matches || [],
    fancodeResult.matches || [],
    espnResult.matches || [],
  );

  matches = matches.map(normalizeMatchLiveFlags);

  const srlMatches = getIplSrlMatches();
  const apiIds = new Set(matches.map((m) => m.id));
  for (const srlMatch of srlMatches) {
    if (!apiIds.has(srlMatch.id)) {
      matches.push(srlMatch);
    }
  }

  const liveCount = matches.filter((m) => getMatchState(m) === 'in' && m.isLive).length;

  // Build per-sport counts dynamically
  const perSport = {};
  for (const m of matches) {
    perSport[m.sport] = (perSport[m.sport] || 0) + 1;
  }

  const response = {
    matches,
    series: cricbuzzResult.series || [],
    counts: {
      total: matches.length,
      live: liveCount,
      ...perSport,
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
