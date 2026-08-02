import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { getStableMatchOdds } from '../utils/odds';
import { normalizeApiMatches } from '../utils/matchFilters';
import { fetchLiveScores } from '../services/liveScoresService';
import { LIVE_SCORES_POLL_MS } from '../config/livePolling';

const LiveMatchesContext = createContext([]);
const LiveSportsMetaContext = createContext(null);

function attachOdds(matches, oddsCache) {
  return matches.map((match) => {
    if (match.odds) return match;
    const cacheKey = match.id;
    if (!oddsCache.has(cacheKey)) {
      oddsCache.set(cacheKey, getStableMatchOdds(cacheKey, {
        hasDraw: match.sport === 'soccer' || match.sport === 'esoccer',
      }));
    }
    return { ...match, odds: oddsCache.get(cacheKey) };
  });
}

function matchDisplayKey(match) {
  const ld = match.liveDetails || {};
  return [
    match.id,
    match.matchState,
    match.isLive,
    match.time,
    ld.runs,
    ld.wickets,
    ld.overs,
    ld.score2,
    ld.wickets2,
    ld.overs2,
    ld.firstRuns,
    ld.chaseRuns,
    ld.firstWickets,
    ld.chaseWickets,
    ld.chaseBallNbr,
    ld.batter1?.name,
    ld.batter2?.name,
    ld.commentary,
  ].join(':');
}

function summarizeMatches(matches) {
  return matches.map(matchDisplayKey).join('|');
}

function mergeMatchesStable(prev, next) {
  if (prev.length === 0) return next;
  if (prev.length !== next.length) return next;

  const prevById = new Map(prev.map((match) => [match.id, match]));
  let changed = false;
  const merged = next.map((candidate) => {
    const previous = prevById.get(candidate.id);
    if (!previous) {
      changed = true;
      return candidate;
    }
    if (matchDisplayKey(previous) === matchDisplayKey(candidate)) {
      return previous;
    }
    changed = true;
    return candidate;
  });

  return changed ? merged : prev;
}

function seriesSignature(series) {
  return JSON.stringify(
    (series || []).map((item) => [item.id, item.name, item.seriesId, item.matchCount]),
  );
}

export function LiveSportsProvider({ children }) {
  const [matches, setMatches] = useState([]);
  const [cricketSeries, setCricketSeries] = useState([]);
  const [tickerMessage, setTickerMessage] = useState('🟢 Syncing live scores...');
  const [scoresError, setScoresError] = useState(null);
  const [isScoresLoading, setIsScoresLoading] = useState(true);
  const oddsCacheRef = useRef(new Map());
  const matchesSummaryRef = useRef('');
  const seriesSummaryRef = useRef('');
  const hasLoadedRef = useRef(false);
  const pollMsRef = useRef(LIVE_SCORES_POLL_MS);

  const refreshScores = useCallback(async (options = {}) => {
    const { force = false } = options;
    const isInitialLoad = !hasLoadedRef.current;
    if (isInitialLoad) setIsScoresLoading(true);

    try {
      const data = await fetchLiveScores({ force });
      if (data.pollIntervalMs && data.pollIntervalMs > 0) {
        pollMsRef.current = data.pollIntervalMs;
      }
      const apiMatches = attachOdds(data.matches || [], oddsCacheRef.current);
      const normalized = normalizeApiMatches(apiMatches);
      const nextSeries = data.series || [];
      const nextSeriesSignature = seriesSignature(nextSeries);

      if (nextSeriesSignature !== seriesSummaryRef.current) {
        seriesSummaryRef.current = nextSeriesSignature;
        setCricketSeries(nextSeries);
      }

      if (normalized.length > 0) {
        const nextSummary = summarizeMatches(normalized);

        if (nextSummary !== matchesSummaryRef.current) {
          matchesSummaryRef.current = nextSummary;
          setMatches((prev) => mergeMatchesStable(prev, normalized));
        }

        setScoresError((prev) => (prev === null ? prev : null));

        const { counts, sources } = data;
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

        const nextTicker = `${emoji} ${primarySource} LIVE — ${counts.total} events (${counts.live} live${sportParts.length ? ' · ' + sportParts.join(', ') : ''})`;
        setTickerMessage((prev) => (prev === nextTicker ? prev : nextTicker));
      } else {
        matchesSummaryRef.current = '';
        setMatches((prev) => (prev.length === 0 ? prev : []));
        setScoresError((prev) => {
          const next = 'No live events from score providers right now — tap Retry.';
          return prev === next ? prev : next;
        });
        setTickerMessage((prev) => (prev === '⚠️ No matches returned from API' ? prev : '⚠️ No matches returned from API'));
      }
    } catch (error) {
      console.warn('Live scores fetch error:', error);
      setScoresError((prev) => {
        const next = 'Could not reach live score API — check connection and tap Retry.';
        return prev === next ? prev : next;
      });
      setTickerMessage((prev) => (prev === '⚠️ Live score sync failed' ? prev : '⚠️ Live score sync failed'));
    }

    if (isInitialLoad) {
      hasLoadedRef.current = true;
      setIsScoresLoading(false);
    }
  }, []);

  useEffect(() => {
    let intervalId = null;
    let cancelled = false;

    const scheduleNext = () => {
      if (cancelled) return;
      const ms = pollMsRef.current || LIVE_SCORES_POLL_MS;
      intervalId = setTimeout(async () => {
        if (cancelled) return;
        if (!document.hidden) {
          await refreshScores();
        }
        scheduleNext();
      }, ms);
    };

    refreshScores().then(() => scheduleNext());

    const onVisibility = () => {
      if (!document.hidden) refreshScores();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      if (intervalId) clearTimeout(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refreshScores]);

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
