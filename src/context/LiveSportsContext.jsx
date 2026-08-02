import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { matches as defaultMatches } from '../data/mockData';
import { getStableMatchOdds } from '../utils/odds';
import { mergeApiAndDefaultMatches } from '../utils/matchFilters';
import { fetchLiveScores } from '../services/liveScoresService';

const LiveSportsContext = createContext(null);

function attachOdds(matches, oddsCache) {
  return matches.map((match) => {
    if (match.odds) return match;
    const cacheKey = match.id;
    if (!oddsCache.has(cacheKey)) {
      oddsCache.set(cacheKey, getStableMatchOdds(cacheKey, { hasDraw: match.sport === 'soccer' }));
    }
    return { ...match, odds: oddsCache.get(cacheKey) };
  });
}

export function LiveSportsProvider({ children }) {
  const [matches, setMatches] = useState(defaultMatches);
  const [cricketSeries, setCricketSeries] = useState([]);
  const [tickerMessage, setTickerMessage] = useState('🟢 Syncing live scores...');
  const [scoresError, setScoresError] = useState(null);
  const [isScoresLoading, setIsScoresLoading] = useState(true);
  const oddsCacheRef = useRef(new Map());

  const refreshScores = useCallback(async () => {
    setIsScoresLoading(true);

    try {
      const data = await fetchLiveScores();
      const apiMatches = attachOdds(data.matches || [], oddsCacheRef.current);

      setCricketSeries(data.series || []);

      if (apiMatches.length > 0) {
        setMatches(mergeApiAndDefaultMatches(apiMatches, defaultMatches));
        setScoresError(null);

        // Build ticker message from source status
        const { counts, sources } = data;
        const okSources = Object.entries(sources || {})
          .filter(([, status]) => status === 'ok')
          .map(([name]) => name);

        const primarySource = okSources.includes('cricbuzz') ? 'CRICBUZZ'
          : okSources.includes('fancode') ? 'FanCode'
          : okSources.includes('espn') ? 'ESPN'
          : 'API';

        const emoji = okSources.includes('cricbuzz') ? '🟢' : '🟡';

        // Build dynamic sport breakdown
        const sportNames = ['cricket', 'soccer', 'basketball', 'tennis', 'american-football'];
        const sportParts = sportNames
          .filter((s) => counts[s] > 0)
          .map((s) => `${counts[s]} ${s}`);

        setTickerMessage(
          `${emoji} ${primarySource} LIVE — ${counts.total} events (${counts.live} live${sportParts.length ? ' · ' + sportParts.join(', ') : ''})`
        );
      } else {
        setScoresError('Live scores temporarily unavailable. Showing cached matches — tap Retry.');
        setTickerMessage('⚠️ Live score sync failed — using cached data');
      }
    } catch (error) {
      console.warn('Live scores fetch error:', error);
      setScoresError('Live scores temporarily unavailable. Showing cached matches — tap Retry.');
      setTickerMessage('⚠️ Live score sync failed — using cached data');
    }

    setIsScoresLoading(false);
  }, []);

  useEffect(() => {
    refreshScores();
    const interval = setInterval(refreshScores, 5000);
    return () => clearInterval(interval);
  }, [refreshScores]);

  return (
    <LiveSportsContext.Provider value={{
      matches,
      cricketSeries,
      tickerMessage,
      scoresError,
      isScoresLoading,
      refreshScores,
    }}>
      {children}
    </LiveSportsContext.Provider>
  );
}

export function useLiveSports() {
  const context = useContext(LiveSportsContext);
  if (!context) throw new Error('useLiveSports must be used within LiveSportsProvider');
  return context;
}
