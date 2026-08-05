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
import { getIplSrlMatches } from '../../lib/iplSrlSimulator.mjs';
import { LIVE_SCORES_POLL_MS } from '../config/livePolling';
import { computeLiveDynamicOdds } from '../utils/oddsMarketsGenerator';

const LiveMatchesContext = createContext([]);
const LiveSportsMetaContext = createContext(null);

function attachOdds(matches) {
  return matches.map((match) => {
    const liveOdds = computeLiveDynamicOdds(match);
    return {
      ...match,
      preOdds: match.preOdds || match.odds || liveOdds,
      odds: liveOdds,
    };
  });
}

function mergeSrlMatches(matches) {
  const srl = attachOdds(getIplSrlMatches());
  const rest = matches.filter((m) => !String(m.id || '').startsWith('srl_ipl_'));
  return [...rest, ...srl];
}

function matchDisplayKey(match) {
  const ld = match.liveDetails || {};
  const b1 = ld.batter1 || {};
  const b2 = ld.batter2 || {};
  const bowl = ld.bowler || {};
  return [
    match.id,
    match.matchState,
    match.isLive,
    match.time,
    match.odds?.team1,
    match.odds?.team2,
    match.odds?.draw,
    ld.runs,
    ld.wickets,
    ld.overs,
    ld.score1,
    ld.score2,
    ld.wickets2,
    ld.overs2,
    ld.firstRuns,
    ld.chaseRuns,
    ld.firstWickets,
    ld.chaseWickets,
    ld.chaseBallNbr,
    ld.requiredRunRate,
    ld.remainingBalls,
    b1.name,
    b1.runs,
    b1.balls,
    b2.name,
    b2.runs,
    b2.balls,
    bowl.name,
    bowl.wickets,
    bowl.runs,
    bowl.overs,
    (ld.currentOverBalls || []).join(','),
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
  const mountedRef = useRef(true);

  const refreshScores = useCallback(async (options = {}) => {
    const { force = false } = options;
    const isInitialLoad = !hasLoadedRef.current;
    if (isInitialLoad) setIsScoresLoading(true);

    try {
      const data = await fetchLiveScores({ force });
      if (!mountedRef.current) return;

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

        setScoresError((prev) => (prev === null ? prev : null));

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
        const withSrl = mergeSrlMatches([]);
        matchesSummaryRef.current = summarizeMatches(withSrl);
        setMatches(withSrl);
        setScoresError((prev) => {
          const next = withSrl.length
            ? null
            : 'No live events from score providers right now — tap Retry.';
          return prev === next ? prev : next;
        });
        setTickerMessage((prev) => {
          const next = withSrl.length
            ? `🟢 IPL SRL LIVE — ${withSrl.length} simulated fixtures`
            : '⚠️ No matches returned from API';
          return prev === next ? prev : next;
        });
      }
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
  }, []);

  useEffect(() => {
    mountedRef.current = true;
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

    refreshScores().then(() => {
      if (!cancelled) scheduleNext();
    });

    const onVisibility = () => {
      if (!document.hidden) refreshScores();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      mountedRef.current = false;
      if (intervalId) clearTimeout(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refreshScores]);

  useEffect(() => {
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

    const srlInterval = setInterval(tickSrl, 3000);
    return () => clearInterval(srlInterval);
  }, []);

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
