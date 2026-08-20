import { useState, useMemo, useEffect, useCallback, useRef, useSyncExternalStore } from 'react';
import { Link, useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { FiSearch, FiHome, HiOutlineChevronDown, HiOutlineChevronUp, FiMessageCircle } from '../../icons';
import FilterChips from '../../components/FilterChips/FilterChips';
import SportIcon from '../../components/SportIcon/SportIcon';
import TeamJersey from '../../components/TeamJersey/TeamJersey';
import MatchCountdownTimer from '../../components/MatchCountdownTimer/MatchCountdownTimer';
import BetSlip from '../../components/BetSlip/BetSlip';
import LiveMatchGraphicWidget from '../../components/LiveMatchGraphicWidget/LiveMatchGraphicWidget';
import ErrorBoundary from '../../components/ErrorBoundary/ErrorBoundary';
import SportsLeagueSidebar from '../../components/SportsLeagueSidebar/SportsLeagueSidebar';
import { sportsCategories, featuredLeagues } from '../../data/mockData';
import { useLiveMatches, useLiveSportsMeta } from '../../context/LiveSportsContext';
import { useBetSlip } from '../../context/BetSlipContext';
import { useAuth } from '../../context/AuthContext';
import { isMatchBettable, isTrulyLiveMatch, getMatchState, isMatchFinished } from '../../utils/matchBetting';
import { resolveCricketTeamScores, resolveCricketTossText } from '../../utils/cricketScores';
import { isTeamBattingInMatch } from '../../utils/teamFlags';
import { isTestMatch, getTestMatchDayLabel, formatMatchCountdown, resolveCricketOversFormat } from '../../utils/cricketFormat';
import { prefetchMatchDetail, enrichFromPoller, subscribeGlobalMatchDetails, getGlobalMatchDetailVersion } from '../../services/matchDetailPoller';
import { useMatchDetail } from '../../hooks/useMatchDetail';
import { useCentralizedMatchState } from '../../hooks/useCentralizedMatchState';
import { centralizedMatchEngine } from '../../services/centralizedMatchStateEngine';
import { filterMatches } from '../../utils/matchFilters';
import { resolveLeagueId, getLeagueMeta, isSameLeague, groupMatchesByLeague, matchBelongsToLeague } from '../../utils/leagueNavigation';
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
            && !String(match.id || '').startsWith('10cric_')
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
  if (dynamicSeries) {
    const res = matchList.filter((match) =>
      match.league === dynamicSeries.name
      || match.seriesName === dynamicSeries.rawName
      || match.cricbuzzSeriesId === dynamicSeries.seriesId
    );
    if (res.length > 0) return res;
  }

  const leagueMeta = getLeagueMeta(activeLeague, cricketSeries);
  if (leagueMeta) {
    const res = matchList.filter((match) => matchBelongsToLeague(match, leagueMeta));
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
                  ? (team2Score && team2Score !== '0/0' ? 'Second innings' : 'First innings')
                  : 'Live'))
              : isFinished
                ? 'Match Ended'
                : (asDisplayText(m.time, 'Scheduled'));

            const oversDisplay = isCricketRow && isLive && overs2 && overs2 !== '0.0'
              ? `(${overs2} ov.)`
              : (isCricketRow && isLive && m.liveDetails?.overs && m.liveDetails.overs !== '0.0' ? `(${m.liveDetails.overs} ov.)` : null);

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
                  return (
                    <div className="sports-cricket-row__meta-bar">
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
  useSyncExternalStore(subscribeGlobalMatchDetails, getGlobalMatchDetailVersion, () => 0);
  const { tickerMessage, cricketSeries, scoresError, refreshScores, isScoresLoading } = useLiveSportsMeta();
  const { addBet, isBetSelected } = useBetSlip();
  const { user, showToast } = useAuth();
  const { ids: watchlistIds, count: watchlistCount } = useMatchWatchlist();
  const isAdminUser = user?.role === 'admin' || user?.email === 'admin@oddsyra.com';
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const isLiveBettingPage = location.pathname === '/live-betting';

  const initialSport = searchParams.get('sport') || 'cricket';
  const initialLeague = resolveLeagueId(searchParams.get('league')) || 'all';
  const initialMatchId = searchParams.get('match');

  const [activeSport, setActiveSport] = useState(initialSport);
  const [activeLeague, setActiveLeague] = useState(initialLeague);
  const [viewMode, setViewMode] = useState(initialMatchId ? 'match' : 'league');
  const [activeMarketCat, setActiveMarketCat] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMatchId, setSelectedMatchId] = useState(initialMatchId);
  const [expandedMarkets, setExpandedMarkets] = useState({
    winner: true, tie: true, over10: true, delivery: false, partnership: false,
  });
  const [isWideLayout, setIsWideLayout] = useState(() => mediaQueryMatches('(min-width: 1025px)'));

  useEffect(() => subscribeMediaQuery('(min-width: 1025px)', setIsWideLayout), []);



  const isIplSrlView = isSameLeague(activeLeague, 'ipl-srl');
  const watchlistOnly = searchParams.get('watchlist') === '1';

  const sportMatches = useMemo(() => {
    const filtered = watchlistOnly
      ? filterMatches(matches || [], { stateTab: isLiveBettingPage ? 'bettable' : 'all', searchQuery })
        .filter((m) => watchlistIds.includes(String(m.id)))
      : filterByLeague(
        filterMatches(matches || [], {
          sport: activeSport,
          stateTab: isLiveBettingPage ? 'bettable' : 'all',
          searchQuery,
        }),
        activeLeague,
        cricketSeries,
      );

    let list = filtered;

    return [...list].sort((a, b) => {
      const liveA = getMatchState(a) === 'in' ? 0 : 1;
      const liveB = getMatchState(b) === 'in' ? 0 : 1;
      if (liveA !== liveB) return liveA - liveB;
      const leagueCmp = String(a.league || '').localeCompare(String(b.league || ''));
      if (leagueCmp) return leagueCmp;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });
  }, [matches, activeSport, activeLeague, searchQuery, cricketSeries, isLiveBettingPage, watchlistOnly, watchlistIds]);

  const liveMatches = useMemo(
    () => sportMatches.filter((m) => getMatchState(m) === 'in'),
    [sportMatches],
  );

  const upcomingMatches = useMemo(
    () => sportMatches.filter((m) => getMatchState(m) === 'pre'),
    [sportMatches],
  );

  const cricketGroups = useMemo(() => groupMatchesByLeague(sportMatches), [sportMatches]);

  const lastActiveMatchRef = useRef(null);

  // Find the selected match in the full matches array (not just filtered sportMatches)
  // Persist lastActiveMatchRef so background API refreshes never flash 'Match not found'
  const baseActiveMatch = useMemo(() => {
    const targetId = selectedMatchId
      || lastActiveMatchRef.current?.id
      || liveMatches[0]?.id
      || sportMatches[0]?.id;
    if (!targetId) return null;

    let match = sportMatches.find(m => m.id === targetId)
      || matches.find(m => m.id === targetId);

    if (match) {
      lastActiveMatchRef.current = match;
      return match;
    }

    return lastActiveMatchRef.current || null;
  }, [sportMatches, matches, selectedMatchId, liveMatches]);

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
    const found = sportMatches.find((m) => m.id === matchId);
    if (found) prefetchMatchDetail(found, { priority: true });
  }, [activeSport, activeLeague, setSearchParams, sportMatches]);

  const showLeagueOverview = useCallback((leagueId = activeLeague) => {
    const resolved = resolveLeagueId(leagueId);
    setActiveLeague(resolved);
    setViewMode('league');
    setSelectedMatchId(null);
    setSearchQuery('');
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('sport', activeSport);
      if (resolved) next.set('league', resolved);
      else next.delete('league');
      next.delete('match');
      next.delete('watchlist');
      return next;
    }, { replace: true });
    requestAnimationFrame(() => {
      document.getElementById('sports-match-ticker')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }, [activeSport, activeLeague, setSearchParams]);

  const goBackFromMatch = useCallback(() => {
    const historyIndex = window.history.state?.idx;
    if (typeof historyIndex === 'number' && historyIndex > 0) {
      navigate(-1);
      return;
    }
    showLeagueOverview(activeLeague);
  }, [navigate, showLeagueOverview, activeLeague]);

  const toggleMarket = (key) => {
    setExpandedMarkets(prev => ({ ...prev, [key]: !prev[key] }));
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
      next.delete('match');
      next.delete('watchlist');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const handleLeagueChange = useCallback((leagueId) => {
    showLeagueOverview(leagueId);
  }, [showLeagueOverview]);

  const toggleWatchlistFilter = useCallback(() => {
    setViewMode('league');
    setSelectedMatchId(null);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('match');
      if (next.get('watchlist') === '1') next.delete('watchlist');
      else next.set('watchlist', '1');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  useEffect(() => {
    const sport = searchParams.get('sport');
    const league = searchParams.get('league');
    const match = searchParams.get('match');

    if (sport) setActiveSport(sport);
    if (league) setActiveLeague(resolveLeagueId(league));

    if (match) {
      setSelectedMatchId(match);
      setViewMode('match');
    } else {
      setSelectedMatchId(null);
      setViewMode('league');
    }
  }, [searchParams]);

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

  const placeBet = (selection, odds, selectionName, marketName) => {
    if (!activeMatch || !(Number(odds) > 1)) return;
    addBet(activeMatch, selection, odds, selectionName, { marketName });
  };

  const quickBet = (match, selection, odds, selectionName) => {
    if (odds == null || Number.isNaN(Number(odds))) return;
    addBet(match, selection, odds, selectionName, { marketName: 'Match Winner' });
  };

  const sportCounts = useMemo(() => {
    const pool = isLiveBettingPage
      ? filterMatches(matches || [], { stateTab: 'bettable' })
      : (matches || []);
    const map = {};
    for (const cat of sportsCategories) {
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
                {liveMatches.length > 0
                  ? `${liveMatches.length} live · ${upcomingMatches.length} upcoming ${sportsCategories.find((s) => s.id === activeSport)?.name || 'events'}`
                  : `No live ${sportsCategories.find((s) => s.id === activeSport)?.name?.toLowerCase() || 'events'} right now — ${upcomingMatches.length} upcoming`}
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
                className={`sports-league-chip ${watchlistOnly ? 'active' : ''}`}
                onClick={toggleWatchlistFilter}
              >
                ★ Watchlist{watchlistCount ? ` (${watchlistCount})` : ''}
              </button>
              <button
                type="button"
                className={`sports-league-chip ${!watchlistOnly && activeLeague === 'all' ? 'active' : ''}`}
                onClick={() => handleLeagueChange('all')}
              >
                All Leagues
              </button>
              {leagueChips.map(league => (
                <button
                  key={league.id}
                  type="button"
                  className={`sports-league-chip ${!watchlistOnly && isSameLeague(activeLeague, league.id) ? 'active' : ''}`}
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
                  {watchlistOnly
                    ? 'No watchlist matches are on the board right now. Star a match from Sports or Home to save it.'
                    : isLiveBettingPage
                    ? `No ${sportsCategories.find((s) => s.id === activeSport)?.name?.toLowerCase() || 'sport'} matches available. Try another sport or check back soon.`
                    : `No matches found${searchQuery ? ` for "${searchQuery}"` : ''}.`}
                </p>
                {isLiveBettingPage ? (
                  <Link to="/sports" className="sports-empty-action">
                    Browse all sports
                  </Link>
                ) : (searchQuery || (activeLeague && activeLeague !== 'all')) && (
                  <button
                    type="button"
                    className="sports-empty-action"
                    onClick={() => { setSearchQuery(''); handleLeagueChange('all'); }}
                  >
                    Clear filters
                  </button>
                )}
              </div>
            ) : sportMatches.slice(0, 24).map(m => {
              const { team1Score, team2Score, isLive } = getMatchScores(m);
              return (
                <button
                  key={m.id}
                  type="button"
                  className={`sports-ticker-card ${viewMode === 'match' && activeMatch?.id === m.id ? 'selected' : ''}`}
                  onClick={() => selectMatch(m.id)}
                >
                  <div className="sports-ticker-row">
                    <span title={teamDisplayName(m.team1)}>{formatTeamShortName(teamDisplayName(m.team1), m.team1?.shortName)}</span>
                    <span>{team1Score || ''}</span>
                  </div>
                  <div className="sports-ticker-row">
                    <span title={teamDisplayName(m.team2)}>{formatTeamShortName(teamDisplayName(m.team2), m.team2?.shortName)}</span>
                    <span>{team2Score || ''}</span>
                  </div>
                  {isLive && <span className="sports-ticker-live">LIVE</span>}
                </button>
              );
            })}
          </div>

          {viewMode === 'league' && isLiveBettingPage && liveMatches.length > 0 && cricketGroups.length === 0 && (
            <section className="sports-live-section">
              <h2 className="sports-section-heading">Live now</h2>
              <div className="sports-league-overview-list">
                {liveMatches.map((m) => {
                  const { team1Score, team2Score, isLive } = getMatchScores(m);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className="sports-league-overview-card"
                      onClick={() => selectMatch(m.id)}
                    >
                      <div className="sports-league-overview-card-top">
                        <span className="sports-league-overview-time">{asDisplayText(m.league)}</span>
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
            </section>
          )}

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
              {isLiveBettingPage && upcomingMatches.length > 0 && (
                <h2 className="sports-section-heading">
                  {liveMatches.length > 0 ? 'Upcoming' : 'Matches'}
                </h2>
              )}
              {!isLiveBettingPage && (
                <>
                  <h2 className="sports-league-overview-title">{breadcrumbLeague}</h2>
                  <p className="sports-league-overview-subtitle">Select a match to view markets and live scores</p>
                </>
              )}
              <div className="sports-league-overview-list">
                {(isLiveBettingPage ? upcomingMatches : sportMatches).map((m) => {
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

          {viewMode === 'match' && activeMatch ? (
            <>
              {!isWideLayout && (
                <div className="sports-mobile-live-widget">
                  <ErrorBoundary resetKey={activeMatch?.id}>
                    <LiveMatchGraphicWidget match={activeMatch} />
                  </ErrorBoundary>
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
                              onClick={() => placeBet(opt.selection, opt.odds, opt.name, market.title)}
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
          ) : viewMode === 'match' ? (
            <div className="sports-empty">
              <h3>Match not found</h3>
              <p>This match is no longer available</p>
              <button type="button" className="sports-empty-action" onClick={() => showLeagueOverview(activeLeague)}>
                Back to {breadcrumbLeague}
              </button>
            </div>
          ) : sportMatches.length === 0 ? (
            <div className="sports-empty">
              <h3>{isLiveBettingPage ? 'No live events' : 'No matches in this league'}</h3>
              <p>
                {isLiveBettingPage
                  ? 'There are no in-play matches at the moment.'
                  : 'Select another league or sport'}
              </p>
              {isLiveBettingPage && (
                <Link to="/sports" className="sports-empty-action">
                  View upcoming matches
                </Link>
              )}
            </div>
          ) : null}
        </div>

        <aside className="sports-right">
          <BetSlip />
          {isWideLayout && activeMatch && (
            <div className="sports-desktop-live-widget">
              <ErrorBoundary resetKey={activeMatch?.id}>
                <LiveMatchGraphicWidget match={activeMatch} />
              </ErrorBoundary>
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
