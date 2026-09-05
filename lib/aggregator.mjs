/**
 * Live Scores Aggregator — server-side merge, dedup, and cache layer.
 * Combines Cricbuzz, CREX, FanCode, 10Cric, ESPN, Flashscore, Cricket Guru, and Cricket Liveline.
 * Cricket priority: Cricbuzz → CREX → FanCode → 10Cric → ESPN.
 */

import { fetchCricbuzzMatches } from './cricbuzzLiveScores.mjs';
import { fetchFanCodeLiveScores } from './fancodeLiveScores.mjs';
import { fetchEspnLiveScores } from './espnLiveScores.mjs';
import { fetchCrexCricketMatches } from './crexCricketProvider.mjs';
import { fetch10CricLiveScores } from './providers/tencricProvider.mjs';
import { fetchFlashscoreLiveScores } from './providers/flashscoreProvider.mjs';
import { fetchCricketGuruLiveScores } from './providers/cricketGuruProvider.mjs';
import { fetchCricketLivelineScores } from './providers/cricketLivelineProvider.mjs';
import { normalizeMatchLiveFlags, getMatchState } from './matchState.mjs';
import { AGGREGATOR_CACHE_TTL_MS } from './livePolling.mjs';
import { cricketScoreWeight, cricketSourceRank, getCanonicalMatchPairKey, getMatchPairKeyCandidates } from './matchPairKey.mjs';
import { isPlaceholderPlayerName } from '../src/utils/cricketPlayers.js';
import { getIplSrlMatches } from './iplSrlSimulator.mjs';
import { generate as generateV3 } from './odds-v3/OddsEngineV3.mjs';
import { buildCanonicalFromMatch, extractProviderOdds } from './odds-v3/buildCanonicalFromMatch.mjs';
import { normalizeSportKey } from './odds-v3/sports/normalizeSportKey.mjs';
import { extractMatchWinnerOdds } from './odds-v3/extractMatchWinnerOdds.mjs';
import { classifyLiveFeedHealth } from './liveFeedHealth.mjs';
import { recordFeedHydrationSuccess, recordFeedHydrationFailure } from './feedHealthEngine.mjs';

// ---------------------------------------------------------------------------
// Cricket source priority: Cricbuzz → CREX → FanCode → 10Cric → ESPN
// Other sports keep 10Cric / ESPN-friendly ranking.
// ---------------------------------------------------------------------------
// Cricket priority is handled by cricketSourceRank() from matchPairKey.mjs:
// Cricbuzz (50) → CREX (40) → FanCode (30) → 10Cric (20) → ESPN (10)
// Below is the fallback ranking for non-cricket sports.
const SOURCE_PRIORITY = {
  '10cric2026': 5,
  '10cric': 5,
  flashscore: 4,
  cricketguru: 3,
  cricketliveline: 3,
  fancode: 3,
  crex: 3,
  cricbuzz: 2,
  espn: 1,
};

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

function attachWinnerOdds(baseMatch, snapshot) {
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
    oddsSource: 'OddsEngineV3',
    oddsVersion: winner.oddsVersion,
    stateVersion: winner.stateVersion,
    authoritativeOdds: winner,
  };
}

