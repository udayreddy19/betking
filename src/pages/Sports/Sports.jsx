import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Link, useSearchParams, useLocation } from 'react-router-dom';
import { FiSearch, FiHome, HiOutlineChevronDown, HiOutlineChevronUp, FiMessageCircle } from '../../icons';
import FilterChips from '../../components/FilterChips/FilterChips';
import SportIcon from '../../components/SportIcon/SportIcon';
import TeamJersey from '../../components/TeamJersey/TeamJersey';
import BetSlip from '../../components/BetSlip/BetSlip';
import LiveMatchGraphicWidget from '../../components/LiveMatchGraphicWidget/LiveMatchGraphicWidget';
import ErrorBoundary from '../../components/ErrorBoundary/ErrorBoundary';
import SportsLeagueSidebar from '../../components/SportsLeagueSidebar/SportsLeagueSidebar';
import { sportsCategories, featuredLeagues } from '../../data/mockData';
import { useLiveMatches, useLiveSportsMeta } from '../../context/LiveSportsContext';
import { useBetSlip } from '../../context/BetSlipContext';
import { useAuth } from '../../context/AuthContext';
import { isMatchBettable, isTrulyLiveMatch, getMatchState } from '../../utils/matchBetting';
import { resolveCricketTeamScores } from '../../utils/cricketScores';
import { prefetchMatchDetail } from '../../services/matchDetailPoller';
import { useMatchDetail } from '../../hooks/useMatchDetail';
import { useCentralizedMatchState } from '../../hooks/useCentralizedMatchState';
import { centralizedMatchEngine } from '../../services/centralizedMatchStateEngine';
import { filterMatches } from '../../utils/matchFilters';
import { resolveLeagueId, getLeagueMeta, isSameLeague, groupMatchesByLeague, matchBelongsToLeague } from '../../utils/leagueNavigation';
import SrlLeaguePanel from '../../components/SrlLeaguePanel/SrlLeaguePanel';
import { generateMatchMarkets, getMarketCategoriesForSport } from '../../utils/oddsMarketsGenerator';
import './Sports.css';

function filterByLeague(matchList, activeLeague, cricketSeries = []) {
  if (!activeLeague || activeLeague === 'all') return matchList;

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
    const l1 = String(match.league || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const l2 = String(match.seriesName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return (l1 && (l1.includes(normalizedKey) || normalizedKey.includes(l1))) ||
      (l2 && (l2.includes(normalizedKey) || normalizedKey.includes(l2)));
  });
}

function getMatchScores(match) {
  const isLive = isTrulyLiveMatch(match);
  const isFinished = getMatchState(match) === 'post';
  const state = centralizedMatchEngine.getSnapshot(match?.id, match);

  let team1Score = state?.teams?.team1?.score || '';
  let team2Score = state?.teams?.team2?.score || '';

  if ((!team1Score || team1Score === '0/0') && (!team2Score || team2Score === '0/0')) {
    const ld = match?.liveDetails || {};
    if (match?.sport === 'soccer' || match?.sport === 'esoccer' || match?.sport === 'basketball') {
      team1Score = String(ld.score1 ?? 0);
      team2Score = String(ld.score2 ?? 0);
    } else {
      team1Score = `${ld.runs ?? 0}/${ld.wickets ?? 0}`;
      team2Score = `${ld.score2 ?? 0}/${ld.wickets2 ?? 0}`;
    }
  }

  return { team1Score, team2Score, isLive, isFinished, state };
}

