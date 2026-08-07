/**
 * Live Scores Aggregator — server-side merge, dedup, and cache layer.
 * Combines results from 10Cric (10cric2026.com), CREX, Cricbuzz, FanCode, and ESPN into a single response.
 */

import { fetchCricbuzzMatches } from './cricbuzzLiveScores.mjs';
import { fetchFanCodeLiveScores } from './fancodeLiveScores.mjs';
import { fetchEspnLiveScores } from './espnLiveScores.mjs';
import { fetchCrexCricketMatches } from './crexCricketProvider.mjs';
import { fetch10CricLiveScores } from './providers/tencricProvider.mjs';
import { normalizeMatchLiveFlags, getMatchState } from './matchState.mjs';
import { AGGREGATOR_CACHE_TTL_MS } from './livePolling.mjs';
import { calculateDynamicMatchOdds } from './oddsEngine.mjs';

// ---------------------------------------------------------------------------
// Source priority — higher number = preferred when both have equal score data
// ---------------------------------------------------------------------------
const SOURCE_PRIORITY = { '10cric2026': 6, crex: 5, cricbuzz: 4, fancode: 3, espn: 2 };

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
  if (match.pairKey && typeof match.pairKey === 'string' && match.pairKey.includes('|')) {
    return match.pairKey;
  }
  const t1 = normalizeTeamName(match.team1?.name || match.homeTeam?.teamName || match.homeTeam?.name);
  const t2 = normalizeTeamName(match.team2?.name || match.awayTeam?.teamName || match.awayTeam?.name);
  if (!t1 || !t2) return String(match.id || Math.random());
  return [t1, t2].sort().join('|');
}

// ---------------------------------------------------------------------------
// Merge logic — deep multi-provider entity merging with non-null preference
// ---------------------------------------------------------------------------
function mergeObjectsPreferNonNull(target = {}, source = {}) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sVal = source[key];
    const tVal = target[key];

    if (sVal === null || sVal === undefined) continue;

    if (tVal === null || tVal === undefined) {
      result[key] = sVal;
    } else if (typeof sVal === 'object' && typeof tVal === 'object' && !Array.isArray(sVal) && !Array.isArray(tVal)) {
      result[key] = mergeObjectsPreferNonNull(tVal, sVal);
    } else if (Array.isArray(sVal) && sVal.length > 0 && (!Array.isArray(tVal) || tVal.length === 0)) {
      result[key] = sVal;
    } else if (typeof sVal === 'number' && sVal > 0 && (typeof tVal !== 'number' || tVal === 0)) {
      result[key] = sVal;
    } else if (typeof sVal === 'string' && sVal.trim().length > 0 && (typeof tVal !== 'string' || tVal.trim().length === 0)) {
      result[key] = sVal;
    }
  }
  return result;
}

function mergeMatchEntities(baseMatch, incomingMatch) {
  if (!baseMatch) return incomingMatch;
  if (!incomingMatch) return baseMatch;

  const basePriority = SOURCE_PRIORITY[baseMatch.source || baseMatch.provider] || 0;
  const incPriority = SOURCE_PRIORITY[incomingMatch.source || incomingMatch.provider] || 0;

  const primary = incPriority >= basePriority ? incomingMatch : baseMatch;
  const secondary = incPriority >= basePriority ? baseMatch : incomingMatch;

  const merged = mergeObjectsPreferNonNull(secondary, primary);

  const sources = new Set([
    ...(Array.isArray(baseMatch.sources) ? baseMatch.sources : [baseMatch.source || baseMatch.provider].filter(Boolean)),
    ...(Array.isArray(incomingMatch.sources) ? incomingMatch.sources : [incomingMatch.source || incomingMatch.provider].filter(Boolean)),
  ]);
  merged.sources = Array.from(sources);

  return merged;
}

function mergeLiveScoreSources(...sourceArrays) {
  const map = new Map();

  for (const list of sourceArrays) {
    for (const match of list) {
      const key = getMatchPairKey(match);
      if (!map.has(key)) {
        map.set(key, match);
      } else {
        const existing = map.get(key);
        map.set(key, mergeMatchEntities(existing, match));
      }
    }
  }

  return Array.from(map.values());
}

