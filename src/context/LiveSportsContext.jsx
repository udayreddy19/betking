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
import { DEFAULT_MATCH_FIXTURES } from '../data/defaultMatchesFixtures';
import { LIVE_SCORES_POLL_MS } from '../config/livePolling';
import { computeLiveDynamicOdds } from '../utils/oddsMarketsGenerator';

const LiveMatchesContext = createContext([]);
const LiveSportsMetaContext = createContext(null);

function attachOdds(matches) {
  return matches.map((match) => {
    const homeOdds = match.odds?.home || match.odds?.team1 || match.preOdds?.team1 || match.preOdds?.home;
    const awayOdds = match.odds?.away || match.odds?.team2 || match.preOdds?.team2 || match.preOdds?.away;
    const drawOdds = match.odds?.draw || match.preOdds?.draw;

    const stableOdds = {
      team1: homeOdds || 1.85,
      team2: awayOdds || 1.95,
      draw: drawOdds || null,
      home: homeOdds || 1.85,
      away: awayOdds || 1.95,
    };

    return {
      ...match,
      preOdds: match.preOdds || stableOdds,
      odds: stableOdds,
    };
  });
}

function normalizeTeamKey(name = '') {
  return String(name)
    .replace(/\s*(1st|2nd|3rd|4th|inns|innings|xi|srl|women|men|t20|test)\b/gi, '')
    .replace(/[^a-z0-9]/gi, '')
    .trim()
    .toLowerCase();
}

function mergeSrlMatches(matches) {
  const srl = attachOdds(getIplSrlMatches());
  const defaults = attachOdds(DEFAULT_MATCH_FIXTURES);
  const apiMatches = matches.filter((m) => !String(m.id || '').startsWith('srl_ipl_'));

  // Collect active team tokens from live API matches
  const liveTeams = new Set();
  apiMatches.forEach((m) => {
    const t1 = normalizeTeamKey(m?.team1?.name || m?.team1 || '');
    const t2 = normalizeTeamKey(m?.team2?.name || m?.team2 || '');
    if (t1 && t1.length >= 3) liveTeams.add(t1);
    if (t2 && t2.length >= 3) liveTeams.add(t2);
  });

  // Exclude static default fixtures if either team is currently playing in a live API match
  const filteredDefaults = defaults.filter((m) => {
    const t1 = normalizeTeamKey(m?.team1?.name || m?.team1 || '');
    const t2 = normalizeTeamKey(m?.team2?.name || m?.team2 || '');
    const t1Conflict = t1 && Array.from(liveTeams).some((lt) => t1.includes(lt) || lt.includes(t1));
    const t2Conflict = t2 && Array.from(liveTeams).some((lt) => t2.includes(lt) || lt.includes(t2));
    return !t1Conflict && !t2Conflict;
  });

  const combined = [...apiMatches, ...srl, ...filteredDefaults];

  const seenIds = new Set();
  const seenPairs = new Set();
  const result = [];

  for (const match of combined) {
    if (!match?.id || seenIds.has(match.id)) continue;

    const t1 = normalizeTeamKey(match?.team1?.name || match?.team1 || '');
    const t2 = normalizeTeamKey(match?.team2?.name || match?.team2 || '');
    const pairKey = (t1 && t2) ? [t1, t2].sort().join('::') : null;

    if (pairKey && seenPairs.has(pairKey)) continue;

    seenIds.add(match.id);
    if (pairKey) seenPairs.add(pairKey);
    result.push(match);
  }

  return result;
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

  const prevById = new Map(prev.map((m) => [m.id, m]));
  const processedIds = new Set();
  const merged = [];

  for (const candidate of next) {
    processedIds.add(candidate.id);
    const previous = prevById.get(candidate.id);
    if (!previous) {
      merged.push(candidate);
    } else if (matchDisplayKey(previous) === matchDisplayKey(candidate)) {
      merged.push(previous);
    } else {
      merged.push(candidate);
    }
  }

  // Retain active matches from prev if omitted in next during transient provider delay
  for (const previous of prev) {
    if (!processedIds.has(previous.id)) {
      merged.push(previous);
    }
  }

  return merged;
}

function seriesSignature(series) {
  return JSON.stringify(
    (series || []).map((item) => [item.id, item.name, item.seriesId, item.matchCount]),
  );
}

export function LiveSportsProvider({ children }) {
  const [matches, setMatches] = useState(() => mergeSrlMatches([]));
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
        setMatches((prev) => {
          if (prev && prev.length > 0) {
            return prev;
          }
          const withSrl = mergeSrlMatches([]);
          matchesSummaryRef.current = summarizeMatches(withSrl);
          return withSrl;
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

    const srlInterval = setInterval(tickSrl, 2000);
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
