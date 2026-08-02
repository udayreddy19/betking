import { useState, useMemo, useEffect, useCallback } from 'react';
import { Link, useSearchParams, useLocation } from 'react-router-dom';
import { FiSearch, FiHome } from 'react-icons/fi';
import { HiOutlineChevronDown, HiOutlineChevronUp } from 'react-icons/hi';
import FilterChips from '../../components/FilterChips/FilterChips';
import BetSlip from '../../components/BetSlip/BetSlip';
import LiveMatchGraphicWidget from '../../components/LiveMatchGraphicWidget/LiveMatchGraphicWidget';
import SportsLeagueSidebar from '../../components/SportsLeagueSidebar/SportsLeagueSidebar';
import MatchDetailModal from '../../components/MatchDetailModal/MatchDetailModal';
import { sportsCategories, featuredLeagues } from '../../data/mockData';
import { useLiveSports } from '../../context/LiveSportsContext';
import { useBetSlip } from '../../context/BetSlipContext';
import { useAuth } from '../../context/AuthContext';
import { isMatchBettable } from '../../utils/matchBetting';
import { filterMatches } from '../../utils/matchFilters';
import { resolveLeagueId, getLeagueMeta, isSameLeague } from '../../utils/leagueNavigation';
import './Sports.css';

const MARKET_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'main', label: 'Main' },
  { id: 'over', label: 'Over' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'partnership', label: 'Partnership' },
];

function filterByLeague(matchList, activeLeague, cricketSeries = []) {
  if (!activeLeague || activeLeague === 'all') return matchList;

  const dynamicSeries = cricketSeries.find(
    (series) => series.id === activeLeague
      || series.name === activeLeague
      || `cb-series-${series.seriesId}` === activeLeague
  );
  if (dynamicSeries) {
    return matchList.filter((match) =>
      match.league === dynamicSeries.name
      || match.seriesName === dynamicSeries.rawName
      || match.cricbuzzSeriesId === dynamicSeries.seriesId
    );
  }

  const leagueId = resolveLeagueId(activeLeague);
  const featured = getLeagueMeta(leagueId);
  if (featured) {
    return matchList.filter((match) =>
      featured.matchLeagues.includes(match.league) || match.league === featured.name
    );
  }
  return matchList.filter((match) => match.league === activeLeague || match.league === leagueId);
}