function resolveTossText(match, centralizedState) {
  if (!match) return null;
  const isCricket = match.sport === 'cricket' || match.sport === 'virtual-cricket' || !match.sport;
  if (!isCricket) return null;

  const t = match.toss || match.liveDetails?.toss || match.matchHeader?.toss || centralizedState?.toss;
  if (typeof t === 'string' && t.trim()) return t.trim();
  if (t && typeof t === 'object') {
    const winner = t.winnerName || t.winner || t.teamWinnerName;
    const decision = t.decision || t.decisionChoice || 'bat';
    if (winner) {
      return `${winner} won the toss & elected to ${decision.toLowerCase()}`;
    }
  }

  const team1Name = match.team1?.name || match.team1;
  const ld = match.liveDetails || {};
  const batTeam = ld.firstTeamName || ld.batTeam || team1Name;
  if (batTeam && (match.isLive || match.matchState === 'in')) {
    return `${batTeam} won the toss & elected to bat`;
  }

  return null;
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

            const statusLabel = isLive
              ? (m.liveDetails?.period || (team2Score && team2Score !== '0/0' ? 'Second innings' : 'First innings'))
              : isFinished
                ? 'Match Ended'
                : (m.time || 'Scheduled');

            const oversDisplay = isLive && overs2 && overs2 !== '0.0'
              ? `(${overs2} ov.)`
              : (isLive && m.liveDetails?.overs && m.liveDetails.overs !== '0.0' ? `(${m.liveDetails.overs} ov.)` : null);

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
                      <TeamJersey team={m.team1} size={22} />
                      <span className="sports-cricket-row__team-name">{m.team1.name}</span>
                      {showScores && <strong className="sports-cricket-row__score">{team1Score || '–'}</strong>}
                    </div>
                    <div className="sports-cricket-row__team">
                      <TeamJersey team={m.team2} size={22} />
                      <span className="sports-cricket-row__team-name">{m.team2.name}</span>
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
                      onClick={(e) => { e.stopPropagation(); onQuickBet(m, '1', m.odds?.team1, m.team1.name); }}
                    >
                      <span className="odds-label">1</span>
                      <strong className="odds-val">{Number(m.odds?.team1 || 0).toFixed(2)}</strong>
                    </button>

                    <button
                      type="button"
                      className={`sports-cricket-odds-card ${isBetSelected(m.id, '2') ? 'selected' : ''}`}
                      onClick={(e) => { e.stopPropagation(); onQuickBet(m, '2', m.odds?.team2, m.team2.name); }}
                    >
                      <span className="odds-label">2</span>
                      <strong className="odds-val">{Number(m.odds?.team2 || 0).toFixed(2)}</strong>
                    </button>

                    {m.odds?.draw != null ? (
                      <button
                        type="button"
                        className={`sports-cricket-odds-card ${isBetSelected(m.id, 'X') ? 'selected' : ''}`}
                        onClick={(e) => { e.stopPropagation(); onQuickBet(m, 'X', m.odds.draw, 'Draw'); }}
                      >
                        <span className="odds-label">X</span>
                        <strong className="odds-val">{Number(m.odds.draw).toFixed(2)}</strong>
                      </button>
                    ) : (
                      <div className="sports-cricket-odds-card locked">
                        <span className="lock-icon">🔒</span>
                      </div>
                    )}

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
  const { tickerMessage, cricketSeries, scoresError, refreshScores, isScoresLoading } = useLiveSportsMeta();
  const { addBet, isBetSelected } = useBetSlip();
  const { user, showToast } = useAuth();
  const isAdminUser = user?.role === 'admin' || user?.email === 'admin@betking.com';
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
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
  const [isWideLayout, setIsWideLayout] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 1025px)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1025px)');
    const onChange = () => setIsWideLayout(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);



  const isIplSrlView = isSameLeague(activeLeague, 'ipl-srl');

  const sportMatches = useMemo(() => {
    const filtered = filterByLeague(
      filterMatches(matches, {
        sport: activeSport,
        stateTab: 'bettable',
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
      return String(a.time).localeCompare(String(b.time));
    });
  }, [matches, activeSport, activeLeague, searchQuery, cricketSeries]);

  const liveMatches = useMemo(
    () => sportMatches.filter((m) => getMatchState(m) === 'in'),
    [sportMatches],
  );

  const upcomingMatches = useMemo(
    () => sportMatches.filter((m) => getMatchState(m) === 'pre'),
    [sportMatches],
  );

  const cricketGroups = useMemo(() => {
    if (activeSport !== 'cricket' || activeLeague !== 'all') return [];
    return groupMatchesByLeague(sportMatches);
  }, [activeSport, activeLeague, sportMatches]);

  const lastActiveMatchRef = useRef(null);

  // Find the selected match in the full matches array (not just filtered sportMatches)
  // Persist lastActiveMatchRef so background API refreshes never flash 'Match not found'
  const baseActiveMatch = useMemo(() => {
    const targetId = selectedMatchId || liveMatches[0]?.id || sportMatches[0]?.id;
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

  const matchMarkets = useMemo(() => {
    if (!activeMatch) return [];
    return generateMatchMarkets(activeMatch);
  }, [activeMatch]);

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
    });
  }, [liveMatchPrefetchKey, liveMatches]);

  const selectMatch = useCallback((matchId) => {
    setSelectedMatchId(matchId);
    setViewMode('match');
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('sport', activeSport);
      if (activeLeague) next.set('league', resolveLeagueId(activeLeague));
      next.set('match', matchId);
      return next;
    }, { replace: true });
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
      return next;
    }, { replace: true });
    requestAnimationFrame(() => {
      document.getElementById('sports-match-ticker')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }, [activeSport, activeLeague, setSearchParams]);

  const toggleMarket = (key) => {
    setExpandedMarkets(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const showCategory = (cat) => activeMarketCat === 'all' || activeMarketCat === cat;

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
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const handleLeagueChange = useCallback((leagueId) => {
    showLeagueOverview(leagueId);
  }, [showLeagueOverview]);

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
  const breadcrumbLeague = activeLeagueMeta?.breadcrumb || activeLeagueMeta?.name || activeMatch?.league || 'All Leagues';
  const sportLabel = sportsCategories.find(s => s.id === activeSport)?.name || 'Cricket';
  const leagueChips = featuredLeagues.filter(l => l.sport === activeSport);
  const canBetActive = activeMatch ? isMatchBettable(activeMatch) : false;
  const liveStatusClass = tickerMessage?.includes('⚠️')
    ? 'error'
    : tickerMessage?.includes('Connecting')
      ? 'loading'
      : 'live';

  const placeBet = (selection, odds, selectionName, marketName) => {
    if (!activeMatch || odds == null || Number.isNaN(Number(odds))) return;
    addBet(activeMatch, selection, odds, selectionName, { marketName });
  };

  const quickBet = (match, selection, odds, selectionName) => {
    if (odds == null || Number.isNaN(Number(odds))) return;
    addBet(match, selection, odds, selectionName, { marketName: 'Match Winner' });
  };

  const sportCounts = useMemo(() => {
    const map = {};
    for (const cat of sportsCategories) {
      map[cat.id] = matches.filter((m) => {
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
  }, [matches]);

  return (
    <div
      className={`sports-page${viewMode === 'match' ? ' sports-page--match' : ''}`}
      id="sports-page"
    >
      <button type="button" className="sports-chat-fab" aria-label="Live chat" onClick={() => showToast('Live chat support coming soon!', 'info')}>
        <FiMessageCircle size={24} />
      </button>

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
                onClick={() => showLeagueOverview(activeLeague)}
              >
                ← {breadcrumbLeague}
              </button>
              <span className="sports-mobile-match-title">
                {activeMatch.team1.shortName || activeMatch.team1.name} v {activeMatch.team2.shortName || activeMatch.team2.name}
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
                    {activeMatch.team1.name} vs. {activeMatch.team2.name}
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

          {leagueChips.length > 0 && (
            <div className="sports-league-chips sports-league-chips--browse">
              <button
                type="button"
                className={`sports-league-chip ${activeLeague === 'all' ? 'active' : ''}`}
                onClick={() => handleLeagueChange('all')}
              >
                All Leagues
              </button>
              {leagueChips.map(league => (
                <button
                  key={league.id}
                  type="button"
                  className={`sports-league-chip ${isSameLeague(activeLeague, league.id) ? 'active' : ''}`}
                  onClick={() => handleLeagueChange(league.id)}
                >
                  {league.icon && (
                    <SportIcon sport={league.sport} icon={league.icon} className="sports-league-chip-icon" />
                  )}
                  {league.name}
                </button>
              ))}
            </div>
          )}

          {isAdminUser && (
            <div className={`sports-live-status sports-live-status--${liveStatusClass} sports-live-status-bar`} role="status">
              <span className="sports-live-status-dot" />
              {tickerMessage || 'Syncing live scores…'}
            </div>
          )}

          {isAdminUser && scoresError && (
            <div className="sports-scores-error" role="alert">
              <span>{scoresError}</span>
              <button
                type="button"
                className="sports-scores-retry"
                onClick={() => refreshScores({ force: true })}
                disabled={isScoresLoading}
              >
                {isScoresLoading ? 'Retrying…' : 'Retry'}
              </button>
            </div>
          )}

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
                  {isLiveBettingPage
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
                    <span title={m.team1.name}>{m.team1.shortName || m.team1.name.slice(0, 12)}</span>
                    <span>{team1Score || ''}</span>
                  </div>
                  <div className="sports-ticker-row">
                    <span title={m.team2.name}>{m.team2.shortName || m.team2.name.slice(0, 12)}</span>
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
                        <span className="sports-league-overview-time">{m.league}</span>
                        {isLive && <span className="sports-league-overview-live">LIVE</span>}
                      </div>
                      <div className="sports-league-overview-teams">
                        <div className="sports-league-overview-team">
                          <TeamJersey team={m.team1} size={22} />
                          <span>{m.team1.name}</span>
                          <strong>{team1Score || '–'}</strong>
                        </div>
                        <div className="sports-league-overview-team">
                          <TeamJersey team={m.team2} size={22} />
                          <span>{m.team2.name}</span>
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
                        <span className="sports-league-overview-time">{m.time}</span>
                        {isLive && <span className="sports-league-overview-live">LIVE</span>}
                      </div>
                      <div className="sports-league-overview-teams">
                        <div className="sports-league-overview-team">
                          <TeamJersey team={m.team1} size={22} />
                          <span>{m.team1.name}</span>
                          <strong>{team1Score || '–'}</strong>
                        </div>
                        <div className="sports-league-overview-team">
                          <TeamJersey team={m.team2} size={22} />
                          <span>{m.team2.name}</span>
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
                  <ErrorBoundary>
                    <LiveMatchGraphicWidget match={activeMatch} />
                  </ErrorBoundary>
                </div>
              )}

              {(() => {
                const { team1Score, team2Score, isLive } = getMatchScores(activeMatch);
                const commText = centralizedState?.commentary || activeMatch.liveDetails?.commentary;

                const matchFormatBadge = (typeof activeMatch.matchType === 'string' ? activeMatch.matchType : typeof activeMatch.matchFormat === 'string' ? activeMatch.matchFormat : typeof activeMatch.format === 'string' ? activeMatch.format : (activeMatch.sport === 'cricket' ? 'T20' : activeMatch.sport)).toUpperCase();

                const rawVenue = activeMatch.venue || activeMatch.ground || activeMatch.liveDetails?.venue;
                const venueText = typeof rawVenue === 'string'
                  ? rawVenue
                  : (rawVenue?.venueName || rawVenue?.name || (rawVenue?.city ? `${rawVenue.city}${rawVenue.country ? `, ${rawVenue.country}` : ''}` : null));

                const rawSeries = activeMatch.seriesName || activeMatch.league;
                const seriesText = typeof rawSeries === 'string' ? rawSeries : (rawSeries?.name || null);

                const tossText = resolveTossText(activeMatch, centralizedState);

                return (
                  <div className="sports-match-banner sports-match-banner--desktop-only">
                    <div className="sports-match-banner-time">
                      {isLive && <span className="sports-live-badge-dot" />}
                      {matchTimeLabel}
                    </div>

                    <div className="sports-match-banner-meta-bar">
                      <span className="sports-format-badge">{matchFormatBadge}</span>
                      {seriesText && <span className="sports-series-name">🏆 {seriesText}</span>}
                      {venueText && <span className="sports-venue-tag">📍 {venueText}</span>}
                    </div>

                    <div className="sports-match-banner-teams">
                      <div className="sports-match-banner-team-col">
                        <TeamJersey team={activeMatch.team1} size={48} />
                        <span className="sports-match-banner-team">{activeMatch.team1.name}</span>
                        {isLive && team1Score && (
                          <strong className="sports-match-banner-score">{team1Score}</strong>
                        )}
                      </div>

                      <span className="sports-match-banner-vs">VS</span>

                      <div className="sports-match-banner-team-col">
                        <TeamJersey team={activeMatch.team2} size={48} />
                        <span className="sports-match-banner-team">{activeMatch.team2.name}</span>
                        {isLive && team2Score && (
                          <strong className="sports-match-banner-score">{team2Score}</strong>
                        )}
                      </div>
                    </div>

                    {tossText && (
                      <div className="sports-toss-badge">
                        <span>🪙 {tossText}</span>
                      </div>
                    )}

                    {commText && (
                      <p className="sports-match-banner-commentary">{commText}</p>
                    )}
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

              {matchMarkets.map((market) => {
                if (!showCategory(market.category)) return null;
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
                        <div className={`sports-market-odds-grid ${market.options.length === 3 ? 'three-col' : (market.options.length > 3 ? 'multi-col' : 'two-col')}`}>
                          {market.options.map((opt) => (
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
