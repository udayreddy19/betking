import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { getStableMatchOdds } from '../utils/odds';
import { normalizeApiMatches } from '../utils/matchFilters';
import { fetchLiveScores } from '../services/liveScoresService';
import { LIVE_SCORES_POLL_MS } from '../config/livePolling';

const LiveSportsContext = createContext(null);

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

function summarizeMatches(matches) {
  return matches.map((m) => [
    m.id,
    m.matchState,
    m.isLive,
    m.time,
    m.liveDetails?.runs,
    m.liveDetails?.score2,
    m.liveDetails?.wickets,
    m.liveDetails?.wickets2,
  ].join(':')).join('|');
}

export function LiveSportsProvider({ children }) {
  const [matches, setMatches] = useState([]);
  const [cricketSeries, setCricketSeries] = useState([]);
  const [tickerMessage, setTickerMessage] = useState('🟢 Syncing live scores...');
  const [scoresError, setScoresError] = useState(null);
  const [isScoresLoading, setIsScoresLoading] = useState(true);
  const oddsCacheRef = useRef(new Map());
  const matchesSummaryRef = useRef('');
  const hasLoadedRef = useRef(false);
  const pollMsRef = useRef(LIVE_SCORES_POLL_MS);

  const refreshScores = useCallback(async (options = {}) => {
    const { force = false } = options;
    if (!hasLoadedRef.current) setIsScoresLoading(true);

    try {
      const data = await fetchLiveScores({ force });
      if (data.pollIntervalMs && data.pollIntervalMs > 0) {
        pollMsRef.current = data.pollIntervalMs;
      }
      const apiMatches = attachOdds(data.matches || [], oddsCacheRef.current);
      const normalized = normalizeApiMatches(apiMatches);

      setCricketSeries(data.series || []);

      if (normalized.length > 0) {
        matchesSummaryRef.current = summarizeMatches(normalized);
        setMatches(normalized);
        setScoresError(null);

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

        setTickerMessage(
          `${emoji} ${primarySource} LIVE — ${counts.total} events (${counts.live} live${sportParts.length ? ' · ' + sportParts.join(', ') : ''})`
        );
      } else {
        setMatches([]);
        setScoresError('No live events from score providers right now — tap Retry.');
        setTickerMessage('⚠️ No matches returned from API');
      }
    } catch (error) {
      console.warn('Live scores fetch error:', error);
      setScoresError('Could not reach live score API — check connection and tap Retry.');
      setTickerMessage('⚠️ Live score sync failed');
    }

    hasLoadedRef.current = true;
    setIsScoresLoading(false);
  }, []);

  useEffect(() => {
    const tick = () => {
      if (document.hidden) return;
      refreshScores();
    };

    refreshScores();

    const interval = setInterval(tick, LIVE_SCORES_POLL_MS);

    const onVisibility = () => {
      if (!document.hidden) refreshScores();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refreshScores]);

  const value = useMemo(() => ({
    matches,
    cricketSeries,
    tickerMessage,
    scoresError,
    isScoresLoading,
    refreshScores,
  }), [matches, cricketSeries, tickerMessage, scoresError, isScoresLoading, refreshScores]);

  return (
    <LiveSportsContext.Provider value={value}>
      {children}
    </LiveSportsContext.Provider>
  );
}

export function useLiveSports() {
  const context = useContext(LiveSportsContext);
  if (!context) throw new Error('useLiveSports must be used within LiveSportsProvider');
  return context;
}