function getMatchScores(match) {
  const ld = match.liveDetails || {};
  const isLive = match.isLive || match.matchState === 'in';
  const isFinished = match.matchState === 'post';

  let team1Score = '';
  let team2Score = '';

  if (isLive || isFinished) {
    if (match.sport === 'cricket' || match.sport === 'virtual-cricket') {
      const r1 = ld.runs ?? 0;
      const w1 = ld.wickets ?? 0;
      team1Score = w1 > 0 ? `${r1}/${w1}` : `${r1}`;

      const r2 = ld.score2 ?? 0;
      const w2 = ld.wickets2 ?? 0;
      team2Score = w2 > 0 ? `${r2}/${w2}` : `${r2}`;
    } else if (match.sport === 'soccer' || match.sport === 'esoccer') {
      team1Score = String(ld.score1 ?? 0);
      team2Score = String(ld.score2 ?? 0);
    } else if (match.sport === 'basketball' || match.sport === 'american-football') {
      team1Score = String(ld.score1 ?? 0);
      team2Score = String(ld.score2 ?? 0);
    } else if (match.sport === 'tennis') {
      if (ld.sets1?.length || ld.sets2?.length) {
        team1Score = (ld.sets1 || []).join(' ');
        team2Score = (ld.sets2 || []).join(' ');
      } else {
        team1Score = String(ld.score1 ?? 0);
        team2Score = String(ld.score2 ?? 0);
      }
    } else {
      team1Score = String(ld.score1 ?? ld.runs ?? '0');
      team2Score = String(ld.score2 ?? '0');
    }
  } else {
    const timeStr = match.time || 'Scheduled';
    if (timeStr.includes(' ')) {
      const parts = timeStr.trim().split(/\s+/);
      if (parts.length >= 2) {
        team1Score = parts.slice(0, -1).join(' ');
        team2Score = parts[parts.length - 1];
      } else {
        team2Score = timeStr;
      }
    } else {
      team2Score = timeStr;
    }
  }

  return { team1Score, team2Score, isLive, isFinished };
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
  const { matches, tickerMessage, cricketSeries, scoresError, refreshScores, isScoresLoading } = useLiveSports();
  const { addBet, isBetSelected } = useBetSlip();
  const { showToast } = useAuth();
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
  const [modalMatch, setModalMatch] = useState(null);
  const [expandedMarkets, setExpandedMarkets] = useState({
    winner: true, tie: true, over10: true, delivery: false, partnership: false,
  });

  const sportMatches = useMemo(() => {
    const stateTab = isLiveBettingPage ? 'live' : 'all';
    return filterByLeague(
      filterMatches(matches, { sport: activeSport, stateTab, searchQuery }),
      activeLeague,
      cricketSeries
    );
  }, [matches, activeSport, activeLeague, searchQuery, cricketSeries, isLiveBettingPage]);

  const activeMatch = useMemo(() => {
    if (viewMode !== 'match' || !selectedMatchId) return null;
    return sportMatches.find(m => m.id === selectedMatchId) || null;
  }, [sportMatches, selectedMatchId, viewMode]);

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
  }, [activeSport, activeLeague, setSearchParams]);

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
    const firstLeague = featuredLeagues.find(l => l.sport === sportId);
    const leagueId = firstLeague?.id || null;
    setActiveLeague(leagueId);
    setViewMode('league');
    setSelectedMatchId(null);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('sport', sportId);
      if (leagueId) next.set('league', leagueId);
      else next.delete('league');
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

  const matchTimeLabel = activeMatch?.time || 'Scheduled';

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
    if (!activeMatch) return;
    addBet(activeMatch, selection, odds, selectionName, { marketName });
  };

  return (
    <div className="sports-page" id="sports-page">
      <button type="button" className="sports-chat-fab" aria-label="Live chat" onClick={() => showToast('Live chat support coming soon!', 'info')}>
        💬
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
            <p>In-play markets — bet while the action unfolds</p>
          </div>
        )}

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

        <FilterChips
          items={sportsCategories}
          activeId={activeSport}
          onSelect={handleSportChange}
          className="filter-chips-row sports-sport-chips"
        />

        {leagueChips.length > 0 && (
          <div className="sports-league-chips">
            {leagueChips.map(league => (
              <button
                key={league.id}
                type="button"
                className={`sports-league-chip ${isSameLeague(activeLeague, league.id) ? 'active' : ''}`}
                onClick={() => handleLeagueChange(league.id)}
              >
                {league.icon && <span className="sports-league-chip-icon">{league.icon}</span>}
                {league.name}
              </button>
            ))}
          </div>
        )}

        <div className={`sports-live-status sports-live-status--${liveStatusClass}`} role="status">
          <span className="sports-live-status-dot" />
          {tickerMessage || 'Syncing live scores…'}
        </div>

        {scoresError && (
          <div className="sports-scores-error" role="alert">
            <span>{scoresError}</span>
            <button
              type="button"
              className="sports-scores-retry"
              onClick={refreshScores}
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

        <div className="sports-match-ticker" id="sports-match-ticker">
          {sportMatches.length === 0 ? (
            <div className="sports-ticker-empty">
              <p>No matches found{searchQuery ? ` for "${searchQuery}"` : ''}.</p>
              {(searchQuery || activeLeague) && (
                <button
                  type="button"
                  className="sports-empty-action"
                  onClick={() => { setSearchQuery(''); handleLeagueChange(leagueChips[0]?.id || null); }}
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : sportMatches.slice(0, 10).map(m => {
            const { team1Score, team2Score, isLive } = getMatchScores(m);
            return (
              <button
                key={m.id}
                type="button"
                className={`sports-ticker-card ${viewMode === 'match' && activeMatch?.id === m.id ? 'selected' : ''}`}
                onClick={() => selectMatch(m.id)}
              >
                <div className="sports-ticker-row">
                  <span>{m.team1.shortName || m.team1.name.slice(0, 10)}</span>
                  <span>{team1Score || ''}</span>
                </div>
                <div className="sports-ticker-row">
                  <span>{m.team2.shortName || m.team2.name.slice(0, 10)}</span>
                  <span>{team2Score || ''}</span>
                </div>
                {isLive && <span className="sports-ticker-live">LIVE</span>}
              </button>
            );
          })}
        </div>

        {viewMode === 'league' && sportMatches.length > 0 && (
          <div className="sports-league-overview">
            <h2 className="sports-league-overview-title">{breadcrumbLeague}</h2>
            <p className="sports-league-overview-subtitle">Select a match to view markets and live scores</p>
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
                      <span className="sports-league-overview-time">{m.time}</span>
                      {isLive && <span className="sports-league-overview-live">LIVE</span>}
                    </div>
                    <div className="sports-league-overview-teams">
                      <div className="sports-league-overview-team">
                        <span>{m.team1.name}</span>
                        <strong>{team1Score || '–'}</strong>
                      </div>
                      <div className="sports-league-overview-team">
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
            <div className="sports-mobile-live-widget">
              <LiveMatchGraphicWidget match={activeMatch} />
            </div>

            <div className="sports-match-banner" role="button" tabIndex={0} onClick={() => setModalMatch(activeMatch)} onKeyDown={e => e.key === 'Enter' && setModalMatch(activeMatch)}>
              <div className="sports-match-banner-time">{matchTimeLabel}</div>
              <div className="sports-match-banner-teams">
                <span className="sports-match-banner-team">{activeMatch.team1.name}</span>
                <span className="sports-match-banner-vs">VS</span>
                <span className="sports-match-banner-team">{activeMatch.team2.name}</span>
              </div>
            </div>

            <div className="sports-market-cats">
              {MARKET_CATEGORIES.map(cat => (
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

            {showCategory('main') && (
              <div className="sports-market-panel">
                <button
                  type="button"
                  className="sports-market-panel-header"
                  onClick={() => toggleMarket('winner')}
                >
                  <span>Winner (incl. super over)</span>
                  {expandedMarkets.winner ? <HiOutlineChevronUp /> : <HiOutlineChevronDown />}
                </button>
                {expandedMarkets.winner && (
                  canBetActive ? (
                  <div className="sports-market-odds-grid">
                    <button
                      type="button"
                      className={oddsBtnClass('1')}
                      onClick={() => placeBet('1', activeMatch.odds.team1, activeMatch.team1.name, 'Winner (incl. super over)')}
                    >
                      <span>{activeMatch.team1.name}</span>
                      <span className="odds-val">{Number(activeMatch.odds.team1).toFixed(2)}</span>
                    </button>
                    {activeMatch.odds.draw !== undefined && (
                      <button
                        type="button"
                        className={oddsBtnClass('X')}
                        onClick={() => placeBet('X', activeMatch.odds.draw, 'Draw', 'Winner (incl. super over)')}
                      >
                        <span>Draw</span>
                        <span className="odds-val">{Number(activeMatch.odds.draw).toFixed(2)}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className={oddsBtnClass('2')}
                      onClick={() => placeBet('2', activeMatch.odds.team2, activeMatch.team2.name, 'Winner (incl. super over)')}
                    >
                      <span>{activeMatch.team2.name}</span>
                      <span className="odds-val">{Number(activeMatch.odds.team2).toFixed(2)}</span>
                    </button>
                  </div>
                  ) : <MarketsSuspended />
                )}
              </div>
            )}

            {showCategory('main') && (
              <div className="sports-market-panel">
                <button
                  type="button"
                  className="sports-market-panel-header"
                  onClick={() => toggleMarket('tie')}
                >
                  <span>Will there be a tie</span>
                  {expandedMarkets.tie ? <HiOutlineChevronUp /> : <HiOutlineChevronDown />}
                </button>
                {expandedMarkets.tie && (
                  canBetActive ? (
                  <div className="sports-market-odds-grid">
                    <button
                      type="button"
                      className={oddsBtnClass('Tie:Yes')}
                      onClick={() => placeBet('Tie:Yes', 11.50, 'Yes', 'Will there be a tie')}
                    >
                      <span>Yes</span>
                      <span className="odds-val">11.50</span>
                    </button>
                    <button
                      type="button"
                      className={oddsBtnClass('Tie:No')}
                      onClick={() => placeBet('Tie:No', 1.05, 'No', 'Will there be a tie')}
                    >
                      <span>No</span>
                      <span className="odds-val">1.05</span>
                    </button>
                  </div>
                  ) : <MarketsSuspended />
                )}
              </div>
            )}

            {showCategory('over') && (
              <div className="sports-market-panel">
                <button type="button" className="sports-market-panel-header" onClick={() => toggleMarket('over10')}>
                  <span>1st innings over 12 - {activeMatch.team1.name} total</span>
                  {expandedMarkets.over10 ? <HiOutlineChevronUp /> : <HiOutlineChevronDown />}
                </button>
                {expandedMarkets.over10 && (
                  canBetActive ? (
                  <div className="sports-market-odds-grid">
                    <button type="button" className={oddsBtnClass('Over 12 Total:Over 6.5')} onClick={() => placeBet('Over 12 Total:Over 6.5', 2.06, 'Over 6.5', '1st innings over 12 total')}>
                      <span>Over 6.5</span><span className="odds-val">2.06</span>
                    </button>
                    <button type="button" className={oddsBtnClass('Over 12 Total:Under 6.5')} onClick={() => placeBet('Over 12 Total:Under 6.5', 1.63, 'Under 6.5', '1st innings over 12 total')}>
                      <span>Under 6.5</span><span className="odds-val">1.63</span>
                    </button>
                  </div>
                  ) : <MarketsSuspended />
                )}
              </div>
            )}

            {showCategory('delivery') && (
              <div className="sports-market-panel">
                <button type="button" className="sports-market-panel-header" onClick={() => toggleMarket('delivery')}>
                  <span>1st innings over 12 - 5th delivery {activeMatch.team2.name} total</span>
                  {expandedMarkets.delivery ? <HiOutlineChevronUp /> : <HiOutlineChevronDown />}
                </button>
                {expandedMarkets.delivery && (
                  canBetActive ? (
                  <div className="sports-market-odds-grid">
                    <button type="button" className={oddsBtnClass('Delivery:Over 0.5')} onClick={() => placeBet('Delivery:Over 0.5', 1.45, 'Over 0.5', '5th delivery total')}>
                      <span>Over 0.5</span><span className="odds-val">1.45</span>
                    </button>
                    <button type="button" className={oddsBtnClass('Delivery:Under 0.5')} onClick={() => placeBet('Delivery:Under 0.5', 2.30, 'Under 0.5', '5th delivery total')}>
                      <span>Under 0.5</span><span className="odds-val">2.30</span>
                    </button>
                  </div>
                  ) : <MarketsSuspended />
                )}
              </div>
            )}

            {showCategory('partnership') && (
              <div className="sports-market-panel">
                <button type="button" className="sports-market-panel-header" onClick={() => toggleMarket('partnership')}>
                  <span>1st innings - 1st partnership total</span>
                  {expandedMarkets.partnership ? <HiOutlineChevronUp /> : <HiOutlineChevronDown />}
                </button>
                {expandedMarkets.partnership && (
                  canBetActive ? (
                  <div className="sports-market-odds-grid">
                    <button type="button" className={oddsBtnClass('Partnership:Over 45.5')} onClick={() => placeBet('Partnership:Over 45.5', 1.90, 'Over 45.5', '1st partnership total')}>
                      <span>Over 45.5</span><span className="odds-val">1.90</span>
                    </button>
                    <button type="button" className={oddsBtnClass('Partnership:Under 45.5')} onClick={() => placeBet('Partnership:Under 45.5', 1.90, 'Under 45.5', '1st partnership total')}>
                      <span>Under 45.5</span><span className="odds-val">1.90</span>
                    </button>
                  </div>
                  ) : <MarketsSuspended />
                )}
              </div>
            )}

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
            <h3>No matches in this league</h3>
            <p>Select another league or sport</p>
          </div>
        ) : null}
      </div>

      <aside className="sports-right">
        <div className="sports-desktop-live-widget">
          <LiveMatchGraphicWidget match={activeMatch} />
        </div>
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
        <BetSlip />
      </aside>
      </div>

      <MatchDetailModal
        match={modalMatch}
        isOpen={!!modalMatch}
        onClose={() => setModalMatch(null)}
      />
    </div>
  );
}
