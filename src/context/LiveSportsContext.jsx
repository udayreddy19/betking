import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { normalizeApiMatches } from '../utils/matchFilters';
import { fetchLiveScores } from '../services/liveScoresService';
import { subscribeLiveChannel, isLiveFeedSocketOpen } from '../services/liveFeedSocket';
import { LIVE_SCORES_POLL_MS, LIVE_SCORES_WS_FALLBACK_POLL_MS } from '../config/livePolling';
import { getIplSrlMatches } from '../../lib/iplSrlSimulator.mjs';
import { cricketScoreWeight, cricketSourceRank, getCanonicalMatchPairKey } from '../../lib/matchPairKey.mjs';
import { useAuth } from './AuthContext';

const LiveMatchesContext = createContext([]);
const LiveSportsMetaContext = createContext(null);

function attachOdds(matches) {
  return matches.map((match) => {
    const homeOdds = match.odds?.home ?? match.odds?.team1 ?? match.preOdds?.team1 ?? match.preOdds?.home ?? null;
    const awayOdds = match.odds?.away ?? match.odds?.team2 ?? match.preOdds?.team2 ?? match.preOdds?.away ?? null;
    const drawOdds = match.odds?.draw ?? match.preOdds?.draw ?? null;

    const hasHome = homeOdds != null && Number(homeOdds) > 1;
    const hasAway = awayOdds != null && Number(awayOdds) > 1;

    const stableOdds = hasHome && hasAway
      ? {
        team1: Number(homeOdds),
        team2: Number(awayOdds),
        draw: drawOdds != null && Number(drawOdds) > 1 ? Number(drawOdds) : null,
        home: Number(homeOdds),
        away: Number(awayOdds),
      }
      : null;

    return {
      ...match,
      preOdds: match.preOdds || stableOdds,
      odds: stableOdds,
    };
  });
}

function isSrlMatch(match) {
  return String(match?.id || '').startsWith('srl_') || match?.source === 'srl';
}

function preferMatchEntity(existing, incoming) {
  if (!existing) return incoming;
  if (!incoming) return existing;
  const existingRank = cricketSourceRank(existing);
  const incomingRank = cricketSourceRank(incoming);
  let primary = incomingRank >= existingRank ? incoming : existing;
  let secondary = incomingRank >= existingRank ? existing : incoming;
  if (cricketScoreWeight(primary) === 0 && cricketScoreWeight(secondary) > 0) {
    return secondary;
  }
  if (incomingRank !== existingRank) {
    return primary;
  }
  return cricketScoreWeight(incoming) > cricketScoreWeight(existing) ? incoming : existing;
}

function mergeSrlMatches(matches) {
  const apiSrl = attachOdds(matches.filter(isSrlMatch));
  const apiMatches = matches.filter((m) => !isSrlMatch(m));
  const srl = apiSrl.length > 0 ? apiSrl : attachOdds(getIplSrlMatches());

  const seenIds = new Set();
  const seenPairs = new Map();
  const result = [];

  const pushUnique = (match, { allowSrl = false } = {}) => {
    if (!match?.id || seenIds.has(match.id)) return;
    const pairKey = getCanonicalMatchPairKey(match);
    const keyed = allowSrl || isSrlMatch(match)
      ? `srl|${pairKey}`
      : pairKey;
    if (keyed && seenPairs.has(keyed)) {
      const existingIdx = seenPairs.get(keyed);
      const existing = result[existingIdx];
      if (existing) {
        const preferred = preferMatchEntity(existing, match);
        result[existingIdx] = preferred;
        seenIds.add(match.id);
        if (preferred?.id) seenIds.add(preferred.id);
      }
      return;
    }
    seenIds.add(match.id);
    if (keyed) seenPairs.set(keyed, result.length);
    result.push(match);
  };

  for (const match of apiMatches) pushUnique(match, { allowSrl: false });
  for (const match of srl) pushUnique(match, { allowSrl: true });
  return result;
}

function matchDisplayKey(m) {
  return [
    m.id,
    m.score,
    m.time,
    m.liveDetails?.summary,
    m.liveDetails?.cricket?.score,
    m.liveDetails?.cricket?.overs,
    m.liveDetails?.cricket?.batsman1?.name,
    m.liveDetails?.cricket?.bowler?.name,
    m.liveDetails?.cricket?.lastBallResult,
    m.liveDetails?.eventState,
    m.scorecardInnings?.length || 0,
    m.squads?.length || 0,
    m.odds?.team1,
    m.odds?.team2,
  ].join('|');
}

function summarizeMatches(list) {
  return list.map(matchDisplayKey).join('##');
}

