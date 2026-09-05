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
import { cricketScoreWeight, cricketSourceRank, getCanonicalMatchPairKey, getMatchPairKeyCandidates } from '../../lib/matchPairKey.mjs';
import { mergeCricketLiveDetails } from '../utils/cricketScoreMerge';
import { useFeatureFlags } from './FeatureFlagsContext';
import { isMatchSRL, isMatchOddsYraSRL, isMatchOtherSRL, isMatchT10 } from '../utils/cricketFormat';
import { passesMatchQualityGate } from '../utils/matchQualityGate';

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
    return {
      ...primary,
      liveDetails: mergeCricketLiveDetails(secondary.liveDetails, primary.liveDetails, primary),
      sources: [...new Set([
        ...(Array.isArray(existing.sources) ? existing.sources : [existing.source].filter(Boolean)),
        ...(Array.isArray(incoming.sources) ? incoming.sources : [incoming.source].filter(Boolean)),
      ])],
      crexEventId: existing.crexEventId || incoming.crexEventId,
      fancodeMatchId: existing.fancodeMatchId || incoming.fancodeMatchId,
      cricbuzzMatchId: existing.cricbuzzMatchId || incoming.cricbuzzMatchId,
    };
  }
  const richer = cricketScoreWeight(incoming) > cricketScoreWeight(existing) ? incoming : existing;
  const other = richer === incoming ? existing : incoming;
  return {
    ...richer,
    liveDetails: mergeCricketLiveDetails(other.liveDetails, richer.liveDetails, richer),
  };
}

function pairIndexForMatch(seenPairs, match) {
  for (const key of getMatchPairKeyCandidates(match)) {
    if (seenPairs.has(key)) return seenPairs.get(key);
  }
  return undefined;
}

function rememberPairKeys(seenPairs, match, index) {
  for (const key of getMatchPairKeyCandidates(match)) {
    seenPairs.set(key, index);
  }
}

function mergeSrlMatches(matches) {
  const apiMatches = (matches || []).filter((m) => !isSrlMatch(m));
  const srl = attachOdds(getIplSrlMatches());

  const seenIds = new Set();
  const seenPairs = new Map();
  const result = [];

  const pushUnique = (match, { allowSrl = false } = {}) => {
    if (!match?.id || seenIds.has(match.id)) return;
    const pairKey = getCanonicalMatchPairKey(match);
    // Force SRL sims into their own bucket even when team names collide with real fixtures
    if (allowSrl || isSrlMatch(match)) {
      const keyed = `srl|${pairKey}`;
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
      return;
    }

    const existingIdx = pairIndexForMatch(seenPairs, match);
    if (existingIdx != null) {
      const existing = result[existingIdx];
      if (existing) {
        const preferred = preferMatchEntity(existing, match);
        result[existingIdx] = preferred;
        seenIds.add(match.id);
        if (preferred?.id) seenIds.add(preferred.id);
        rememberPairKeys(seenPairs, preferred, existingIdx);
      }
      return;
    }
    seenIds.add(match.id);
    rememberPairKeys(seenPairs, match, result.length);
    result.push(match);
  };

  for (const match of apiMatches) pushUnique(match, { allowSrl: false });
  for (const match of srl) pushUnique(match, { allowSrl: true });

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
  const seenPairs = new Map();

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
        liveDetails: mergeCricketLiveDetails(previous.liveDetails, candidate.liveDetails, candidate),
        squads: candidate.squads?.length ? candidate.squads : previous.squads,
        scorecardInnings: candidate.scorecardInnings?.length
          ? candidate.scorecardInnings
          : previous.scorecardInnings,
      };
    }

    const existingIdx = pairIndexForMatch(seenPairs, chosen);
    if (existingIdx != null) {
      merged[existingIdx] = preferMatchEntity(merged[existingIdx], chosen);
      rememberPairKeys(seenPairs, merged[existingIdx], existingIdx);
      continue;
    }
    rememberPairKeys(seenPairs, chosen, merged.length);
    merged.push(chosen);
  }

  // Retain active matches from prev if omitted in next during transient provider delay,
  // but never keep a second copy of the same fixture (pair key).
  for (const previous of prev) {
    if (processedIds.has(previous.id)) continue;
    const existingIdx = pairIndexForMatch(seenPairs, previous);
    if (existingIdx != null) {
      merged[existingIdx] = preferMatchEntity(merged[existingIdx], previous);
      rememberPairKeys(seenPairs, merged[existingIdx], existingIdx);
      continue;
    }
    rememberPairKeys(seenPairs, previous, merged.length);
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
  const { isSportEnabled, isEnabled } = useFeatureFlags();
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
        : okSources.includes('flashscore') ? 'FLASHSCORE'
        : okSources.includes('cricketguru') ? 'CRICKET GURU'
        : okSources.includes('cricketliveline') ? 'CRIX'
        : 'API';

      const emoji = okSources.includes('cricbuzz') ? '🟢' : '🟡';

      const sportNames = ['cricket', 'soccer', 'basketball', 'tennis', 'snooker', 'american-football'];
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

  useEffect(() => {
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
      mountedRef.current = false;
      unsubScores();
      if (intervalId) clearTimeout(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refreshScores, applyScoresPayload]);

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

  const visibleMatches = useMemo(
    () => (matches || []).filter((m) => {
      const sport = String(m?.sport || '').toLowerCase() || 'cricket';
      if (!isSportEnabled(sport)) return false;
      if (!isEnabled('oddsyra_srl_ui', true) && isMatchOddsYraSRL(m)) return false;
      if (!isEnabled('other_srl_ui', true) && isMatchOtherSRL(m)) return false;
      if (!isEnabled('oddsyra_t10_ui', true) && isMatchT10(m)) return false;
      if (!passesMatchQualityGate(m)) return false;
      return true;
    }),
    [matches, isSportEnabled, isEnabled],
  );

  return (
    <LiveMatchesContext.Provider value={visibleMatches}>
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
