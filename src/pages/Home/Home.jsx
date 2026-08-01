import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiChevronRight, FiChevronLeft } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';
import PromoBanner from '../../components/PromoBanner/PromoBanner';
import CategoryGrid from '../../components/CategoryGrid/CategoryGrid';
import GameCarousel from '../../components/GameCarousel/GameCarousel';
import FilterChips from '../../components/FilterChips/FilterChips';
import MatchCard from '../../components/MatchCard/MatchCard';
import { casinoGames, promotions, sportsCategories, WELCOME_BONUS } from '../../data/mockData';

const sportNameById = Object.fromEntries(sportsCategories.map(s => [s.id, s.name]));
import { useLiveSports } from '../../context/LiveSportsContext';
import './Home.css';

export default function Home() {
  const { isLoggedIn } = useAuth();
  const { matches } = useLiveSports();
  const navigate = useNavigate();
  const [activeSport, setActiveSport] = useState('cricket');

  const liveGames = casinoGames.filter(g => g.category?.includes('live') || g.category?.includes('table'));
  const crashGames = casinoGames.filter(g => g.category?.includes('crash') || g.isNew);
  const filteredMatches = matches ? matches.filter(m => m.sport === activeSport) : [];

  return (
    <div className="home-page container" id="home-page">
      {/* Hero / Promo Banner */}
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

      {/* Category Grid */}
      <CategoryGrid />

      {/* Sports Action */}
      <div className="home-sports-action" id="sports-action-section">
        <div className="section-header">
          <h2>Sports action</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <button className="carousel-view-all" onClick={() => navigate('/sports')}>
              View All
            </button>
            <button className="carousel-nav-btn"><FiChevronLeft /></button>
            <button className="carousel-nav-btn"><FiChevronRight /></button>
          </div>
        </div>

        <FilterChips
          items={sportsCategories}
          activeId={activeSport}
          onSelect={setActiveSport}
          className="filter-chips-row"
        />

        <div className="match-cards-scroll">
          {filteredMatches.length > 0 ? (
            filteredMatches.map(match => (
              <MatchCard key={match.id} match={match} />
            ))
          ) : (
            <div className="no-matches-empty">
              <span className="no-matches-icon">{sportsCategories.find(s => s.id === activeSport)?.icon || '🏆'}</span>
              <p>No live {sportNameById[activeSport] || 'sport'} events right now</p>
              <button type="button" className="no-matches-cta" onClick={() => navigate('/sports')}>
                Browse all sports
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Top Live Games */}
      <GameCarousel title="Top Live Games" games={liveGames.length > 0 ? liveGames : casinoGames} viewAllLink />

      {/* Blast Zone */}
      <GameCarousel title="Blast Zone" games={crashGames.length > 0 ? crashGames : casinoGames} viewAllLink />
    </div>
  );
}