function mergeLiveDetailsPreservePlayers(prev = {}, next = {}) {
  const cPrev = prev.cricket || {};
  const cNext = next.cricket || {};
  const mergedCricket = {
    ...cPrev,
    ...cNext,
    batsman1: cNext.batsman1?.name ? cNext.batsman1 : cPrev.batsman1,
    batsman2: cNext.batsman2?.name ? cNext.batsman2 : cPrev.batsman2,
    bowler: cNext.bowler?.name ? cNext.bowler : cPrev.bowler,
    innings: cNext.innings?.length ? cNext.innings : cPrev.innings,
    recentOvers: cNext.recentOvers?.length ? cNext.recentOvers : cPrev.recentOvers,
  };
  return {
    ...prev,
    ...next,
    cricket: mergedCricket,
  };
}

function mergeMatchesStable(prev, next) {
  if (prev.length === 0) return next;

  const prevById = new Map(prev.map((m) => [m.id, m]));
  const processedIds = new Set();
  const merged = [];
  const seenPairs = new Map();

  const rememberPair = (match, index) => {
    const key = getCanonicalMatchPairKey(match);
    if (key) seenPairs.set(key, index);
  };

  for (const candidate of next) {
    processedIds.add(candidate.id);
    const previous = prevById.get(candidate.id);
    let chosen;
    if (!previous) {
      chosen = candidate;
    } else if (matchDisplayKey(previous) === matchDisplayKey(candidate)) {
      chosen = previous;
    } else {
      chosen = {
        ...candidate,
        liveDetails: mergeLiveDetailsPreservePlayers(previous.liveDetails, candidate.liveDetails),
        squads: candidate.squads?.length ? candidate.squads : previous.squads,
        scorecardInnings: candidate.scorecardInnings?.length
          ? candidate.scorecardInnings
          : previous.scorecardInnings,
      };
    }

    const pairKey = getCanonicalMatchPairKey(chosen);
    if (pairKey && seenPairs.has(pairKey)) {
      const existingIdx = seenPairs.get(pairKey);
      merged[existingIdx] = preferMatchEntity(merged[existingIdx], chosen);
      continue;
    }
    rememberPair(chosen, merged.length);
    merged.push(chosen);
  }

  for (const previous of prev) {
    if (processedIds.has(previous.id)) continue;
    const pairKey = getCanonicalMatchPairKey(previous);
    if (pairKey && seenPairs.has(pairKey)) {
      const existingIdx = seenPairs.get(pairKey);
      merged[existingIdx] = preferMatchEntity(merged[existingIdx], previous);
      continue;
    }
    rememberPair(previous, merged.length);
    merged.push(previous);
  }

  return merged;
}

function seriesSignature(series) {
  return JSON.stringify(
    (series || []).map((item) => [item.id, item.name, item.seriesId, item.matchCount]),
  );
}

