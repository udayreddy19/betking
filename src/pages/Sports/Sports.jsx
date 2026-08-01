import { useState, useMemo, useEffect } from 'react';
import { FiSearch } from 'react-icons/fi';
import { HiOutlineChevronDown, HiOutlineChevronUp } from 'react-icons/hi';
import FilterChips from '../../components/FilterChips/FilterChips';
import BetSlip from '../../components/BetSlip/BetSlip';
import LiveMatchGraphicWidget from '../../components/LiveMatchGraphicWidget/LiveMatchGraphicWidget';
import SportsLeagueSidebar from '../../components/SportsLeagueSidebar/SportsLeagueSidebar';
import { sportsCategories, featuredLeagues } from '../../data/mockData';
import { useLiveSports } from '../../context/LiveSportsContext';
import { useBetSlip } from '../../context/BetSlipContext';
import { isMatchBettable } from '../../utils/matchBetting';
import { filterMatches } from '../../utils/matchFilters';
import './Sports.css';

const MARKET_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'main', label: 'Main' },
  { id: 'over', label: 'Over' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'player', label: 'Player' },
  { id: 'partnership', label: 'Partnership' },
];

function filterByLeague(matchList, activeLeague) {
  if (!activeLeague) return matchList;
  const featured = featuredLeagues.find(l => l.id === activeLeague);
  if (featured) {
    return matchList.filter(m => featured.matchLeagues.includes(m.league));
  }
  return matchList.filter(m => m.league === activeLeague);
}

function getMatchScores(match) {
  const isCricket = match.sport === 'cricket' || match.sport === 'virtual-cricket';
  const isSoccer = match.sport === 'soccer' || match.sport === 'esoccer';
  const hasScore = match.liveDetails && (match.matchState === 'in' || match.matchState === 'post');
  const state = match.matchState || (match.isLive ? 'in' : 'pre');

  let team1Score = '';
  let team2Score = '';
  let statusLabel = match.time || 'VS';

  if (hasScore && isCricket) {
    team1Score = `${match.liveDetails.runs}/${match.liveDetails.wickets}`;
    team2Score = `${match.liveDetails.score2}/${match.liveDetails.wickets2}`;
    statusLabel = state === 'in' ? 'Live' : (state === 'post' ? 'FT' : match.time);
  } else if (hasScore && isSoccer) {
    team1Score = String(match.liveDetails.score1 ?? '');
    team2Score = String(match.liveDetails.score2 ?? '');
    statusLabel = state === 'in' ? 'Live' : (state === 'post' ? 'FT' : match.time);
  } else if (hasScore) {
    team1Score = String(match.liveDetails.score1 ?? match.liveDetails.runs ?? '');
    team2Score = String(match.liveDetails.score2 ?? match.liveDetails.score2 ?? '');
    statusLabel = state === 'in' ? 'Live' : match.time;
  }

  return { team1Score, team2Score, statusLabel, state };
}

