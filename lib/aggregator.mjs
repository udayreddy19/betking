/**
 * Live Scores Aggregator — server-side merge, dedup, and cache layer.
 * Combines Cricbuzz, CREX, FanCode, 10Cric, and ESPN.
 * Cricket priority: Cricbuzz → CREX → FanCode → 10Cric → ESPN.
 */

import { fetchCricbuzzMatches } from './cricbuzzLiveScores.mjs';
import { fetchFanCodeLiveScores } from './fancodeLiveScores.mjs';
import { fetchEspnLiveScores } from './espnLiveScores.mjs';
import { fetchCrexCricketMatches } from './crexCricketProvider.mjs';
import { fetch10CricLiveScores } from './providers/tencricProvider.mjs';
import { normalizeMatchLiveFlags, getMatchState } from './matchState.mjs';
import { AGGREGATOR_CACHE_TTL_MS } from './livePolling.mjs';
import { cricketScoreWeight, cricketSourceRank, getCanonicalMatchPairKey } from './matchPairKey.mjs';
import { isPlaceholderPlayerName } from '../src/utils/cricketPlayers.js';
import { getIplSrlMatches } from './iplSrlSimulator.mjs';
import { generate as generateV3 } from './odds-v3/OddsEngineV3.mjs';
import { buildCanonicalFromMatch, extractProviderOdds } from './odds-v3/buildCanonicalFromMatch.mjs';
import { extractMatchWinnerOdds } from './odds-v3/extractMatchWinnerOdds.mjs';

// ---------------------------------------------------------------------------
// Cricket source priority: Cricbuzz → CREX → FanCode → 10Cric → ESPN
// Other sports keep 10Cric / ESPN-friendly ranking.
// ---------------------------------------------------------------------------
// Cricket priority is handled by cricketSourceRank() from matchPairKey.mjs:
// Cricbuzz (50) → CREX (40) → FanCode (30) → 10Cric (20) → ESPN (10)
// Below is the fallback ranking for non-cricket sports.
const SOURCE_PRIORITY = { '10cric2026': 5, '10cric': 5, fancode: 4, crex: 3, cricbuzz: 2, espn: 1 };

function sourceRank(match) {
  const sport = match?.sport;
  if (sport === 'cricket' || sport === 'virtual-cricket' || !sport) {
    return cricketSourceRank(match);
  }
  const src = String(match?.source || match?.provider || '').toLowerCase();
  return SOURCE_PRIORITY[src] || 0;
}

function getMatchPairKey(match) {
  return getCanonicalMatchPairKey(match);
}

