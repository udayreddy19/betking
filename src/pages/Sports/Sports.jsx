import { useState, useMemo, useEffect, useCallback, useRef, useSyncExternalStore } from 'react';
import { Link, useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { FiSearch, FiHome, HiOutlineChevronDown, HiOutlineChevronUp, FiMessageCircle } from '../../icons';
import FilterChips from '../../components/FilterChips/FilterChips';
import SportIcon from '../../components/SportIcon/SportIcon';
import TeamJersey from '../../components/TeamJersey/TeamJersey';
import MatchCountdownTimer from '../../components/MatchCountdownTimer/MatchCountdownTimer';
import LiveMatchGraphicWidget from '../../components/LiveMatchGraphicWidget/LiveMatchGraphicWidget';
import ErrorBoundary from '../../components/ErrorBoundary/ErrorBoundary';
import SportsLeagueSidebar from '../../components/SportsLeagueSidebar/SportsLeagueSidebar';
import { sportsCategories, featuredLeagues } from '../../data/mockData';
import { useLiveMatches, useLiveSportsMeta } from '../../context/LiveSportsContext';
import { useBetSlip } from '../../context/BetSlipContext';
import { useAuth } from '../../context/AuthContext';
import { isMatchBettable, isTrulyLiveMatch, getMatchState, isMatchFinished } from '../../utils/matchBetting';
import { resolveCricketTeamScores, resolveCricketTossText, isCricketSecondInnings } from '../../utils/cricketScores';
import { isTeamBattingInMatch } from '../../utils/teamFlags';
import {
  isTestMatch,
  getTestMatchDayLabel,
  formatMatchCountdown,
  resolveCricketOversFormat,
  getCricketFormatCardBadge,
  isMatchSRL,
} from '../../utils/cricketFormat';
import { prefetchMatchDetail, enrichFromPoller, subscribeGlobalMatchDetails, getGlobalMatchDetailVersion } from '../../services/matchDetailPoller';
import { useMatchDetail } from '../../hooks/useMatchDetail';
import { useCentralizedMatchState } from '../../hooks/useCentralizedMatchState';
import { centralizedMatchEngine } from '../../services/centralizedMatchStateEngine';
import { filterMatches, filterMatchesBySport, compareMatchesForSportsBoard } from '../../utils/matchFilters';
import { resolveLeagueId, getLeagueMeta, isSameLeague, groupMatchesByLeague, matchBelongsToLeague } from '../../utils/leagueNavigation';
import { matchIdsEqual } from '../../../lib/matchIdPublic.mjs';
import { findLiveMatch } from '../../utils/findLiveMatch';
import { formatTeamShortName, teamDisplayName, asDisplayText } from '../../utils/teamShortName';
import SrlLeaguePanel from '../../components/SrlLeaguePanel/SrlLeaguePanel';
import {
  fetchAuthoritativeMatchOdds,
  getCachedMatchOdds,
  matchOddsStateKey,
  provisionalWinnerMarketsFromMatch,
} from '../../services/oddsService';
import { subscribeLiveChannel } from '../../services/liveFeedSocket';
import { getMarketCategoriesForSport } from '../../utils/marketCategoryLabels';
import { useMatchWatchlist } from '../../hooks/useMatchWatchlist';
import LiveScoresFeedBanner from '../../components/LiveScoresFeedBanner/LiveScoresFeedBanner';
import { mediaQueryMatches, subscribeMediaQuery } from '../../utils/browserCompat';
import './Sports.css';

function filterByLeague(matchList, activeLeague, cricketSeries = []) {
  if (!activeLeague || activeLeague === 'all') return matchList;

  const isSrlLeague = activeLeague === 'ipl-srl' ||
    activeLeague === 't20-intl-srl' ||
    String(activeLeague).toLowerCase().includes('srl');

  if (isSrlLeague) {
    return matchList.filter((match) => {
      const isSrlMatch = match.source === 'srl' ||
        String(match.id || '').startsWith('srl_') ||
        String(match.league || '').toLowerCase().includes('srl') ||
        String(match.seriesName || '').toLowerCase().includes('srl');

      if (!isSrlMatch) return false;

      if (activeLeague === 'ipl-srl'
        || activeLeague === 'oddsyra-srl'
        || String(activeLeague).toLowerCase().includes('oddsyra srl')) {
        // Admin-gated OddsYra SRL only — exclude external feed SRL products
        return match.source === 'srl'
          || String(match.id || '').startsWith('srl_ipl_')
          || (
            match.league === 'OddsYra SRL'
            && match.source !== '10cric2026'
            && match.source !== 'live'
            && !String(match.id || '').startsWith('10cric_')
            && !String(match.id || '').startsWith('oy_')
          );
      }
      return true;
    });
  }

  const dynamicSeries = cricketSeries.find(
    (series) => series.id === activeLeague
      || series.name === activeLeague
      || `cb-series-${series.seriesId}` === activeLeague
  );
  const leagueMeta = getLeagueMeta(activeLeague, cricketSeries);

  if (dynamicSeries || leagueMeta) {
    const res = matchList.filter((match) => {
      if (dynamicSeries) {
        if (match.cricbuzzSeriesId === dynamicSeries.seriesId) return true;
        if (match.league === dynamicSeries.name) return true;
        if (match.seriesName === dynamicSeries.rawName) return true;
      }
      if (leagueMeta && matchBelongsToLeague(match, leagueMeta)) return true;
      return false;
    });
    if (res.length > 0) return res;
  }

  const normalizedKey = String(activeLeague).toLowerCase().replace(/[^a-z0-9]/g, '');
  return matchList.filter((match) => {
    const isMatchSrl = match.source === 'srl' ||
      String(match.id || '').startsWith('srl_') ||
      String(match.league || '').toLowerCase().includes('srl');
    if (isMatchSrl) return false;

    const l1 = String(match.league || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const l2 = String(match.seriesName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return (l1 && (l1 === normalizedKey || l1.includes(normalizedKey))) ||
      (l2 && (l2 === normalizedKey || l2.includes(normalizedKey)));
  });
}

function getMatchScores(match) {
  const enriched = enrichFromPoller(match) || match;
  const isLive = isTrulyLiveMatch(enriched);
  const isFinished = getMatchState(enriched) === 'post';
  const state = centralizedMatchEngine.getSnapshot(enriched?.id, enriched);

  if (!isLive && !isFinished) {
    return { team1Score: '', team2Score: '', isLive, isFinished, state, overs2: enriched?.liveDetails?.overs2 };
  }

  let team1Score = state?.teams?.team1?.score || '';
  let team2Score = state?.teams?.team2?.score || '';
  const ld = enriched?.liveDetails || {};
  const sportKey = String(enriched?.sport || '').toLowerCase();
  const isBallSport = sportKey && !sportKey.includes('cricket');

  if (!isBallSport) {
    const resolved = resolveCricketTeamScores(enriched, ld);
    team1Score = `${resolved.team1.runs}/${resolved.team1.wickets}`;
    team2Score = `${resolved.team2.runs}/${resolved.team2.wickets}`;
  } else if (!team1Score || team1Score === '0/0' || !team2Score || team2Score === '0/0') {
    team1Score = String(ld.score1 ?? 0);
    team2Score = String(ld.score2 ?? 0);
  }

  return { team1Score, team2Score, isLive, isFinished, state, overs2: enriched?.liveDetails?.overs2 };
}

function resolveTossText(match, centralizedState) {
  return resolveCricketTossText(match, {
    toss: centralizedState?.toss,
    commentary: centralizedState?.commentary,
  });
}

function CricketGroupedMatches({ groups, onSelectMatch, getMatchScores, isBetSelected, onQuickBet }) {
  return (
    <div className="sports-cricket-groups">
      {groups.map(({ league, matches }) => (
        <section key={league} className="sports-cricket-group">
          <h3 className="sports-cricket-group__title">{league}</h3>
          {matches.map((m) => {
            const { team1Score, team2Score, isLive, isFinished, overs2 } = getMatchScores(m);
            const showScores = isLive || isFinished;
            const sportKey = String(m.sport || '').toLowerCase();
            const isCricketRow = !sportKey || sportKey.includes('cricket');
            const showDrawSlot = isCricketRow || sportKey === 'soccer' || sportKey === 'esoccer';

            const statusLabel = isLive
              ? (asDisplayText(m.liveDetails?.period)
                || asDisplayText(m.liveDetails?.minute)
                || asDisplayText(m.liveDetails?.currentSet)
                || (isCricketRow
                  ? (isCricketSecondInnings(m, m.liveDetails || {}) ? 'Second innings' : 'First innings')
                  : 'Live'))
              : isFinished
                ? 'Match Ended'
                : (asDisplayText(m.time, 'Scheduled'));

            const battingOvers = isCricketRow && isLive
              ? (isCricketSecondInnings(m, m.liveDetails || {})
                ? (m.liveDetails?.chaseOvers || m.liveDetails?.overs || null)
                : (m.liveDetails?.firstOvers || m.liveDetails?.overs || null))
              : null;
            const oversDisplay = battingOvers && battingOvers !== '0.0'
              ? `(${battingOvers} ov.)`
              : null;

            const marketCount = 22 + ((m.id?.length || 0) % 15);

            return (
              <div
                key={m.id}
                className="sports-cricket-row-10cric"
                onClick={() => onSelectMatch(m.id)}
                style={{ cursor: 'pointer' }}
              >
                {(() => {
                  const rowToss = resolveTossText(m);
                  const rowFormatBadge = isCricketRow ? getCricketFormatCardBadge(m) : null;
                  const rowIsSRL = isMatchSRL(m);
                  return (
                    <div className="sports-cricket-row__meta-bar">
                      <div className="sports-card-badge-group">
                        {isLive ? (
                          <span className="sports-card-badge sports-card-badge--live">🔴 LIVE</span>
                        ) : isFinished ? (
                          <span className="sports-card-badge sports-card-badge--completed">COMPLETED</span>
                        ) : (
                          <span className="sports-card-badge sports-card-badge--upcoming">UPCOMING</span>
                        )}
                        {rowFormatBadge && (
                          <span className="sports-card-badge sports-card-badge--format">{rowFormatBadge}</span>
                        )}
                        {rowIsSRL && (
                          <span className="sports-card-badge sports-card-badge--srl">SRL</span>
                        )}
                      </div>
                      <span className="sports-cricket-row__league-sub">{league}</span>
                      {rowToss && <span className="sports-cricket-row__status-text" style={{ color: 'var(--color-accent-gold)' }}>🪙 {rowToss}</span>}
                      <span className="sports-cricket-row__status-text">{statusLabel}</span>
                    </div>
                  );
                })()}

                <div className="sports-cricket-row__body">
                  <div className="sports-cricket-row__teams-btn">
                    <div className="sports-cricket-row__team">
                      <TeamJersey team={m.team1} size={22} isFlying={isLive && isTeamBattingInMatch(m, m.team1)} />
                      <span className="sports-cricket-row__team-name">{teamDisplayName(m.team1)}</span>
                      {showScores && <strong className="sports-cricket-row__score">{team1Score || '–'}</strong>}
                    </div>
                    <div className="sports-cricket-row__team">
                      <TeamJersey team={m.team2} size={22} isFlying={isLive && isTeamBattingInMatch(m, m.team2)} />
                      <span className="sports-cricket-row__team-name">{teamDisplayName(m.team2)}</span>
                      {showScores && <strong className="sports-cricket-row__score">{team2Score || '–'}</strong>}
                    </div>
                    {oversDisplay && (
                      <div className="sports-cricket-row__overs-sub">
                        {oversDisplay}
                      </div>
                    )}
                  </div>

                  <div className="sports-cricket-row__odds-container" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className={`sports-cricket-odds-card ${isBetSelected(m.id, '1') ? 'selected' : ''}`}
                      disabled={!(Number(m.odds?.team1) > 1)}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (Number(m.odds?.team1) > 1) onQuickBet(m, '1', m.odds.team1, teamDisplayName(m.team1));
                      }}
                    >
                      <span className="odds-label">1</span>
                      <strong className="odds-val">{Number(m.odds?.team1) > 1 ? Number(m.odds.team1).toFixed(2) : '—'}</strong>
                    </button>

                    <button
                      type="button"
                      className={`sports-cricket-odds-card ${isBetSelected(m.id, '2') ? 'selected' : ''}`}
                      disabled={!(Number(m.odds?.team2) > 1)}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (Number(m.odds?.team2) > 1) onQuickBet(m, '2', m.odds.team2, teamDisplayName(m.team2));
                      }}
                    >
                      <span className="odds-label">2</span>
                      <strong className="odds-val">{Number(m.odds?.team2) > 1 ? Number(m.odds.team2).toFixed(2) : '—'}</strong>
                    </button>

                    {m.odds?.draw != null && Number(m.odds.draw) > 1 ? (
                      <button
                        type="button"
                        className={`sports-cricket-odds-card ${isBetSelected(m.id, 'X') ? 'selected' : ''}`}
                        onClick={(e) => { e.stopPropagation(); onQuickBet(m, 'X', m.odds.draw, 'Draw'); }}
                      >
                        <span className="odds-label">X</span>
                        <strong className="odds-val">{Number(m.odds.draw).toFixed(2)}</strong>
                      </button>
                    ) : showDrawSlot ? (
                      <div className="sports-cricket-odds-card locked" title="Not available">
                        <span className="lock-icon">—</span>
                      </div>
                    ) : null}

                    <button
                      type="button"
                      className="sports-cricket-markets-capsule"
                      onClick={(e) => { e.stopPropagation(); onSelectMatch(m.id); }}
                    >
                      +{marketCount}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

function MarketsSuspended() {
  return (
    <div className="sports-market-suspended">
      <span>🔒</span>
      <p>Markets closed for this match</p>
    </div>
  );
}

export default function Sports() {
  const matches = useLiveMatches();
  const matchDetailVersion = useSyncExternalStore(subscribeGlobalMatchDetails, getGlobalMatchDetailVersion, () => 0);
  const { tickerMessage, cricketSeries, scoresError, refreshScores, isScoresLoading } = useLiveSportsMeta();
  const { addBet, isBetSelected } = useBetSlip();
  const { user, showToast } = useAuth();
  const { ids: watchlistIds, count: watchlistCount } = useMatchWatchlist();
  const isAdminUser = user?.role === 'admin' || user?.email === 'admin@oddsyra.com';
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const isLiveBettingPage = location.pathname === '/live-betting';

  const initialSport = searchParams.get('sport') || 'all';
  const initialLeague = resolveLeagueId(searchParams.get('league')) || 'all';
  const initialMatchId = searchParams.get('match');
  const initialTab = searchParams.get('tab') || searchParams.get('status') || (isLiveBettingPage ? 'live' : 'all');

  const [activeSport, setActiveSport] = useState(initialSport);
  const [activeLeague, setActiveLeague] = useState(initialLeague);
  const [activeStateTab, setActiveStateTab] = useState(initialTab);
  const [viewMode, setViewMode] = useState(initialMatchId ? 'match' : 'league');
  const [activeMarketCat, setActiveMarketCat] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMatchId, setSelectedMatchId] = useState(initialMatchId);
  const [expandedMarkets, setExpandedMarkets] = useState({
    winner: true, tie: true, over10: true, delivery: false, partnership: false,
  });
  const [isWideLayout, setIsWideLayout] = useState(() => mediaQueryMatches('(min-width: 1025px)'));
  const [persistedMatchFallback, setPersistedMatchFallback] = useState(null);

  useEffect(() => subscribeMediaQuery('(min-width: 1025px)', setIsWideLayout), []);

  const isIplSrlView = isSameLeague(activeLeague, 'ipl-srl', cricketSeries);

  const baseSportPool = useMemo(() => {
    return filterByLeague(
      filterMatches(matches || [], { sport: activeSport, stateTab: activeStateTab, searchQuery }),
      activeLeague,
      cricketSeries,
    );
  }, [matches, activeSport, activeLeague, activeStateTab, searchQuery, cricketSeries]);

  const stateCounts = useMemo(() => {
    const sportFiltered = filterMatchesBySport(matches || [], activeSport);
    const leagueFiltered = filterByLeague(sportFiltered, activeLeague, cricketSeries);
    let live = 0;
    let upcoming = 0;
    let completed = 0;
    for (const m of leagueFiltered) {
      const s = getMatchState(m);
      if (s === 'in') live++;
      else if (s === 'pre') upcoming++;
      else if (s === 'post') completed++;
    }
    return { all: leagueFiltered.length, live, upcoming, completed };
  }, [matches, activeSport, activeLeague, cricketSeries]);

  const sportMatches = useMemo(() => {
    return [...baseSportPool].sort((a, b) => compareMatchesForSportsBoard(a, b, getMatchScores));
  }, [baseSportPool, matchDetailVersion]);

  const liveMatches = useMemo(
    () => sportMatches.filter((m) => getMatchState(m) === 'in'),
    [sportMatches],
  );

  const cricketGroups = useMemo(() => groupMatchesByLeague(sportMatches), [sportMatches]);

  // Prefer the current league pool. Deep-linked match ids search the full feed (any league).
  const matchDeepLinkId = searchParams.get('match');
  const matchTeamsHint = searchParams.get('teams');

  useEffect(() => {
    const targetId = selectedMatchId || matchDeepLinkId;
    if (!targetId) {
      setPersistedMatchFallback(null);
      return;
    }
    const foundInLive = findLiveMatch(matches, { matchId: targetId, matchName: matchTeamsHint })
      || findLiveMatch(sportMatches, { matchId: targetId, matchName: matchTeamsHint })
      || findLiveMatch(liveMatches, { matchId: targetId, matchName: matchTeamsHint });

    if (foundInLive) {
      setPersistedMatchFallback(null);
      return;
    }

    let cancelled = false;
    fetch(`/api/v1/matches/${encodeURIComponent(targetId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.match) {
          setPersistedMatchFallback(data.match);
        }
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [selectedMatchId, matchDeepLinkId, matches, sportMatches, liveMatches, matchTeamsHint]);

  const lastActiveMatchRef = useRef(null);

  const baseActiveMatch = useMemo(() => {
    const targetId = selectedMatchId || matchDeepLinkId;
    if (targetId) {
      const selected = findLiveMatch(matches, {
        matchId: targetId,
        matchName: matchTeamsHint,
      })
        || findLiveMatch(sportMatches, { matchId: targetId, matchName: matchTeamsHint })
        || findLiveMatch(liveMatches, { matchId: targetId, matchName: matchTeamsHint });
      if (selected) {
        lastActiveMatchRef.current = selected;
        return selected;
      }
      if (persistedMatchFallback && (persistedMatchFallback.id === targetId || persistedMatchFallback.matchId === targetId)) {
        lastActiveMatchRef.current = persistedMatchFallback;
        return persistedMatchFallback;
      }
      // Keep waiting while scores load — avoid flashing "Match not found"
      if (isScoresLoading) return lastActiveMatchRef.current;

      // Bet deep-link for a fixture that left the live board — still open match view.
      const parts = String(matchTeamsHint || '')
        .split(/\s+vs\.?\s+/i)
        .map((p) => p.trim())
        .filter(Boolean);
      const t1 = parts.length >= 2 ? parts[0] : (parts[0] || 'Open bet');
      const t2 = parts.length >= 2 ? parts[1] : 'Fixture';
      const stub = {
        id: targetId,
        matchId: targetId,
        sport: activeSport || 'cricket',
        team1: { name: t1 },
        team2: { name: t2 },
        matchName: parts.length >= 2 ? `${t1} vs ${t2}` : undefined,
        league: 'Open bet',
        matchState: 'post',
        isLive: false,
        isCompleted: true,
        time: 'Left live board',
        liveDetails: {
          commentary: 'This fixture is no longer listed on the live board. Your bet stays open until settlement.',
        },
        _betDeepLinkStub: true,
      };
      lastActiveMatchRef.current = stub;
      return stub;
    }

    const fromPool = liveMatches[0] || sportMatches[0] || null;
    if (fromPool) {
      lastActiveMatchRef.current = fromPool;
      return fromPool;
    }

    return null;
  }, [
    sportMatches,
    matches,
    selectedMatchId,
    liveMatches,
    matchDeepLinkId,
    matchTeamsHint,
    isScoresLoading,
    activeSport,
  ]);

  const activeMatch = useMatchDetail(baseActiveMatch);

  useEffect(() => {
    if (activeMatch?.id) {
      centralizedMatchEngine.updateMatchState(activeMatch.id, activeMatch);
    }
  }, [activeMatch]);

  const centralizedState = useCentralizedMatchState(activeMatch);

  const marketCategories = useMemo(() => {
    return getMarketCategoriesForSport(activeMatch?.sport || activeSport || 'cricket');
  }, [activeMatch, activeSport]);

  const [matchMarkets, setMatchMarkets] = useState([]);
  const activeMatchRef = useRef(activeMatch);
  activeMatchRef.current = activeMatch;
  const oddsStateKey = matchOddsStateKey(activeMatch);

  useEffect(() => {
    const matchId = activeMatch?.id || activeMatch?.matchId;
    if (!matchId) {
      setMatchMarkets([]);
      return undefined;
    }
    if (isMatchFinished(activeMatch) || !isMatchBettable(activeMatch)) {
      setMatchMarkets([]);
      return undefined;
    }

    setMatchMarkets(() => {
      const cached = getCachedMatchOdds(matchId, oddsStateKey);
      if (cached?.markets?.length) return cached.markets;
      return provisionalWinnerMarketsFromMatch(activeMatch);
    });

    let isCancelled = false;
    const loadOdds = () => {
      const m = activeMatchRef.current;
      if (!m) return;
      fetchAuthoritativeMatchOdds(
        m.id || m.matchId,
        m.team1?.name || m.team1,
        m.team2?.name || m.team2,
        { match: m },
      ).then((snapshot) => {
        if (isCancelled) return;
        if ((m.id || m.matchId) !== matchId) return;
        if (snapshot?.matchId && snapshot.matchId !== matchId) return;
        if (snapshot?.markets?.length) setMatchMarkets(snapshot.markets);
      });
    };

    loadOdds();
    let lastOddsWs = 0;
    const poll = setInterval(() => {
      if (Date.now() - lastOddsWs < 4000) return;
      loadOdds();
    }, 2000);

    const unsubOdds = subscribeLiveChannel(`odds:match:${matchId}`, (msg) => {
      if (isCancelled) return;
      const markets = msg.payload?.markets;
      if (msg.eventType === 'odds.updated' && Array.isArray(markets) && markets.length > 0) {
        if (msg.matchId && msg.matchId !== matchId) return;
        lastOddsWs = Date.now();
        setMatchMarkets(markets);
      }
    });
    const unsubScores = subscribeLiveChannel(`scores:match:${matchId}`, () => {});

    return () => {
      isCancelled = true;
      clearInterval(poll);
      unsubOdds();
      unsubScores();
    };
  }, [activeMatch?.id, activeMatch?.matchId, activeMatch?.matchState, activeMatch?.isLive]);

  useEffect(() => {
    const m = activeMatch;
    const matchId = m?.id || m?.matchId;
    if (!matchId || !oddsStateKey) return undefined;
    if (isMatchFinished(m) || !isMatchBettable(m)) {
      setMatchMarkets([]);
      return undefined;
    }
    let isCancelled = false;
    fetchAuthoritativeMatchOdds(
      matchId,
      m.team1?.name || m.team1,
      m.team2?.name || m.team2,
      { match: m },
    ).then((snapshot) => {
      if (isCancelled) return;
      if (snapshot?.matchId && snapshot.matchId !== matchId) return;
      if (snapshot?.markets?.length) setMatchMarkets(snapshot.markets);
    });
    return () => { isCancelled = true; };
  }, [activeMatch?.id, activeMatch?.matchId, oddsStateKey]);

  const liveMatchPrefetchKey = useMemo(
    () => liveMatches.slice(0, 3).map((match) => {
      const ld = match.liveDetails || {};
      return `${match.id}:${match.matchState}:${ld.runs ?? ''}:${ld.score1 ?? ''}:${ld.score2 ?? ''}`;
    }).join('|'),
    [liveMatches],
  );

  useEffect(() => {
    if (!liveMatchPrefetchKey) return;
    const seen = new Set();
    liveMatches.slice(0, 3).forEach((match) => {
      if (seen.has(match.id)) return;
      seen.add(match.id);
      prefetchMatchDetail(match);
      fetchAuthoritativeMatchOdds(match.id, match.team1?.name || match.team1, match.team2?.name || match.team2, { match });
    });
  }, [liveMatchPrefetchKey]);

  const selectMatch = useCallback((matchId) => {
    setSelectedMatchId(matchId);
    setViewMode('match');
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('sport', activeSport);
      if (activeLeague) next.set('league', resolveLeagueId(activeLeague));
      next.set('match', matchId);
      return next;
    });
    const found = sportMatches.find((m) => m.id === matchId || matchIdsEqual(m.id || m.matchId, matchId));
    if (found) prefetchMatchDetail(found, { priority: true });
  }, [activeSport, activeLeague, setSearchParams, sportMatches]);

  const showLeagueOverview = useCallback((leagueId = activeLeague) => {
    const resolved = resolveLeagueId(leagueId, cricketSeries);
    setActiveLeague(resolved);
    setViewMode('league');
    setSelectedMatchId(null);
    setSearchQuery('');
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('sport', activeSport);
      if (resolved) next.set('league', resolved);
      else next.delete('league');
      if (activeStateTab && activeStateTab !== 'all') next.set('tab', activeStateTab);
      next.delete('match');
      return next;
    }, { replace: true });
    requestAnimationFrame(() => {
      document.getElementById('sports-match-ticker')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }, [activeSport, activeLeague, activeStateTab, setSearchParams, cricketSeries]);

  const goBackFromMatch = useCallback(() => {
    const historyIndex = window.history.state?.idx;
    if (typeof historyIndex === 'number' && historyIndex > 0) {
      navigate(-1);
      return;
    }
    showLeagueOverview(activeLeague);
  }, [navigate, showLeagueOverview, activeLeague]);

  const toggleMarket = (key) => {
    setExpandedMarkets((prev) => {
      // Unset keys render expanded (`!== false`), so treat undefined as open.
      const currentlyExpanded = prev[key] !== false;
      return { ...prev, [key]: !currentlyExpanded };
    });
  };

  const showCategory = (cat) => {
    if (activeMarketCat === 'all') return true;
    if (activeMarketCat === cat) return true;
    if (activeMarketCat === 'totals' && (cat === 'totals' || cat === 'over' || cat === 'overs')) return true;
    if (activeMarketCat === 'over' && (cat === 'over' || cat === 'overs' || cat === 'delivery')) return true;
    if (activeMarketCat === 'delivery' && (cat === 'delivery' || cat === 'deliveries')) return true;
    if (activeMarketCat === 'props' && (cat === 'props' || cat === 'player_props' || cat === 'h2h')) return true;
    if (activeMarketCat === 'partnership' && (cat === 'partnership' || cat === 'wickets')) return true;
    return false;
  };

  const oddsBtnClass = (selection) => {
    if (!activeMatch) return 'sports-market-odds-btn';
    return `sports-market-odds-btn ${isBetSelected(activeMatch.id, selection) ? 'selected' : ''}`;
  };

  const handleSportChange = useCallback((sportId) => {
    setActiveSport(sportId);
    setActiveLeague('all');
    setViewMode('league');
    setSelectedMatchId(null);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('sport', sportId);
      next.set('league', 'all');
      if (activeStateTab && activeStateTab !== 'all') next.set('tab', activeStateTab);
      next.delete('match');
      return next;
    }, { replace: true });
  }, [setSearchParams, activeStateTab]);

  const handleLeagueChange = useCallback((leagueId) => {
    showLeagueOverview(leagueId);
  }, [showLeagueOverview]);

  const handleStateTabChange = useCallback((tab) => {
    setActiveStateTab(tab);
    setViewMode('league');
    setSelectedMatchId(null);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (tab && tab !== 'all') next.set('tab', tab);
      else next.delete('tab');
      next.delete('match');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  useEffect(() => {
    const sport = searchParams.get('sport');
    const league = searchParams.get('league');
    const match = searchParams.get('match');
    const tab = searchParams.get('tab') || searchParams.get('status');

    if (sport) setActiveSport(sport);
    if (tab) setActiveStateTab(tab);

    if (match) {
      setSelectedMatchId(match);
      setViewMode('match');
      // Always resolve league from URL when opening a match. Missing league → all
      // so My Bets deep-links are not stuck behind a previous league filter.
      setActiveLeague(league ? resolveLeagueId(league, cricketSeries) : 'all');
    } else {
      setSelectedMatchId(null);
      setViewMode('league');
      if (league) setActiveLeague(resolveLeagueId(league, cricketSeries));
    }
  }, [searchParams, cricketSeries]);

  const matchTimeLabel = activeMatch
    ? (isTrulyLiveMatch(activeMatch)
      ? 'Live'
      : getMatchState(activeMatch) === 'post'
        ? 'Finished'
        : (activeMatch.time || 'Scheduled'))
    : 'Scheduled';

  const activeLeagueMeta = getLeagueMeta(activeLeague, cricketSeries);
  const breadcrumbLeague = asDisplayText(
    activeLeagueMeta?.breadcrumb || activeLeagueMeta?.name || activeMatch?.league,
    'All Leagues',
  );
  const sportLabel = sportsCategories.find(s => s.id === activeSport)?.name || 'Cricket';
  const leagueChips = featuredLeagues.filter(l => l.sport === activeSport);
  const canBetActive = activeMatch ? isMatchBettable(activeMatch) : false;
  const liveStatusClass = tickerMessage?.includes('⚠️')
    ? 'error'
    : tickerMessage?.includes('Connecting')
      ? 'loading'
      : 'live';

  const placeBet = (selection, odds, selectionName, marketName, marketId) => {
    if (!activeMatch || !(Number(odds) > 1)) return;
    addBet(activeMatch, selection, odds, selectionName, {
      marketName,
      marketId,
      silentAdd: true,
    });
  };

  const quickBet = (match, selection, odds, selectionName, marketId = 'match_winner') => {
    if (odds == null || Number.isNaN(Number(odds))) return;
    addBet(match, selection, odds, selectionName, {
      marketName: 'Match Winner',
      marketId,
      silentAdd: true,
    });
  };

  const sportCounts = useMemo(() => {
    const pool = isLiveBettingPage
      ? filterMatches(matches || [], { stateTab: 'bettable' })
      : filterMatches(matches || [], { stateTab: 'all' });
    const map = {};
    for (const cat of sportsCategories) {
      if (cat.id === 'all') { map['all'] = pool.length; continue; }
      map[cat.id] = pool.filter((m) => {
        const s = String(m.sport || '').toLowerCase();
        if (cat.id === 'cricket') return s === 'cricket';
        if (cat.id === 'soccer') return s === 'soccer' || s === 'football';
        if (cat.id === 'basketball') return s === 'basketball';
        if (cat.id === 'tennis') return s === 'tennis';
        if (cat.id === 'table-tennis') return s === 'table-tennis' || s === 'tabletennis';
        if (cat.id === 'kabaddi') return s === 'kabaddi';
        if (cat.id === 'esoccer') return s === 'esoccer';
        if (cat.id === 'volleyball') return s === 'volleyball';
        if (cat.id === 'american-football') return s === 'american-football' || s === 'nfl';
        return s === cat.id;
      }).length;
    }
    return map;
  }, [matches, isLiveBettingPage]);

  return (
    <div
      className={`sports-page${viewMode === 'match' ? ' sports-page--match' : ''}`}
      id="sports-page"
    >
      <div className="sports-page-inner">
        <SportsLeagueSidebar
          activeSport={activeSport}
          activeLeague={activeLeague}
          cricketSeries={cricketSeries}
          onSelectLeague={handleLeagueChange}
        />

        <div className="sports-center">
          {isLiveBettingPage && (
            <div className="sports-page-heading">
              <h1>Live Betting</h1>
              <p>
                {sportMatches.length > 0
                  ? `${sportMatches.length} ${sportsCategories.find((s) => s.id === activeSport)?.name || 'events'}`
                  : `No ${sportsCategories.find((s) => s.id === activeSport)?.name?.toLowerCase() || 'events'} right now`}
              </p>
            </div>
          )}

          {!isWideLayout && viewMode === 'match' && activeMatch ? (
            <div className="sports-mobile-match-nav">
              <button
                type="button"
                className="sports-mobile-match-back"
                onClick={goBackFromMatch}
              >
                ← {breadcrumbLeague}
              </button>
              <span className="sports-mobile-match-title">
                {teamDisplayName(activeMatch.team1, activeMatch.team1?.shortName)} v {teamDisplayName(activeMatch.team2, activeMatch.team2?.shortName)}
              </span>
            </div>
          ) : (
            <nav className="sports-breadcrumbs" aria-label="Breadcrumb">
              <Link to="/" className="sports-breadcrumb-home" aria-label="Home">
                <FiHome />
              </Link>
              <span className="sports-breadcrumb-sep">›</span>
              <button
                type="button"
                className="sports-breadcrumb-link"
                onClick={() => handleSportChange(activeSport)}
              >
                {sportLabel}
              </button>
              <span className="sports-breadcrumb-sep">›</span>
              {viewMode === 'match' && activeMatch ? (
                <>
                  <button
                    type="button"
                    className="sports-breadcrumb-link"
                    onClick={() => showLeagueOverview(activeLeague)}
                  >
                    {breadcrumbLeague}
                  </button>
                  <span className="sports-breadcrumb-sep">›</span>
                  <span className="sports-breadcrumb-current">
                    {teamDisplayName(activeMatch.team1)} vs. {teamDisplayName(activeMatch.team2)}
                  </span>
                </>
              ) : (
                <span className="sports-breadcrumb-current">{breadcrumbLeague}</span>
              )}
            </nav>
          )}

          <FilterChips
            items={sportsCategories}
            activeId={activeSport}
            onSelect={handleSportChange}
            counts={sportCounts}
            className="filter-chips-row sports-sport-chips"
          />

          <div className="sports-league-chips sports-league-chips--browse">
            <button
              type="button"
              className={`sports-league-chip ${activeStateTab === 'live' ? 'active' : ''}`}
              onClick={() => handleStateTabChange('live')}
            >
              <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#ef4444', marginRight: 6, verticalAlign: 'middle', boxShadow: '0 0 6px #ef4444' }} />
              Live{stateCounts.live > 0 ? ` (${stateCounts.live})` : ''}
            </button>
            <button
              type="button"
              className={`sports-league-chip ${activeStateTab === 'upcoming' ? 'active' : ''}`}
              onClick={() => handleStateTabChange('upcoming')}
            >
              Upcoming{stateCounts.upcoming > 0 ? ` (${stateCounts.upcoming})` : ''}
            </button>
            <button
              type="button"
              className={`sports-league-chip ${activeStateTab === 'completed' ? 'active' : ''}`}
              onClick={() => handleStateTabChange('completed')}
            >
              Completed{stateCounts.completed > 0 ? ` (${stateCounts.completed})` : ''}
            </button>
            <button
              type="button"
              className={`sports-league-chip ${activeStateTab === 'all' ? 'active' : ''}`}
              onClick={() => handleStateTabChange('all')}
            >
              All{stateCounts.all > 0 ? ` (${stateCounts.all})` : ''}
            </button>
            {leagueChips.map(league => (
              <button
                key={league.id}
                type="button"
                className={`sports-league-chip ${isSameLeague(activeLeague, league.id, cricketSeries) ? 'active' : ''}`}
                onClick={() => handleLeagueChange(league.id)}
              >
                {league.icon && (
                  <SportIcon sport={league.sport} icon={league.icon} className="sports-league-chip-icon" />
                )}
                {league.name}
              </button>
            ))}
          </div>

          {isAdminUser && (
            <div className={`sports-live-status sports-live-status--${liveStatusClass} sports-live-status-bar`} role="status">
              <span className="sports-live-status-dot" />
              {tickerMessage || 'Syncing live scores…'}
            </div>
          )}

          <LiveScoresFeedBanner
            message={scoresError}
            onRetry={() => refreshScores({ force: true })}
            retrying={isScoresLoading}
          />

          <div className="sports-state-panel">
          <div className="sports-search sports-search--mobile">
            <div className="sports-search-wrapper">
              <FiSearch className="sports-search-icon" />
              <input
                className="sports-search-input"
                placeholder="Search teams or leagues"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                aria-label="Search matches"
              />
              {searchQuery && (
                <button type="button" className="sports-search-clear" onClick={() => setSearchQuery('')}>
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="sports-match-ticker sports-match-ticker--browse" id="sports-match-ticker">
            {sportMatches.length === 0 ? (
              <div className="sports-ticker-empty">
                <p>
                  {`No ${activeStateTab !== 'all' ? activeStateTab : ''} matches found${searchQuery ? ` for "${searchQuery}"` : ''}.`}
                </p>
                {isLiveBettingPage ? (
                  <Link to="/sports" className="sports-empty-action">
                    Browse all sports
                  </Link>
                ) : (searchQuery || (activeLeague && activeLeague !== 'all') || (activeStateTab && activeStateTab !== 'all')) && (
                  <button
                    type="button"
                    className="sports-empty-action"
                    onClick={() => { setSearchQuery(''); handleLeagueChange('all'); handleStateTabChange('all'); }}
                  >
                    Clear filters
                  </button>
                )}
              </div>
            ) : sportMatches.map(m => {
              const { team1Score, team2Score, isLive, isFinished } = getMatchScores(m);
              const cardFormatBadge = getCricketFormatCardBadge(m);
              const cardIsSRL = isMatchSRL(m);
              return (
                <button
                  key={m.id}
                  type="button"
                  className={`sports-ticker-card ${viewMode === 'match' && activeMatch?.id === m.id ? 'selected' : ''}`}
                  onClick={() => selectMatch(m.id)}
                >
                  <div className="sports-card-badge-group">
                    {isLive ? (
                      <span className="sports-card-badge sports-card-badge--live">🔴 LIVE</span>
                    ) : isFinished ? (
                      <span className="sports-card-badge sports-card-badge--completed">COMPLETED</span>
                    ) : (
                      <span className="sports-card-badge sports-card-badge--upcoming">UPCOMING</span>
                    )}
                    {cardFormatBadge && (
                      <span className="sports-card-badge sports-card-badge--format">{cardFormatBadge}</span>
                    )}
                    {cardIsSRL && (
                      <span className="sports-card-badge sports-card-badge--srl">SRL</span>
                    )}
                  </div>
                  <div className="sports-ticker-row">
                    <span title={teamDisplayName(m.team1)}>{formatTeamShortName(teamDisplayName(m.team1), m.team1?.shortName)}</span>
                    <span>{team1Score || '—'}</span>
                  </div>
                  <div className="sports-ticker-row">
                    <span title={teamDisplayName(m.team2)}>{formatTeamShortName(teamDisplayName(m.team2), m.team2?.shortName)}</span>
                    <span>{team2Score || '—'}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {viewMode === 'league' && isIplSrlView && (
            <SrlLeaguePanel
              matches={sportMatches}
              onSelectMatch={selectMatch}
              onQuickBet={quickBet}
              isBetSelected={isBetSelected}
            />
          )}

          {viewMode === 'league' && !isIplSrlView && cricketGroups.length > 0 && (
            <CricketGroupedMatches
              groups={cricketGroups}
              onSelectMatch={selectMatch}
              getMatchScores={getMatchScores}
              isBetSelected={isBetSelected}
              onQuickBet={quickBet}
            />
          )}

          {viewMode === 'league' && !isIplSrlView && sportMatches.length > 0 && cricketGroups.length === 0 && (
            <div className="sports-league-overview">
              {isLiveBettingPage ? (
                <h2 className="sports-section-heading">Matches</h2>
              ) : (
                <>
                  <h2 className="sports-league-overview-title">{breadcrumbLeague}</h2>
                  <p className="sports-league-overview-subtitle">Select a match to view markets and live scores</p>
                </>
              )}
              <div className="sports-league-overview-list">
                {sportMatches.map((m) => {
                  const { team1Score, team2Score, isLive } = getMatchScores(m);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className="sports-league-overview-card"
                      onClick={() => selectMatch(m.id)}
                    >
                      <div className="sports-league-overview-card-top">
                        <span className="sports-league-overview-time">{asDisplayText(m.time)}</span>
                        {isLive && <span className="sports-league-overview-live">LIVE</span>}
                      </div>
                      <div className="sports-league-overview-teams">
                        <div className="sports-league-overview-team">
                          <TeamJersey team={m.team1} size={22} isFlying={isLive && isTeamBattingInMatch(m, m.team1)} />
                          <span>{teamDisplayName(m.team1)}</span>
                          <strong>{team1Score || '–'}</strong>
                        </div>
                        <div className="sports-league-overview-team">
                          <TeamJersey team={m.team2} size={22} isFlying={isLive && isTeamBattingInMatch(m, m.team2)} />
                          <span>{teamDisplayName(m.team2)}</span>
                          <strong>{team2Score || '–'}</strong>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          </div>

          {viewMode === 'match' && activeMatch ? (
            <>
              {!isWideLayout && (
                <div className="sports-mobile-live-widget">
                  {activeMatch._betDeepLinkStub ? (
                    <div className="live-graphic-card-10cric" style={{ padding: '28px 18px', textAlign: 'center' }}>
                      <div className="live-widget-inn-badge" style={{ marginBottom: 12 }}>OPEN BET</div>
                      <div className="live-widget-teams-row" style={{ marginBottom: 12 }}>
                        <span className="live-widget-team">{teamDisplayName(activeMatch.team1)}</span>
                        <span className="live-widget-scoreline live-widget-scoreline--vs">VS</span>
                        <span className="live-widget-team">{teamDisplayName(activeMatch.team2)}</span>
                      </div>
                      <p className="live-widget-prematch-status">
                        This fixture left the live board. Your bet stays open until it is settled.
                      </p>
                      <button
                        type="button"
                        className="sports-empty-action"
                        style={{ marginTop: 14 }}
                        onClick={() => showLeagueOverview('all')}
                      >
                        Browse live matches
                      </button>
                    </div>
                  ) : (
                    <ErrorBoundary resetKey={activeMatch?.id}>
                      <LiveMatchGraphicWidget match={activeMatch} />
                    </ErrorBoundary>
                  )}
                </div>
              )}

              {(() => {
                const { team1Score, team2Score, isLive, isFinished } = getMatchScores(activeMatch);
                const commText = centralizedState?.commentary || activeMatch.liveDetails?.commentary;

                const matchFormatResolved = resolveCricketOversFormat(activeMatch);
                const matchFormatBadge = matchFormatResolved === 'THE_HUNDRED'
                  ? 'HUNDRED'
                  : matchFormatResolved;

                const isTest = isTestMatch(activeMatch) || matchFormatBadge === 'TEST';
                const testDayBadge = isTest ? getTestMatchDayLabel(activeMatch) : null;
                const rawVenue = activeMatch.venue || activeMatch.ground || activeMatch.liveDetails?.venue;
                const venueText = typeof rawVenue === 'string'
                  ? rawVenue
                  : (rawVenue?.venueName || rawVenue?.name || (rawVenue?.city ? `${rawVenue.city}${rawVenue.country ? `, ${rawVenue.country}` : ''}` : null));

                const rawSeries = activeMatch.seriesName || activeMatch.league;
                const seriesText = typeof rawSeries === 'string' ? rawSeries : (rawSeries?.name || null);

                const tossText = resolveTossText(activeMatch, centralizedState);

                return (
                  <div className="sports-match-banner sports-match-banner--desktop-only">
                    <div className="sports-match-banner-time" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '12px' }}>
                      {isLive ? (
                        <>
                          <span className="sports-live-badge-dot" />
                          <span style={{ color: '#ef4444', fontWeight: 800 }}>LIVE</span>
                          {isTest && testDayBadge && (
                            <span style={{ background: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '3px 10px', borderRadius: '16px', fontSize: '0.78rem', fontWeight: 800 }}>
                              📅 {testDayBadge}
                            </span>
                          )}
                        </>
                      ) : isFinished ? (
                        <span style={{ color: '#94a3b8', fontWeight: 800 }}>FINISHED</span>
                      ) : (
                        <MatchCountdownTimer match={activeMatch} style={{ fontSize: '0.92rem', padding: '6px 18px' }} />
                      )}
                    </div>

                    <div className="sports-match-banner-meta-bar">
                      <span className="sports-format-badge">{matchFormatBadge}</span>
                      {seriesText && <span className="sports-series-name">🏆 {seriesText}</span>}
                      {venueText && <span className="sports-venue-tag">📍 {venueText}</span>}
                    </div>

                    <div className="sports-match-banner-teams">
                      <div className="sports-match-banner-team-col">
                        <TeamJersey team={activeMatch.team1} size={48} isFlying={isLive && isTeamBattingInMatch(activeMatch, activeMatch.team1)} />
                        <span className="sports-match-banner-team">{teamDisplayName(activeMatch.team1)}</span>
                        {(isLive || isFinished) && team1Score && (
                          <strong className="sports-match-banner-score">{team1Score}</strong>
                        )}
                      </div>

                      <span className="sports-match-banner-vs">VS</span>

                      <div className="sports-match-banner-team-col">
                        <TeamJersey team={activeMatch.team2} size={48} isFlying={isLive && isTeamBattingInMatch(activeMatch, activeMatch.team2)} />
                        <span className="sports-match-banner-team">{teamDisplayName(activeMatch.team2)}</span>
                        {(isLive || isFinished) && team2Score && (
                          <strong className="sports-match-banner-score">{team2Score}</strong>
                        )}
                      </div>
                    </div>

                    {tossText && (
                      <div className="sports-toss-badge">
                        <span>🪙 {tossText}</span>
                      </div>
                    )}

                    <p className="sports-match-banner-commentary">
                      {isTest && testDayBadge
                        ? `📅 ${testDayBadge} · ${commText || 'Match play active'}`
                        : (isFinished
                          ? (commText || 'Match completed')
                          : (!isLive ? `⏱️ Match ${formatMatchCountdown(activeMatch)}` : (commText || 'Match play active')))}
                    </p>
                  </div>
                );
              })()}

              <div className="sports-market-cats">
                {marketCategories.map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    className={`sports-market-cat ${activeMarketCat === cat.id ? 'active' : ''}`}
                    onClick={() => setActiveMarketCat(cat.id)}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {activeMatch._betDeepLinkStub ? (
                <div className="sports-empty" style={{ marginTop: 12 }}>
                  <h3>Fixture left the live board</h3>
                  <p>
                    Your open bet is still active and will settle when the result is confirmed.
                    Live odds for this listing are no longer available.
                  </p>
                  <button type="button" className="sports-empty-action" onClick={() => showLeagueOverview('all')}>
                    Browse live matches
                  </button>
                </div>
              ) : (
                <>
                  {(!canBetActive || isMatchFinished(activeMatch)) && (
                    <MarketsSuspended />
                  )}
                  {canBetActive && !isMatchFinished(activeMatch) && matchMarkets.length === 0 && (
                    <p className="sports-empty">No bettable markets for this match yet. Odds will appear when the book is open.</p>
                  )}

                  {canBetActive && !isMatchFinished(activeMatch) && matchMarkets.map((market) => {
                if (!showCategory(market.category)) return null;
                if (market.status && market.status !== 'OPEN') return null;
                const options = (market.options || market.selections || []).filter(
                  (opt) => opt.bettable !== false && Number(opt.odds) >= 1.01,
                );
                if (options.length === 0) return null;
                const isExpanded = expandedMarkets[market.key] !== false;
                return (
                  <div key={market.key} className="sports-market-panel">
                    <button
                      type="button"
                      className="sports-market-panel-header"
                      onClick={() => toggleMarket(market.key)}
                    >
                      <span>{market.title}</span>
                      {isExpanded ? <HiOutlineChevronUp /> : <HiOutlineChevronDown />}
                    </button>
                    {isExpanded && (
                      canBetActive ? (
                        <div className={`sports-market-odds-grid ${options.length === 3 ? 'three-col' : (options.length === 4 ? 'four-col' : (options.length > 4 ? 'multi-col' : 'two-col'))}`}>
                          {options.map((opt) => (
                            <button
                              key={opt.selection}
                              type="button"
                              className={oddsBtnClass(opt.selection)}
                              onClick={() => placeBet(
                                opt.selectionId || opt.selection,
                                opt.odds,
                                opt.name,
                                market.title || market.name,
                                market.marketId || market.id || market.key,
                              )}
                            >
                              <span>{opt.name}</span>
                              <span className="odds-val">{Number(opt.odds).toFixed(2)}</span>
                            </button>
                          ))}
                        </div>
                      ) : <MarketsSuspended />
                    )}
                  </div>
                );
              })}
                </>
              )}

            </>
          ) : viewMode === 'match' ? (
            <div className="sports-empty">
              {isScoresLoading ? (
                <>
                  <h3>Loading match…</h3>
                  <p>Fetching the live board</p>
                </>
              ) : (
                <>
                  <h3>Match not found</h3>
                  <p>This match is no longer available</p>
                  <button type="button" className="sports-empty-action" onClick={() => showLeagueOverview('all')}>
                    Back to All Leagues
                  </button>
                </>
              )}
            </div>
          ) : sportMatches.length === 0 ? (
            <div className="sports-empty">
              <h3>No matches in this league</h3>
              <p>
                {isLiveBettingPage
                  ? 'There are no matches available at the moment.'
                  : 'Select another league or sport'}
              </p>
              {isLiveBettingPage && (
                <Link to="/sports" className="sports-empty-action">
                  Browse all sports
                </Link>
              )}
            </div>
          ) : null}
        </div>

        <aside className="sports-right">
          {isWideLayout && activeMatch && (
            <div className="sports-desktop-live-widget">
              {activeMatch._betDeepLinkStub ? (
                <div className="live-graphic-card-10cric" style={{ padding: '28px 18px', textAlign: 'center' }}>
                  <div className="live-widget-inn-badge" style={{ marginBottom: 12 }}>OPEN BET</div>
                  <div className="live-widget-teams-row" style={{ marginBottom: 12 }}>
                    <span className="live-widget-team">{teamDisplayName(activeMatch.team1)}</span>
                    <span className="live-widget-scoreline live-widget-scoreline--vs">VS</span>
                    <span className="live-widget-team">{teamDisplayName(activeMatch.team2)}</span>
                  </div>
                  <p className="live-widget-prematch-status">
                    This fixture left the live board. Your bet stays open until it is settled.
                  </p>
                </div>
              ) : (
                <ErrorBoundary resetKey={activeMatch?.id}>
                  <LiveMatchGraphicWidget match={activeMatch} />
                </ErrorBoundary>
              )}
            </div>
          )}
          <div className="sports-search sports-search--desktop">
            <div className="sports-search-wrapper">
              <FiSearch className="sports-search-icon" />
              <input
                className="sports-search-input"
                placeholder="Search for events"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                id="sports-search-right"
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
