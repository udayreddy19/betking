import { useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiChevronRight, FiChevronLeft } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';
import PromoBanner from '../../components/PromoBanner/PromoBanner';
import CategoryGrid from '../../components/CategoryGrid/CategoryGrid';
import GameCarousel from '../../components/GameCarousel/GameCarousel';
import FilterChips from '../../components/FilterChips/FilterChips';
import MatchCard from '../../components/MatchCard/MatchCard';
import { casinoGames, promotions, sportsCategories, WELCOME_BONUS } from '../../data/mockData';
import { useLiveSports } from '../../context/LiveSportsContext';
import { filterMatches } from '../../utils/matchFilters';
import './Home.css';

const sportNameById = Object.fromEntries(sportsCategories.map(s => [s.id, s.name]));

const MATCH_STATE_TABS = [
  { id: 'all', label: 'All' },
  { id: 'live', label: 'Live' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'completed', label: 'Completed' },
];

export default function Home() {
  const { isLoggedIn } = useAuth();
  const { matches } = useLiveSports();
  const navigate = useNavigate();
  const [activeSport, setActiveSport] = useState('cricket');
  const [activeStateTab, setActiveStateTab] = useState('all');
  const matchScrollRef = useRef(null);

  const scrollMatches = (direction) => {
    if (!matchScrollRef.current) return;
    matchScrollRef.current.scrollBy({ left: direction === 'left' ? -320 : 320, behavior: 'smooth' });
  };

  const liveGames = casinoGames.filter(g => g.category?.includes('live') || g.category?.includes('table'));
  const crashGames = casinoGames.filter(g => g.category?.includes('crash') || g.isNew);

  const filteredMatches = useMemo(
    () => filterMatches(matches || [], { sport: activeSport, stateTab: activeStateTab }),
    [matches, activeSport, activeStateTab]
  );

  const handleSportChange = (sportId) => {
    setActiveSport(sportId);
    setActiveStateTab('all');
  };

  const emptyLabel = activeStateTab === 'all'
    ? ''
    : `${activeStateTab} `;

  return (
    <div className="home-page container" id="home-page">
      {isLoggedIn ? (
        <PromoBanner promos={promotions} />
      ) : (
        <div className="hero-banner" id="hero-banner">
          <div className="hero-content">
            <h1>Get your welcome bonus!</h1>
            <div className="hero-amount">{WELCOME_BONUS.displayShort}!</div>
            <button className="hero-cta" onClick={() => navigate('/register')}>
              Claim now
            </button>
            <p className="hero-promo-code">Use code <strong>{WELCOME_BONUS.code}</strong></p>
          </div>
          <div className="hero-visual">🎰</div>
        </div>
      )}

      <CategoryGrid />

      <div className="home-sports-action" id="sports-action-section">
        <div className="section-header">
          <h2>Sports action</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <button type="button" className="carousel-view-all" onClick={() => navigate('/sports')}>
              View All
            </button>
            <button type="button" className="carousel-nav-btn" onClick={() => scrollMatches('left')}><FiChevronLeft /></button>
            <button type="button" className="carousel-nav-btn" onClick={() => scrollMatches('right')}><FiChevronRight /></button>
          </div>
        </div>

        <FilterChips
          items={sportsCategories}
          activeId={activeSport}
          onSelect={handleSportChange}
          className="filter-chips-row"
        />

        <div className="home-match-state-tabs">
          {MATCH_STATE_TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              className={`home-match-state-tab ${activeStateTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveStateTab(tab.id)}
            >
              {tab.id === 'live' && <span className="tab-dot" />}
              {tab.label}
            </button>
          ))}
        </div>

        <div className="match-cards-scroll" ref={matchScrollRef} key={`${activeSport}-${activeStateTab}`}>
          {filteredMatches.length > 0 ? (
            filteredMatches.map(match => (
              <MatchCard key={match.id} match={match} />
            ))
          ) : (
            <div className="no-matches-empty">
              <span className="no-matches-icon">{sportsCategories.find(s => s.id === activeSport)?.icon || '🏆'}</span>
              <p>No {emptyLabel}{sportNameById[activeSport] || 'sport'} matches right now</p>
              <button type="button" className="no-matches-cta" onClick={() => navigate('/sports')}>
                Browse all sports
              </button>
            </div>
          )}
        </div>
      </div>

      <GameCarousel title="Top Live Games" games={liveGames.length > 0 ? liveGames : casinoGames} viewAllLink />
      <GameCarousel title="Blast Zone" games={crashGames.length > 0 ? crashGames : casinoGames} viewAllLink />
    </div>
  );
}