// ---------------------------------------------------------------------------
// In-Memory Cache State
// ---------------------------------------------------------------------------
let cachedResponse = null;
let lastFetchTimestamp = 0;

function isCacheValid() {
  return cachedResponse && (Date.now() - lastFetchTimestamp < AGGREGATOR_CACHE_TTL_MS);
}

export function clearAggregatorCache() {
  cachedResponse = null;
  lastFetchTimestamp = 0;
}

// ---------------------------------------------------------------------------
// Main Aggregator Function
// ---------------------------------------------------------------------------
export async function getAggregatedLiveScores(opts = {}) {
  if (!opts.force && isCacheValid()) {
    return { ...cachedResponse, cached: true };
  }

  const sourceStatus = { tencric: 'pending', crex: 'pending', cricbuzz: 'pending', fancode: 'pending', espn: 'pending' };

  let tencricResult = [];
  let crexResult = { matches: [], counts: {} };
  let cricbuzzResult = { matches: [], series: [], counts: {} };
  let fancodeResult = { matches: [], counts: {} };
  let espnResult = { matches: [], counts: {} };

  const [tencricSettled, crexSettled, cbSettled, fcSettled, espnSettled] = await Promise.allSettled([
    fetch10CricLiveScores(),
    fetchCrexCricketMatches('all'),
    fetchCricbuzzMatches(),
    fetchFanCodeLiveScores(),
    fetchEspnLiveScores(),
  ]);

  if (tencricSettled.status === 'fulfilled') {
    tencricResult = tencricSettled.value || [];
    sourceStatus.tencric = 'ok';
  } else {
    sourceStatus.tencric = 'error';
  }

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

  let matches = mergeLiveScoreSources(
    tencricResult || [],
    crexResult.matches || [],
    cricbuzzResult.matches || [],
    fancodeResult.matches || [],
    espnResult.matches || [],
  );

  matches = matches.map((m) => {
    const norm = normalizeMatchLiveFlags(m);
    const dynamicOddsCalc = calculateDynamicMatchOdds(norm, { marginPct: 5.0 });
    norm.dynamicEngineOdds = dynamicOddsCalc;
    if (!norm.odds || !norm.odds.home) {
      norm.odds = {
        home: dynamicOddsCalc.odds.home.decimal,
        away: dynamicOddsCalc.odds.away.decimal,
        draw: dynamicOddsCalc.odds.draw?.decimal || null,
      };
    }
    return norm;
  });

  const liveMatches = matches.filter((m) => m.isLive || getMatchState(m) === 'in');
  const upcomingMatches = matches.filter((m) => !m.isLive && getMatchState(m) === 'pre');
  const completedMatches = matches.filter((m) => !m.isLive && getMatchState(m) === 'post');

  const counts = {
    total: matches.length,
    live: liveMatches.length,
    upcoming: upcomingMatches.length,
    completed: completedMatches.length,
    cricket: matches.filter((m) => m.sport === 'cricket').length,
    football: matches.filter((m) => m.sport === 'football' || m.sport === 'soccer').length,
    basketball: matches.filter((m) => m.sport === 'basketball').length,
    tennis: matches.filter((m) => m.sport === 'tennis').length,
    formula1: matches.filter((m) => m.sport === 'formula1').length,
    hockey: matches.filter((m) => m.sport === 'hockey').length,
    'american-football': matches.filter((m) => m.sport === 'american-football').length,
  };

  if (matches.length === 0 && cachedResponse && cachedResponse.matches?.length > 0) {
    console.warn('[Aggregator] Upstream sources returned 0 matches, serving last valid cache with', cachedResponse.matches.length, 'matches');
    return { ...cachedResponse, cached: true, stale: true };
  }

  const responsePayload = {
    timestamp: new Date().toISOString(),
    status: 'success',
    counts,
    sources: sourceStatus,
    series: cricbuzzResult.series || [],
    matches,
  };

  cachedResponse = responsePayload;
  lastFetchTimestamp = Date.now();

  return responsePayload;
}

export { getAggregatedLiveScores as aggregateLiveScores };
