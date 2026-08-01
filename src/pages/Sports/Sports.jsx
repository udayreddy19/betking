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
  { id: 'group', label: 'Group' },
  { id: 'player', label: 'Player' },
  { id: 'partnership', label: 'Partnership' },
  { id: 'combo', label: 'Combo' },
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
  const [activeLeague, setActiveLeague] = useState('hundred-w');
  const [activeMarketCat, setActiveMarketCat] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMatchId, setSelectedMatchId] = useState(null);
  const [expandedMarkets, setExpandedMarkets] = useState({
    winner: true, tie: true, over10: true, delivery: false, group: false, player: false, partnership: false, combo: false,
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

  const activeLeagueMeta = featuredLeagues.find(l => l.id === activeLeague);
  const breadcrumbLeague = activeLeagueMeta?.name || activeMatch?.league || 'All Leagues';
  const sportLabel = sportsCategories.find(s => s.id === activeSport)?.name || 'Cricket';

  const placeBet = (selection, odds, selectionName, marketName) => {
    if (!activeMatch) return;
    addBet(activeMatch, selection, odds, selectionName, { marketName });
  };

  return (
    <div className="sports-page container" id="sports-page">
      <SportsLeagueSidebar
        activeSport={activeSport}
        activeLeague={activeLeague}
        onSelectLeague={handleLeagueChange}
      />

      <div className="sports-center">
        {activeMatch && (
          <nav className="sports-breadcrumbs" aria-label="Breadcrumb">
            <span>{sportLabel}</span>
            <span className="sports-breadcrumb-sep">›</span>
            <span>{breadcrumbLeague}</span>
            <span className="sports-breadcrumb-sep">›</span>
            <span className="sports-breadcrumb-current">
              {activeMatch.team1.name} vs. {activeMatch.team2.name}
            </span>
          </nav>
        )}

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
                {expandedMarkets.tie && isMatchBettable(activeMatch) && (
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
                    <button type="button" className={oddsBtnClass('Over 12 Total:Over 6.5')} onClick={() => placeBet('Over 12 Total:Over 6.5', 2.06, 'Over 6.5', '1st innings over 12 total')}>
                      <span>Over 6.5</span><span className="odds-val">2.06</span>
                    </button>
                    <button type="button" className={oddsBtnClass('Over 12 Total:Under 6.5')} onClick={() => placeBet('Over 12 Total:Under 6.5', 1.63, 'Under 6.5', '1st innings over 12 total')}>
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
                    <button type="button" className={oddsBtnClass('Delivery:Over 0.5')} onClick={() => placeBet('Delivery:Over 0.5', 1.45, 'Over 0.5', '5th delivery total')}>
                      <span>Over 0.5</span><span className="odds-val">1.45</span>
                    </button>
                    <button type="button" className={oddsBtnClass('Delivery:Under 0.5')} onClick={() => placeBet('Delivery:Under 0.5', 2.30, 'Under 0.5', '5th delivery total')}>
                      <span>Under 0.5</span><span className="odds-val">2.30</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {showCategory('group') && (
              <div className="sports-market-panel">
                <button type="button" className="sports-market-panel-header" onClick={() => toggleMarket('group')}>
                  <span>Group winner - {activeMatch.team1.name}</span>
                  {expandedMarkets.group ? <HiOutlineChevronUp /> : <HiOutlineChevronDown />}
                </button>
                {expandedMarkets.group && isMatchBettable(activeMatch) && (
                  <div className="sports-market-odds-grid">
                    <button type="button" className={oddsBtnClass('Group:Top Batter')} onClick={() => placeBet('Group:Top Batter', 3.40, 'Top Batter', 'Group winner')}>
                      <span>Top Batter</span><span className="odds-val">3.40</span>
                    </button>
                    <button type="button" className={oddsBtnClass('Group:Top Bowler')} onClick={() => placeBet('Group:Top Bowler', 4.20, 'Top Bowler', 'Group winner')}>
                      <span>Top Bowler</span><span className="odds-val">4.20</span>
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
                    <button type="button" className={oddsBtnClass('Player:Over 25.5')} onClick={() => placeBet('Player:Over 25.5', 1.83, 'Over 25.5', 'Player total runs')}>
                      <span>Over 25.5</span><span className="odds-val">1.83</span>
                    </button>
                    <button type="button" className={oddsBtnClass('Player:Under 25.5')} onClick={() => placeBet('Player:Under 25.5', 1.83, 'Under 25.5', 'Player total runs')}>
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
                    <button type="button" className={oddsBtnClass('Partnership:Over 45.5')} onClick={() => placeBet('Partnership:Over 45.5', 1.90, 'Over 45.5', '1st partnership total')}>
                      <span>Over 45.5</span><span className="odds-val">1.90</span>
                    </button>
                    <button type="button" className={oddsBtnClass('Partnership:Under 45.5')} onClick={() => placeBet('Partnership:Under 45.5', 1.90, 'Under 45.5', '1st partnership total')}>
                      <span>Under 45.5</span><span className="odds-val">1.90</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {showCategory('combo') && (
              <div className="sports-market-panel">
                <button type="button" className="sports-market-panel-header" onClick={() => toggleMarket('combo')}>
                  <span>Match winner & total runs combo</span>
                  {expandedMarkets.combo ? <HiOutlineChevronUp /> : <HiOutlineChevronDown />}
                </button>
                {expandedMarkets.combo && isMatchBettable(activeMatch) && (
                  <div className="sports-market-odds-grid">
                    <button type="button" className={oddsBtnClass('Combo:Team1 & Over 300')} onClick={() => placeBet('Combo:Team1 & Over 300', 5.50, `${activeMatch.team1.name} & Over 300`, 'Winner & total combo')}>
                      <span>{activeMatch.team1.name} & Over 300</span><span className="odds-val">5.50</span>
                    </button>
                    <button type="button" className={oddsBtnClass('Combo:Team2 & Over 300')} onClick={() => placeBet('Combo:Team2 & Over 300', 3.80, `${activeMatch.team2.name} & Over 300`, 'Winner & total combo')}>
                      <span>{activeMatch.team2.name} & Over 300</span><span className="odds-val">3.80</span>
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
