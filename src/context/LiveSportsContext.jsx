import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { matches as defaultMatches } from '../data/mockData';
import { getStableMatchOdds } from '../utils/odds';
import { mergeApiAndDefaultMatches } from '../utils/matchFilters';
import {
  fetchEspnLiveScores,
  fetchFanCodeScores,
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
  const [tickerMessage, setTickerMessage] = useState('🟢 Connecting to FanCode live scores...');
  const oddsCacheRef = useRef(new Map());

  useEffect(() => {
    const fetchLiveScores = async () => {
      let fancodeResult = { matches: [], counts: {} };
      let espnResult = { matches: [], counts: {} };
      let fancodeError = null;

      try {
        fancodeResult = await fetchFanCodeScores();
      } catch (error) {
        fancodeError = error;
        console.warn('FanCode live score fetch error:', error);
      }

      try {
        espnResult = await fetchEspnLiveScores(oddsCacheRef.current);
      } catch (error) {
        console.warn('ESPN live score fetch error:', error);
      }

      const mergedApiMatches = attachOdds(
        mergeLiveScoreSources(fancodeResult.matches, espnResult.matches),
        oddsCacheRef.current
      );

      if (mergedApiMatches.length > 0) {
        setMatches(mergeApiAndDefaultMatches(mergedApiMatches, defaultMatches));
      }

      const liveCount = mergedApiMatches.filter((match) => match.isLive).length;
      const fancodeLive = fancodeResult.counts?.live ?? mergedApiMatches.filter((m) => m.source === 'fancode' && m.isLive).length;
      const cricketCount = mergedApiMatches.filter((m) => m.sport === 'cricket').length;
      const soccerCount = mergedApiMatches.filter((m) => m.sport === 'soccer').length;

      if (fancodeError && mergedApiMatches.length === 0) {
        setTickerMessage('⚠️ Live score feeds unavailable — showing cached data');
        return;
      }

      if (fancodeResult.matches.length > 0) {
        setTickerMessage(
          `🟢 LIVE FanCode ACTIVE — ${mergedApiMatches.length} events (${fancodeLive} live, ${cricketCount} cricket, ${soccerCount} soccer)`
        );
        return;
      }

      setTickerMessage(
        `🟡 ESPN fallback — ${mergedApiMatches.length} events synced (${liveCount} live, ${cricketCount} cricket, ${soccerCount} soccer)`
      );
    };

    fetchLiveScores();
    const interval = setInterval(fetchLiveScores, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <LiveSportsContext.Provider value={{ matches, tickerMessage }}>
      {children}
    </LiveSportsContext.Provider>
  );
}

export function useLiveSports() {
  const context = useContext(LiveSportsContext);
  if (!context) throw new Error('useLiveSports must be used within LiveSportsProvider');
  return context;
}