function normalizeMatchOdds(match) {
  const provider = extractProviderOdds(match);
  const sport = match.sport;
  const isCricket = sport === 'cricket' || sport === 'virtual-cricket' || !sport;

  const baseMatch = {
    ...match,
    marketReferenceData: provider ? { providerOdds: provider } : null,
  };

  if (!isCricket) {
    return { ...baseMatch, odds: null, oddsSource: 'NOT_AVAILABLE' };
  }

  try {
    const canonical = buildCanonicalFromMatch(baseMatch);
    const snapshot = generateV3(canonical, { debug: false, winnerOnly: true });
    const winner = extractMatchWinnerOdds(snapshot, baseMatch);
    if (winner.team1 != null && winner.team2 != null) {
      return {
        ...baseMatch,
        odds: {
          home: winner.team1,
          away: winner.team2,
          team1: winner.team1,
          team2: winner.team2,
          draw: null,
        },
        oddsSource: 'OddsEngineV3',
        oddsVersion: winner.oddsVersion,
        stateVersion: winner.stateVersion,
        authoritativeOdds: winner,
      };
    }
  } catch {
    // Invalid state → no invented odds
  }

  return {
    ...baseMatch,
    odds: null,
    oddsSource: 'NOT_AVAILABLE',
  };
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

function isEmptyOversValue(value) {
  return value == null || value === '' || value === 0 || value === '0' || value === '0.0';
}

function mergeCricketLiveDetailsFields(secondary = {}, primary = {}) {
  const merged = mergeObjectsPreferNonNull(secondary, primary);
  const primaryHasChase = Number(primary.score2) > 0
    || Number(primary.chaseRuns) > 0
    || Number(primary.wickets2) > 0
    || (primary.overs2 && primary.overs2 !== '0.0');

  if (!primaryHasChase) {
    merged.score2 = 0;
    merged.wickets2 = 0;
    merged.overs2 = '0.0';
    if (primary.chaseRuns == null) merged.chaseRuns = undefined;
  }

  for (const key of ['overs', 'firstOvers', 'chaseOvers']) {
    const pv = primary?.[key];
    const sv = secondary?.[key];
    if (isEmptyOversValue(merged[key])) {
      merged[key] = !isEmptyOversValue(pv) ? pv : (!isEmptyOversValue(sv) ? sv : merged[key]);
    } else if (isEmptyOversValue(pv) && !isEmptyOversValue(sv)) {
      merged[key] = sv;
    }
  }

  if ((merged.runs == null || merged.runs === 0) && (primary.runs || secondary.runs)) {
    merged.runs = Number(primary.runs) || Number(secondary.runs) || 0;
  }

  for (const key of ['batter1', 'batter2', 'bowler']) {
    const primaryPlayer = primary?.[key];
    const secondaryPlayer = secondary?.[key];
    const primaryName = primaryPlayer?.name || (typeof primaryPlayer === 'string' ? primaryPlayer : '');
    const secondaryName = secondaryPlayer?.name || (typeof secondaryPlayer === 'string' ? secondaryPlayer : '');

    const pValid = primaryName && !isPlaceholderPlayerName(primaryName);
    const sValid = secondaryName && !isPlaceholderPlayerName(secondaryName);

    if (pValid) merged[key] = primaryPlayer;
    else if (sValid) merged[key] = secondaryPlayer;
    else if (primaryName) merged[key] = primaryPlayer;
    else if (secondaryName) merged[key] = secondaryPlayer;
  }
  if (!merged.commentary) merged.commentary = primary.commentary || secondary.commentary;
  if (!merged.currentOverBalls?.length) {
    merged.currentOverBalls = primary.currentOverBalls?.length
      ? primary.currentOverBalls
      : secondary.currentOverBalls;
  }

  return merged;
}

function mergeMatchEntities(baseMatch, incomingMatch) {
  if (!baseMatch) return incomingMatch;
  if (!incomingMatch) return baseMatch;

  const basePriority = sourceRank(baseMatch);
  const incPriority = sourceRank(incomingMatch);
  const isCricket = baseMatch.sport === 'cricket' || incomingMatch.sport === 'cricket'
    || baseMatch.sport === 'virtual-cricket' || incomingMatch.sport === 'virtual-cricket';

  let primary;
  let secondary;
  if (isCricket) {
    primary = incPriority >= basePriority ? incomingMatch : baseMatch;
    secondary = incPriority >= basePriority ? baseMatch : incomingMatch;
    if (cricketScoreWeight(primary) === 0 && cricketScoreWeight(secondary) > 0) {
      const scored = secondary;
      secondary = primary;
      primary = scored;
    }
  } else {
    const baseWeight = cricketScoreWeight(baseMatch);
    const incWeight = cricketScoreWeight(incomingMatch);
    if (incWeight !== baseWeight) {
      primary = incWeight > baseWeight ? incomingMatch : baseMatch;
      secondary = incWeight > baseWeight ? baseMatch : incomingMatch;
    } else {
      primary = incPriority >= basePriority ? incomingMatch : baseMatch;
      secondary = incPriority >= basePriority ? baseMatch : incomingMatch;
    }
  }

  const merged = mergeObjectsPreferNonNull(secondary, primary);
  const secondaryIsSim = String(secondary.source || '') === 'srl'
    || String(secondary.id || '').startsWith('srl_');
  const primaryIsSim = String(primary.source || '') === 'srl'
    || String(primary.id || '').startsWith('srl_');
  const secondaryLd = (secondaryIsSim && !primaryIsSim)
    ? { ...(secondary.liveDetails || {}), batter1: undefined, batter2: undefined, bowler: undefined }
    : secondary.liveDetails;
  merged.liveDetails = mergeCricketLiveDetailsFields(secondaryLd, primary.liveDetails);

  const sources = new Set([
    ...(Array.isArray(baseMatch.sources) ? baseMatch.sources : [baseMatch.source || baseMatch.provider].filter(Boolean)),
    ...(Array.isArray(incomingMatch.sources) ? incomingMatch.sources : [incomingMatch.source || incomingMatch.provider].filter(Boolean)),
  ]);
  merged.sources = Array.from(sources);
  merged.cricbuzzMatchId = baseMatch.cricbuzzMatchId || incomingMatch.cricbuzzMatchId || merged.cricbuzzMatchId;
  merged.espnEventId = baseMatch.espnEventId || incomingMatch.espnEventId || merged.espnEventId;
  merged.espnPath = baseMatch.espnPath || incomingMatch.espnPath || merged.espnPath;
  merged.fancodeMatchId = baseMatch.fancodeMatchId || incomingMatch.fancodeMatchId || merged.fancodeMatchId;

  const cbMatch = [baseMatch, incomingMatch].find((m) => String(m.id || '').startsWith('cb_'));
  if (cbMatch?.id) {
    merged.id = cbMatch.id;
    merged.source = 'cricbuzz';
  }

  const tencricMatch = [baseMatch, incomingMatch].find((m) => {
    const src = String(m.source || m.provider || '');
    return src === '10cric2026' || src === '10cric' || String(m.id || '').startsWith('10cric_');
  });
  if (tencricMatch?.odds?.home && tencricMatch?.odds?.away) {
    merged.odds = {
      ...(merged.odds || {}),
      ...tencricMatch.odds,
      home: tencricMatch.odds.home,
      away: tencricMatch.odds.away,
      team1: tencricMatch.odds.team1 || tencricMatch.odds.home,
      team2: tencricMatch.odds.team2 || tencricMatch.odds.away,
    };
  }
  merged.tencricEventId = baseMatch.tencricEventId || incomingMatch.tencricEventId || merged.tencricEventId;
  merged.tencricUrl = baseMatch.tencricUrl || incomingMatch.tencricUrl || merged.tencricUrl;

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
let inFlightRefresh = null;

function isCacheValid() {
  return cachedResponse && (Date.now() - lastFetchTimestamp < AGGREGATOR_CACHE_TTL_MS);
}

export function clearAggregatorCache() {
  cachedResponse = null;
  lastFetchTimestamp = 0;
}

async function refreshAggregatedLiveScores() {

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

  const srlMatches = getIplSrlMatches() || [];

  let matches = mergeLiveScoreSources(
    espnResult.matches || [],
    tencricResult || [],
    fancodeResult.matches || [],
    crexResult.matches || [],
    cricbuzzResult.matches || [],
    srlMatches,
  );

  matches = matches.map((m) => {
    const norm = normalizeMatchLiveFlags(m);
    return normalizeMatchOdds(norm);
  });

  const liveMatches = matches.filter((m) => getMatchState(m) === 'in');
  const upcomingMatches = matches.filter((m) => getMatchState(m) === 'pre');
  const completedMatches = matches.filter((m) => getMatchState(m) === 'post');

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

export async function getAggregatedLiveScores(opts = {}) {
  if (!opts.force && isCacheValid()) {
    return { ...cachedResponse, cached: true };
  }

  // Stale-while-revalidate: odds/UI keep serving immediately while providers refresh.
  if (!opts.force && cachedResponse) {
    if (!inFlightRefresh) {
      inFlightRefresh = refreshAggregatedLiveScores().finally(() => {
        inFlightRefresh = null;
      });
    }
    return { ...cachedResponse, cached: true, stale: true };
  }

  if (inFlightRefresh) return inFlightRefresh;
  inFlightRefresh = refreshAggregatedLiveScores().finally(() => {
    inFlightRefresh = null;
  });
  return inFlightRefresh;
}

/**
 * Prefer in-memory snapshot for latency-sensitive callers (odds).
 * Never blocks on a provider refresh when any cache exists.
 */
export function getCachedAggregatedLiveScores() {
  if (!cachedResponse) return null;
  return {
    ...cachedResponse,
    cached: true,
    stale: !isCacheValid(),
  };
}

export { getAggregatedLiveScores as aggregateLiveScores };