export default function Sports() {
  const { matches } = useLiveSports();
  const { addBet, isBetSelected } = useBetSlip();
  const [activeSport, setActiveSport] = useState('cricket');
  const [activeLeague, setActiveLeague] = useState('hundred-m');
  const [activeMarketCat, setActiveMarketCat] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMatchId, setSelectedMatchId] = useState(null);
  const [expandedMarkets, setExpandedMarkets] = useState({
    winner: true, over10: true, delivery: false, player: false, partnership: false,
  });

  const sportMatches = useMemo(
    () => filterByLeague(filterMatches(matches, { sport: activeSport, stateTab: 'all' }), activeLeague),
    [matches, activeSport, activeLeague]
  );

  const activeMatch = useMemo(() => {
    if (selectedMatchId) {
      const found = sportMatches.find(m => m.id === selectedMatchId);
      if (found) return found;
    }
    return sportMatches.find(m => m.matchState === 'in') || sportMatches[0] || null;
  }, [sportMatches, selectedMatchId]);

  useEffect(() => {
    if (activeMatch && !sportMatches.find(m => m.id === selectedMatchId)) {
      setSelectedMatchId(activeMatch.id);
    }
  }, [activeMatch, sportMatches, selectedMatchId]);

  const toggleMarket = (key) => {
    setExpandedMarkets(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const showCategory = (cat) => activeMarketCat === 'all' || activeMarketCat === cat;

  const oddsBtnClass = (selection) => {
    if (!activeMatch) return 'sports-market-odds-btn';
    return `sports-market-odds-btn ${isBetSelected(activeMatch.id, selection) ? 'selected' : ''}`;
  };

  const handleSportChange = (sportId) => {
    setActiveSport(sportId);
    const firstLeague = featuredLeagues.find(l => l.sport === sportId);
    setActiveLeague(firstLeague?.id || null);
    setSelectedMatchId(null);
  };

  const handleLeagueChange = (leagueId) => {
    setActiveLeague(leagueId);
    setSelectedMatchId(null);
  };

  const matchTimeLabel = activeMatch?.time?.includes('Live')
    ? `19:00, 01 August 2026`
    : (activeMatch?.time || 'Scheduled');

  return (
    <div className="sports-page container" id="sports-page">
      <SportsLeagueSidebar
        activeSport={activeSport}
        activeLeague={activeLeague}
        onSelectLeague={handleLeagueChange}
      />

      <div className="sports-center">
        <FilterChips
          items={sportsCategories}
          activeId={activeSport}
          onSelect={handleSportChange}
          className="filter-chips-row sports-sport-chips"
        />

        <div className="sports-match-ticker">
          {sportMatches.slice(0, 10).map(m => {
            const isSelected = activeMatch?.id === m.id;
            const { team1Score, team2Score, statusLabel, state } = getMatchScores(m);
            return (
              <button
                key={m.id}
                type="button"
                className={`sports-ticker-card ${isSelected ? 'selected' : ''}`}
                onClick={() => setSelectedMatchId(m.id)}
              >
                <div className="sports-ticker-row">
                  <span>{m.team1.shortName || m.team1.name.slice(0, 8)}</span>
                  <span>{team1Score || '–'}</span>
                </div>
                <div className="sports-ticker-row">
                  <span>{m.team2.shortName || m.team2.name.slice(0, 8)}</span>
                  <span>{team2Score || statusLabel}</span>
                </div>
                {state === 'in' && <span className="sports-ticker-live">LIVE</span>}
              </button>
            );
          })}
        </div>

        {activeMatch ? (
          <>
            <div className="sports-match-banner">
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
                {expandedMarkets.winner && isMatchBettable(activeMatch) && (
                  <div className="sports-market-odds-grid">
                    <button
                      type="button"
                      className={oddsBtnClass('1')}
                      onClick={() => addBet(activeMatch, '1', activeMatch.odds.team1)}
                    >
                      <span>{activeMatch.team1.name}</span>
                      <span className="odds-val">{Number(activeMatch.odds.team1).toFixed(2)}</span>
                    </button>
                    {activeMatch.odds.draw !== undefined && (
                      <button
                        type="button"
                        className={oddsBtnClass('X')}
                        onClick={() => addBet(activeMatch, 'X', activeMatch.odds.draw)}
                      >
                        <span>Draw</span>
                        <span className="odds-val">{Number(activeMatch.odds.draw).toFixed(2)}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className={oddsBtnClass('2')}
                      onClick={() => addBet(activeMatch, '2', activeMatch.odds.team2)}
                    >
                      <span>{activeMatch.team2.name}</span>
                      <span className="odds-val">{Number(activeMatch.odds.team2).toFixed(2)}</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {showCategory('over') && (
              <div className="sports-market-panel">
                <button type="button" className="sports-market-panel-header" onClick={() => toggleMarket('over10')}>
                  <span>1st innings over 12 - {activeMatch.team1.name} total</span>
                  {expandedMarkets.over10 ? <HiOutlineChevronUp /> : <HiOutlineChevronDown />}
                </button>
                {expandedMarkets.over10 && isMatchBettable(activeMatch) && (
                  <div className="sports-market-odds-grid">
                    <button type="button" className={oddsBtnClass('Over 12 Total:Over 6.5')} onClick={() => addBet(activeMatch, 'Over 12 Total:Over 6.5', 2.06, 'Over 6.5')}>
                      <span>Over 6.5</span><span className="odds-val">2.06</span>
                    </button>
                    <button type="button" className={oddsBtnClass('Over 12 Total:Under 6.5')} onClick={() => addBet(activeMatch, 'Over 12 Total:Under 6.5', 1.63, 'Under 6.5')}>
                      <span>Under 6.5</span><span className="odds-val">1.63</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {showCategory('delivery') && (
              <div className="sports-market-panel">
                <button type="button" className="sports-market-panel-header" onClick={() => toggleMarket('delivery')}>
                  <span>1st innings over 12 - 5th delivery {activeMatch.team2.name} total</span>
                  {expandedMarkets.delivery ? <HiOutlineChevronUp /> : <HiOutlineChevronDown />}
                </button>
                {expandedMarkets.delivery && isMatchBettable(activeMatch) && (
                  <div className="sports-market-odds-grid">
                    <button type="button" className={oddsBtnClass('Delivery:Over 0.5')} onClick={() => addBet(activeMatch, 'Delivery:Over 0.5', 1.45, 'Over 0.5')}>
                      <span>Over 0.5</span><span className="odds-val">1.45</span>
                    </button>
                    <button type="button" className={oddsBtnClass('Delivery:Under 0.5')} onClick={() => addBet(activeMatch, 'Delivery:Under 0.5', 2.30, 'Under 0.5')}>
                      <span>Under 0.5</span><span className="odds-val">2.30</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {showCategory('player') && (
              <div className="sports-market-panel">
                <button type="button" className="sports-market-panel-header" onClick={() => toggleMarket('player')}>
                  <span>Player total runs</span>
                  {expandedMarkets.player ? <HiOutlineChevronUp /> : <HiOutlineChevronDown />}
                </button>
                {expandedMarkets.player && isMatchBettable(activeMatch) && (
                  <div className="sports-market-odds-grid">
                    <button type="button" className={oddsBtnClass('Player:Over 25.5')} onClick={() => addBet(activeMatch, 'Player:Over 25.5', 1.83, 'Over 25.5')}>
                      <span>Over 25.5</span><span className="odds-val">1.83</span>
                    </button>
                    <button type="button" className={oddsBtnClass('Player:Under 25.5')} onClick={() => addBet(activeMatch, 'Player:Under 25.5', 1.83, 'Under 25.5')}>
                      <span>Under 25.5</span><span className="odds-val">1.83</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {showCategory('partnership') && (
              <div className="sports-market-panel">
                <button type="button" className="sports-market-panel-header" onClick={() => toggleMarket('partnership')}>
                  <span>1st innings - 1st partnership total</span>
                  {expandedMarkets.partnership ? <HiOutlineChevronUp /> : <HiOutlineChevronDown />}
                </button>
                {expandedMarkets.partnership && isMatchBettable(activeMatch) && (
                  <div className="sports-market-odds-grid">
                    <button type="button" className={oddsBtnClass('Partnership:Over 45.5')} onClick={() => addBet(activeMatch, 'Partnership:Over 45.5', 1.90, 'Over 45.5')}>
                      <span>Over 45.5</span><span className="odds-val">1.90</span>
                    </button>
                    <button type="button" className={oddsBtnClass('Partnership:Under 45.5')} onClick={() => addBet(activeMatch, 'Partnership:Under 45.5', 1.90, 'Under 45.5')}>
                      <span>Under 45.5</span><span className="odds-val">1.90</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="sports-empty">
            <h3>No matches in this league</h3>
            <p>Select another league or sport</p>
          </div>
        )}
      </div>

      <aside className="sports-right">
        <LiveMatchGraphicWidget match={activeMatch} />
        <div className="sports-search">
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
  );
}
