import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { matches as defaultMatches } from '../data/mockData';
import { getStableMatchOdds } from '../utils/odds';
import { mergeApiAndDefaultMatches } from '../utils/matchFilters';
import {
  fetchEspnLiveScores,
  fetchFanCodeScores,
  fetchCricbuzzScores,
  mergeLiveScoreSources,
} from '../services/liveScoresService';

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
  const [tickerMessage, setTickerMessage] = useState('🟢 Syncing Cricbuzz live scores...');
  const [scoresError, setScoresError] = useState(null);
  const [isScoresLoading, setIsScoresLoading] = useState(true);
  const oddsCacheRef = useRef(new Map());

  const refreshScores = useCallback(async () => {
    setIsScoresLoading(true);
    let cricbuzzResult = { matches: [], series: [], counts: {} };
    let fancodeResult = { matches: [], counts: {} };
    let espnResult = { matches: [], counts: {} };
    let hadSourceError = false;

    try {
      cricbuzzResult = await fetchCricbuzzScores();
      setCricketSeries(cricbuzzResult.series || []);
    } catch (error) {
      hadSourceError = true;
      console.warn('Cricbuzz fetch error:', error);
    }

    try {
      fancodeResult = await fetchFanCodeScores();
    } catch (error) {
      hadSourceError = true;
      console.warn('FanCode live score fetch error:', error);
    }

    try {
      espnResult = await fetchEspnLiveScores(oddsCacheRef.current);
    } catch (error) {
      hadSourceError = true;
      console.warn('ESPN live score fetch error:', error);
    }

    const mergedApiMatches = attachOdds(
      mergeLiveScoreSources(cricbuzzResult.matches, fancodeResult.matches, espnResult.matches),
      oddsCacheRef.current
    );

    if (mergedApiMatches.length > 0) {
      setMatches(mergeApiAndDefaultMatches(mergedApiMatches, defaultMatches));
      setScoresError(null);
    } else if (hadSourceError) {
      setScoresError('Live scores temporarily unavailable. Showing cached matches — tap Retry.');
      setTickerMessage('⚠️ Live score sync failed — using cached data');
    }

    const liveCount = mergedApiMatches.filter((match) => match.isLive).length;
    const cricketCount = mergedApiMatches.filter((m) => m.sport === 'cricket').length;
    const soccerCount = mergedApiMatches.filter((m) => m.sport === 'soccer').length;
    const cbTotal = cricbuzzResult.counts?.total || cricbuzzResult.matches.length;

    if (mergedApiMatches.length > 0) {
      if (cbTotal > 0) {
        setTickerMessage(
          `🟢 CRICBUZZ LIVE — ${cbTotal} cricket matches (${cricbuzzResult.counts?.live || liveCount} live) · ${mergedApiMatches.length} total events`
        );
      } else if (fancodeResult.matches.length > 0) {
        setTickerMessage(
          `🟡 FanCode fallback — ${mergedApiMatches.length} events (${liveCount} live, ${cricketCount} cricket, ${soccerCount} soccer)`
        );
      } else {
        setTickerMessage(
          `🟡 ESPN fallback — ${mergedApiMatches.length} events synced (${liveCount} live)`
        );
      }
    }

    setIsScoresLoading(false);
  }, []);

  useEffect(() => {
    refreshScores();
    const interval = setInterval(refreshScores, 30000);
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