export function LiveSportsProvider({ children }) {
  const { isLoggedIn, authStatus } = useAuth();
  const [matches, setMatches] = useState([]);
  const [cricketSeries, setCricketSeries] = useState([]);
  const [tickerMessage, setTickerMessage] = useState('🟢 Syncing live scores...');
  const [scoresError, setScoresError] = useState(null);
  const [isScoresLoading, setIsScoresLoading] = useState(false);
  const matchesSummaryRef = useRef('');
  const seriesSummaryRef = useRef('');
  const hasLoadedRef = useRef(false);
  const pollMsRef = useRef(LIVE_SCORES_POLL_MS);
  const mountedRef = useRef(true);

  const applyScoresPayload = useCallback((data) => {
    if (!data || !mountedRef.current) return;

    if (data.pollIntervalMs && data.pollIntervalMs > 0) {
      pollMsRef.current = data.pollIntervalMs;
    }
    const apiMatches = attachOdds(data.matches || []);
    const normalized = normalizeApiMatches(apiMatches);
    const nextSeries = data.series || [];
    const nextSeriesSignature = seriesSignature(nextSeries);

    if (nextSeriesSignature !== seriesSummaryRef.current) {
      seriesSummaryRef.current = nextSeriesSignature;
      setCricketSeries(nextSeries);
    }

    if (normalized.length > 0) {
      const withSrl = mergeSrlMatches(normalized);
      const nextSummary = summarizeMatches(withSrl);

      if (nextSummary !== matchesSummaryRef.current) {
        matchesSummaryRef.current = nextSummary;
        setMatches((prev) => mergeMatchesStable(prev, withSrl));
      }

      const { counts = {}, sources } = data;
      const okSources = Object.entries(sources || {})
        .filter(([, status]) => status === 'ok')
        .map(([name]) => name);

      const primarySource = okSources.includes('cricbuzz') ? 'CRICBUZZ'
        : okSources.includes('fancode') ? 'FanCode'
        : okSources.includes('espn') ? 'ESPN'
        : 'API';

      const emoji = okSources.includes('cricbuzz') ? '🟢' : '🟡';

      const sportNames = ['cricket', 'soccer', 'basketball', 'tennis', 'american-football'];
      const sportParts = sportNames
        .filter((s) => counts[s] > 0)
        .map((s) => `${counts[s]} ${s}`);

      const total = counts.total ?? normalized.length;
      const live = counts.live ?? 0;
      const nextTicker = `${emoji} ${primarySource} LIVE — ${total} events (${live} live${sportParts.length ? ' · ' + sportParts.join(', ') : ''})`;
      setTickerMessage((prev) => (prev === nextTicker ? prev : nextTicker));
    } else {
      setMatches((prev) => {
        if (prev && prev.length > 0) {
          return prev;
        }
        const withSrl = mergeSrlMatches([]);
        matchesSummaryRef.current = summarizeMatches(withSrl);
        return withSrl;
      });
    }

    if (data.feedError?.message) {
      setScoresError((prev) => (prev === data.feedError.message ? prev : data.feedError.message));
      setTickerMessage((prev) => (prev === '⚠️ Live score feeds unavailable' ? prev : '⚠️ Live score feeds unavailable'));
    } else if (data.httpOk === false && !(data.matches || []).length) {
      setScoresError((prev) => {
        const next = 'Could not reach live score API — check connection and tap Retry.';
        return prev === next ? prev : next;
      });
      setTickerMessage((prev) => (prev === '⚠️ Live score sync failed' ? prev : '⚠️ Live score sync failed'));
    } else {
      setScoresError((prev) => (prev === null ? prev : null));
    }
  }, []);

  const refreshScores = useCallback(async (options = {}) => {
    const { force = false } = options;
    const isInitialLoad = !hasLoadedRef.current;
    if (isInitialLoad) setIsScoresLoading(true);

    try {
      const data = await fetchLiveScores({ force });
      applyScoresPayload(data);
    } catch (error) {
      if (!mountedRef.current) return;
      console.warn('Live scores fetch error:', error);
      setScoresError((prev) => {
        const next = 'Could not reach live score API — check connection and tap Retry.';
        return prev === next ? prev : next;
      });
      setTickerMessage((prev) => (prev === '⚠️ Live score sync failed' ? prev : '⚠️ Live score sync failed'));
    }

    if (isInitialLoad && mountedRef.current) {
      hasLoadedRef.current = true;
      setIsScoresLoading(false);
    }
  }, [applyScoresPayload]);

  // Auth-gated live subscription and polling: ONLY runs when user is authenticated
  useEffect(() => {
    if (!isLoggedIn || authStatus !== 'authenticated') {
      setMatches([]);
      setCricketSeries([]);
      setIsScoresLoading(false);
      hasLoadedRef.current = false;
      return undefined;
    }

    mountedRef.current = true;
    let intervalId = null;
    let cancelled = false;

    const scheduleNext = () => {
      if (cancelled) return;
      const ms = isLiveFeedSocketOpen()
        ? LIVE_SCORES_WS_FALLBACK_POLL_MS
        : (pollMsRef.current || LIVE_SCORES_POLL_MS);
      intervalId = setTimeout(async () => {
        if (cancelled) return;
        if (!document.hidden) {
          await refreshScores();
        }
        scheduleNext();
      }, ms);
    };

    refreshScores().then(() => {
      if (!cancelled) scheduleNext();
    });

    const unsubScores = subscribeLiveChannel('scores:live', (msg) => {
      if (cancelled || !msg?.payload) return;
      applyScoresPayload(msg.payload);
    });

    const onVisibility = () => {
      if (!document.hidden) refreshScores();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      unsubScores();
      if (intervalId) clearTimeout(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isLoggedIn, authStatus, refreshScores, applyScoresPayload]);

  // SRL simulation tick — ONLY when authenticated
  useEffect(() => {
    if (!isLoggedIn || authStatus !== 'authenticated') return undefined;

    const tickSrl = () => {
      if (document.hidden) return;
      setMatches((prev) => {
        const withSrl = mergeSrlMatches(prev);
        const nextSummary = summarizeMatches(withSrl);
        if (nextSummary === matchesSummaryRef.current) return prev;
        matchesSummaryRef.current = nextSummary;
        return mergeMatchesStable(prev, withSrl);
      });
    };

    const srlInterval = setInterval(tickSrl, 2000);
    return () => clearInterval(srlInterval);
  }, [isLoggedIn, authStatus]);

  const metaValue = useMemo(() => ({
    cricketSeries,
    tickerMessage,
    scoresError,
    isScoresLoading,
    refreshScores,
  }), [cricketSeries, tickerMessage, scoresError, isScoresLoading, refreshScores]);

  return (
    <LiveMatchesContext.Provider value={matches}>
      <LiveSportsMetaContext.Provider value={metaValue}>
        {children}
      </LiveSportsMetaContext.Provider>
    </LiveMatchesContext.Provider>
  );
}

export function useLiveMatches() {
  return useContext(LiveMatchesContext);
}

export function useLiveSportsMeta() {
  const context = useContext(LiveSportsMetaContext);
  if (!context) throw new Error('useLiveSportsMeta must be used within LiveSportsProvider');
  return context;
}

export function useLiveSports() {
  const matches = useLiveMatches();
  const meta = useLiveSportsMeta();
  return useMemo(() => ({ matches, ...meta }), [matches, meta]);
}