function normalizeMatchOdds(match) {
  const provider = extractProviderOdds(match);
  const sport = match.sport;
  const isCricket = sport === 'cricket' || sport === 'virtual-cricket' || !sport;

  const baseMatch = {
    ...match,
    marketReferenceData: provider ? { providerOdds: provider } : null,
  };

  try {
    if (!isCricket) {
      const snapshot = generateV3({
        ...baseMatch,
        matchId: baseMatch.id || baseMatch.matchId,
      }, { debug: false, winnerOnly: true });
      const priced = attachWinnerOdds(baseMatch, snapshot);
      if (priced) return priced;
    } else {
      const canonical = buildCanonicalFromMatch(baseMatch);
      const snapshot = generateV3(canonical, { debug: false, winnerOnly: true });
      const priced = attachWinnerOdds(baseMatch, snapshot);
      if (priced) {
        return {
          ...priced,
          odds: { ...priced.odds, draw: priced.odds.draw ?? null },
        };
      }
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
  const primaryHasChase = Number(primary.chaseRuns) > 0
    || Number(primary.chaseWickets) > 0
    || !!primary.chaseTeamName
    || (Number(primary.inningsId) || 0) >= 2
    || (primary.chaseOvers != null
      && String(primary.chaseOvers).trim() !== ''
      && primary.chaseOvers !== '0'
      && primary.chaseOvers !== '0.0');
  const secondaryHasChase = Number(secondary.chaseRuns) > 0
    || Number(secondary.chaseWickets) > 0
    || !!secondary.chaseTeamName
    || (Number(secondary.inningsId) || 0) >= 2
    || (secondary.chaseOvers != null
      && String(secondary.chaseOvers).trim() !== ''
      && secondary.chaseOvers !== '0'
      && secondary.chaseOvers !== '0.0');
  // Do NOT treat score2/wickets2 alone as chase — away batting first populates those.

  if (!primaryHasChase) {
    // Strip all chase-* noise from secondary so false 2nd-innings never sticks
    merged.score2 = Number(primary.score2) > 0 ? primary.score2 : (Number(primary.firstRuns) > 0 ? 0 : merged.score2);
    // Keep team-aligned score2 only when primary explicitly has it; otherwise zero chase slots
    if (primary.score2 == null && !(Number(primary.inningsId) >= 2)) {
      // Prefer team card semantics: do not invent chase from secondary
      if (Number(primary.firstRuns) > 0 || primary.firstTeamName) {
        // first innings — clear chase fields entirely
        merged.chaseRuns = undefined;
        merged.chaseWickets = undefined;
        merged.chaseOvers = undefined;
        merged.chaseTeamName = undefined;
        merged.chaseBallNbr = undefined;
        if (primary.overs2 == null || primary.overs2 === '0' || primary.overs2 === '0.0') {
          merged.overs2 = '0.0';
        }
      }
    }
    if (primary.chaseRuns == null) merged.chaseRuns = undefined;
    if (primary.chaseWickets == null) merged.chaseWickets = undefined;
    if (primary.chaseOvers == null) merged.chaseOvers = undefined;
    if (primary.chaseTeamName == null) merged.chaseTeamName = undefined;
    if (primary.chaseBallNbr == null) merged.chaseBallNbr = undefined;
  } else if (secondaryHasChase) {
    // Never regress an in-progress chase when a fresher secondary (or stale primary) arrives.
    const pChase = Number(primary.chaseRuns) || 0;
    const sChase = Number(secondary.chaseRuns) || 0;
    if (sChase > pChase) {
      merged.chaseRuns = sChase;
      merged.chaseWickets = Math.max(Number(primary.chaseWickets) || 0, Number(secondary.chaseWickets) || 0);
      if (!isEmptyOversValue(secondary.chaseOvers)) merged.chaseOvers = secondary.chaseOvers;
      if (secondary.chaseTeamName) merged.chaseTeamName = secondary.chaseTeamName;
    }
    const pScore2 = Number(primary.score2) || 0;
    const sScore2 = Number(secondary.score2) || 0;
    if (sScore2 > pScore2) merged.score2 = sScore2;
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
  merged.flashscoreEventId = baseMatch.flashscoreEventId || incomingMatch.flashscoreEventId || merged.flashscoreEventId;
  merged.crexEventId = baseMatch.crexEventId || incomingMatch.crexEventId || merged.crexEventId;
  merged.guruMatchId = baseMatch.guruMatchId || incomingMatch.guruMatchId || merged.guruMatchId;
  merged.crixMatchId = baseMatch.crixMatchId || incomingMatch.crixMatchId || merged.crixMatchId;

  const cbMatch = [baseMatch, incomingMatch].find((m) => String(m.id || '').startsWith('cb_'));
  if (cbMatch?.id) {
    merged.id = cbMatch.id;
    merged.source = 'cricbuzz';
  }

  const tencricMatch = [baseMatch, incomingMatch].find((m) => {
    const src = String(m.source || m.provider || '');
    const id = String(m.id || '');
    return src === '10cric2026' || src === '10cric' || src === 'live'
      || id.startsWith('10cric_') || id.startsWith('oy_')
      || m.tencricEventId;
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
  const aliasToPrimary = new Map();

  for (const list of sourceArrays) {
    for (const match of list) {
      const candidates = getMatchPairKeyCandidates(match);
      let primaryKey = candidates.map((key) => aliasToPrimary.get(key)).find(Boolean);
      if (!primaryKey) {
        primaryKey = candidates[0] || getMatchPairKey(match);
        map.set(primaryKey, match);
      } else {
        map.set(primaryKey, mergeMatchEntities(map.get(primaryKey), match));
      }
      const merged = map.get(primaryKey);
      for (const key of getMatchPairKeyCandidates(merged)) {
        aliasToPrimary.set(key, primaryKey);
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

  const sourceStatus = {
    tencric: 'pending',
    crex: 'pending',
    cricbuzz: 'pending',
    fancode: 'pending',
    espn: 'pending',
    flashscore: 'pending',
    cricketguru: 'pending',
    cricketliveline: 'pending',
  };

  let tencricResult = [];
  let crexResult = { matches: [], counts: {} };
  let cricbuzzResult = { matches: [], series: [], counts: {} };
  let fancodeResult = { matches: [], counts: {} };
  let espnResult = { matches: [], counts: {} };
  let flashscoreResult = { matches: [], counts: {} };
  let cricketguruResult = { matches: [], counts: {} };
  let cricketlivelineResult = { matches: [], counts: {} };

  const [tencricSettled, crexSettled, cbSettled, fcSettled, espnSettled, flashscoreSettled, guruSettled, crixSettled] = await Promise.allSettled([
    fetch10CricLiveScores(),
    fetchCrexCricketMatches('all'),
    fetchCricbuzzMatches(),
    fetchFanCodeLiveScores(),
    fetchEspnLiveScores(),
    fetchFlashscoreLiveScores(),
    fetchCricketGuruLiveScores(),
    fetchCricketLivelineScores(),
  ]);

  if (tencricSettled.status === 'fulfilled') {
    tencricResult = tencricSettled.value || [];
    sourceStatus.tencric = 'ok';
    // 10cric records hydration inside tencricProvider — avoid double-count
  } else {
    sourceStatus.tencric = 'error';
    recordFeedHydrationFailure('10cric2026', tencricSettled.reason, { stage: 'aggregator' });
  }

  if (crexSettled.status === 'fulfilled') {
    crexResult = crexSettled.value;
    sourceStatus.crex = 'ok';
    recordFeedHydrationSuccess('crex', { matchCount: crexResult?.matches?.length || 0 });
  } else {
    sourceStatus.crex = 'error';
    recordFeedHydrationFailure('crex', crexSettled.reason, { stage: 'aggregator' });
  }

  if (cbSettled.status === 'fulfilled') {
    cricbuzzResult = cbSettled.value;
    sourceStatus.cricbuzz = 'ok';
    recordFeedHydrationSuccess('cricbuzz', { matchCount: cricbuzzResult?.matches?.length || 0 });
  } else {
    sourceStatus.cricbuzz = 'error';
    console.warn('[Aggregator] Cricbuzz fetch error:', cbSettled.reason?.message || cbSettled.reason);
    recordFeedHydrationFailure('cricbuzz', cbSettled.reason, { stage: 'aggregator' });
  }

  if (fcSettled.status === 'fulfilled') {
    fancodeResult = fcSettled.value;
    sourceStatus.fancode = 'ok';
    recordFeedHydrationSuccess('fancode', { matchCount: fancodeResult?.matches?.length || 0 });
  } else {
    sourceStatus.fancode = 'error';
    console.warn('[Aggregator] FanCode fetch error:', fcSettled.reason?.message || fcSettled.reason);
    recordFeedHydrationFailure('fancode', fcSettled.reason, { stage: 'aggregator' });
  }

  if (espnSettled.status === 'fulfilled') {
    espnResult = espnSettled.value;
    sourceStatus.espn = 'ok';
    recordFeedHydrationSuccess('espn', { matchCount: espnResult?.matches?.length || 0 });
  } else {
    sourceStatus.espn = 'error';
    console.warn('[Aggregator] ESPN fetch error:', espnSettled.reason?.message || espnSettled.reason);
    recordFeedHydrationFailure('espn', espnSettled.reason, { stage: 'aggregator' });
  }

  if (flashscoreSettled.status === 'fulfilled') {
    flashscoreResult = flashscoreSettled.value;
    sourceStatus.flashscore = 'ok';
    recordFeedHydrationSuccess('flashscore', { matchCount: flashscoreResult?.matches?.length || 0 });
  } else {
    sourceStatus.flashscore = 'error';
    console.warn('[Aggregator] Flashscore fetch error:', flashscoreSettled.reason?.message || flashscoreSettled.reason);
    recordFeedHydrationFailure('flashscore', flashscoreSettled.reason, { stage: 'aggregator' });
  }

  if (guruSettled.status === 'fulfilled') {
    cricketguruResult = guruSettled.value;
    sourceStatus.cricketguru = 'ok';
    recordFeedHydrationSuccess('cricketguru', { matchCount: cricketguruResult?.matches?.length || 0 });
  } else {
    sourceStatus.cricketguru = 'error';
    console.warn('[Aggregator] Cricket Guru fetch error:', guruSettled.reason?.message || guruSettled.reason);
    recordFeedHydrationFailure('cricketguru', guruSettled.reason, { stage: 'aggregator' });
  }

  if (crixSettled.status === 'fulfilled') {
    cricketlivelineResult = crixSettled.value;
    sourceStatus.cricketliveline = 'ok';
    recordFeedHydrationSuccess('cricketliveline', { matchCount: cricketlivelineResult?.matches?.length || 0 });
  } else {
    sourceStatus.cricketliveline = 'error';
    console.warn('[Aggregator] Cricket Liveline fetch error:', crixSettled.reason?.message || crixSettled.reason);
    recordFeedHydrationFailure('cricketliveline', crixSettled.reason, { stage: 'aggregator' });
  }

  const srlMatches = getIplSrlMatches() || [];

  let matches = mergeLiveScoreSources(
    espnResult.matches || [],
    tencricResult || [],
    flashscoreResult.matches || [],
    fancodeResult.matches || [],
    crexResult.matches || [],
    cricketguruResult.matches || [],
    cricketlivelineResult.matches || [],
    cricbuzzResult.matches || [],
    srlMatches,
  );

  matches = matches.map((m) => {
    const sport = normalizeSportKey(m.sport);
    const norm = normalizeMatchLiveFlags({ ...m, sport: sport || m.sport });
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
    snooker: matches.filter((m) => m.sport === 'snooker').length,
    formula1: matches.filter((m) => m.sport === 'formula1').length,
    hockey: matches.filter((m) => m.sport === 'hockey').length,
    'american-football': matches.filter((m) => m.sport === 'american-football').length,
  };

  const feedError = classifyLiveFeedHealth(sourceStatus);

  // When every upstream provider fails, suspend live markets — never invent scores/odds.
  if (feedError?.code === 'ALL_PROVIDERS_FAILED') {
    try {
      const { marketSuspensionEngine } = await import('./marketSuspensionEngine.mjs');
      const liveForSuspend = (matches.length > 0 ? matches : (cachedResponse?.matches || []))
        .filter((m) => getMatchState(m) === 'in')
        .filter((m) => m?.source !== 'srl' && !String(m?.id || '').startsWith('srl_'));
      await Promise.all(
        liveForSuspend.map(async (m) => {
          const matchId = String(m?.id || m?.matchId || '');
          if (!matchId) return;
          // Composite key used by placement when match-scoped; also suspend bare market id for safety.
          const markets = ['match_winner', `${matchId}:match_winner`, `${matchId}|match_winner`];
          await Promise.all(markets.map((marketId) =>
            marketSuspensionEngine.addSuspensionCause(marketId, 'PROVIDER_FAILURE', 'SYSTEM')));
        }),
      );
    } catch (err) {
      console.warn('[Aggregator] live market suspend on feed failure failed:', err?.message || err);
    }
  }

  if (matches.length === 0 && cachedResponse && cachedResponse.matches?.length > 0) {
    console.warn('[Aggregator] Upstream sources returned 0 matches, serving last valid cache with', cachedResponse.matches.length, 'matches');
    return {
      ...cachedResponse,
      cached: true,
      stale: true,
      feedError: feedError || cachedResponse.feedError,
      status: feedError ? 'degraded' : cachedResponse.status,
    };
  }

  const responsePayload = {
    timestamp: new Date().toISOString(),
    status: feedError ? 'degraded' : 'success',
    counts,
    sources: sourceStatus,
    series: cricbuzzResult.series || [],
    matches,
    ...(feedError ? { feedError } : {}),
  };

  cachedResponse = responsePayload;
  lastFetchTimestamp = Date.now();

  try {
    const { cacheCanonicalMatchState } = await import('./matchStateCache.mjs');
    const { upsertPersistentMatch } = await import('./eventPersistence.mjs');
    await Promise.all(
      [...liveMatches, ...completedMatches].map(async (m) => {
        const id = String(m?.id || m?.matchId || '');
        if (!id) return;
        const completed = String(m?.status || m?.matchState || '').toLowerCase() === 'post'
          || /^(completed|final|finished)$/i.test(String(m?.time || ''));
        await cacheCanonicalMatchState(id, m, { completed }).catch(() => {});
        await upsertPersistentMatch(m).catch(() => {});
      }),
    );
  } catch (err) {
    console.error('[Aggregator] matchStateCache/upsertPersistentMatch write failed', err.message);
  }

  try {
    const { publishAggregatorTick } = await import('./liveFeedBroadcast.mjs');
    publishAggregatorTick(responsePayload);
  } catch {
    // WS optional in tests / vite plugin
  }

  if (process.env.RUN_BACKGROUND_WORKERS === 'true' || process.env.WORKER_PROCESS === '1') {
    try {
      const { scheduleEventDrivenSettlement } = await import('./settlement/settlementEventBridge.mjs');
      scheduleEventDrivenSettlement([
        ...liveMatches,
        ...completedMatches,
      ]);
    } catch (err) {
      console.error('[Aggregator] event-driven settlement schedule failed', err.message);
    }
  }

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
