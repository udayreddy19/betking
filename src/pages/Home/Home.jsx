import { useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiChevronRight, FiChevronLeft } from 'react-icons/fi';
import FilterChips from '../../components/FilterChips/FilterChips';
import MatchCard from '../../components/MatchCard/MatchCard';
import HomeCategoryGrid from '../../components/HomeCategoryGrid/HomeCategoryGrid';
import ProviderRibbon from '../../components/ProviderRibbon/ProviderRibbon';
import HomeTopGameCard from '../../components/HomeTopGameCard/HomeTopGameCard';
import GameCard from '../../components/GameCard/GameCard';
import { sportsCategories, featuredLeagues, casinoGames } from '../../data/mockData';
import { liveCasinoGames } from '../../data/casinoGamesData';
import {
  homePromoSlides,
  topGameIds,
  topLiveGameCount,
} from '../../data/homePageData';
import { useLiveSports } from '../../context/LiveSportsContext';
import { useAuth } from '../../context/AuthContext';
import { filterMatches } from '../../utils/matchFilters';
import { getLeagueMeta, isSameLeague } from '../../utils/leagueNavigation';
import './Home.css';

function filterByLeague(matchList, leagueId) {
  if (!leagueId || leagueId === 'all') return matchList;
  const meta = getLeagueMeta(leagueId);
  if (!meta) return matchList;
  return matchList.filter(
    (m) => meta.matchLeagues.includes(m.league) || m.league === meta.name
  );
}

export default function Home() {
  const { matches } = useLiveSports();
  const { showToast } = useAuth();
  const navigate = useNavigate();
  const [activeSport, setActiveSport] = useState('cricket');
  const [activeLeague, setActiveLeague] = useState('all');
  const [promoIndex, setPromoIndex] = useState(0);
  const matchScrollRef = useRef(null);
  const topGamesRef = useRef(null);
  const liveGamesRef = useRef(null);

  const leagueChips = useMemo(
    () => featuredLeagues.filter((l) => l.sport === activeSport),
    [activeSport]
  );

  const sportMatches = useMemo(() => {
    const bySport = filterMatches(matches || [], { sport: activeSport, stateTab: 'all' });
    return filterByLeague(bySport, activeLeague);
  }, [matches, activeSport, activeLeague]);

  const topGames = useMemo(
    () => topGameIds.map((id) => casinoGames.find((g) => g.id === id)).filter(Boolean),
    []
  );

  const topLiveGames = useMemo(
    () => liveCasinoGames.filter((g) => g.isHot || g.isLive).slice(0, topLiveGameCount),
    []
  );

  const scroll = (ref, direction) => {
    if (!ref.current) return;
    ref.current.scrollBy({ left: direction === 'left' ? -320 : 320, behavior: 'smooth' });
  };

  const handleSportChange = (sportId) => {
    setActiveSport(sportId);
    setActiveLeague('all');
  };

  const promo = homePromoSlides[promoIndex % homePromoSlides.length];

  return (
    <div className="home-page container" id="home-page">
      {/* Promo banner carousel */}
      <button
        type="button"
        className="home-promo-banner"
        style={{ background: promo.gradient }}
        onClick={() => {
          setPromoIndex((i) => (i + 1) % homePromoSlides.length);
          if (promo.id === 'welcome') navigate('/register');
          else navigate('/promotions');
        }}
      >
        <div className="home-promo-banner__coin" style={{ borderColor: promo.accent }}>
          <span>{promo.emoji}</span>
        </div>
        <div className="home-promo-banner__text">
          <span className="home-promo-banner__title">{promo.title}</span>
          <span className="home-promo-banner__subtitle">{promo.subtitle}</span>
        </div>
        <div className="home-promo-banner__dots">
          {homePromoSlides.map((s, i) => (
            <span key={s.id} className={`home-promo-dot ${i === promoIndex % homePromoSlides.length ? 'active' : ''}`} />
          ))}
        </div>
      </button>

      {/* Category grid: SPORTS / LIVE CASINO / INSTANT / VIP / PROMOS / LOYALTY */}
      <HomeCategoryGrid />

      {/* Top Games */}
      <section className="home-section" id="top-games-section">
        <div className="section-header">
          <h2>Top Games</h2>
          <div className="section-header-actions">
            <button type="button" className="carousel-view-all" onClick={() => navigate('/casino')}>
              View All
            </button>
            <button type="button" className="carousel-nav-btn" onClick={() => scroll(topGamesRef, 'left')} aria-label="Scroll left">
              <FiChevronLeft />
            </button>
            <button type="button" className="carousel-nav-btn" onClick={() => scroll(topGamesRef, 'right')} aria-label="Scroll right">
              <FiChevronRight />
            </button>
          </div>
        </div>
        <div className="home-games-scroll" ref={topGamesRef}>
          {topGames.map((game) => (
            <HomeTopGameCard key={game.id} game={game} />
          ))}
        </div>
      </section>

      {/* Provider ribbon */}
      <ProviderRibbon />

      {/* Sports action */}
      <section className="home-section home-sports-action" id="sports-action-section">
        <div className="section-header">
          <h2>Sports action</h2>
          <div className="section-header-actions">
            <button type="button" className="carousel-view-all" onClick={() => navigate('/sports')}>
              View All
            </button>
            <button type="button" className="carousel-nav-btn" onClick={() => scroll(matchScrollRef, 'left')} aria-label="Scroll left">
              <FiChevronLeft />
            </button>
            <button type="button" className="carousel-nav-btn" onClick={() => scroll(matchScrollRef, 'right')} aria-label="Scroll right">
              <FiChevronRight />
            </button>
          </div>
        </div>

        <FilterChips
          items={sportsCategories}
          activeId={activeSport}
          onSelect={handleSportChange}
          className="filter-chips-row scroll-row-bleed home-sport-chips"
        />

        {leagueChips.length > 0 && (
          <div className="home-league-chips scroll-row-bleed">
            <button
              type="button"
              className={`home-league-chip ${activeLeague === 'all' ? 'active' : ''}`}
              onClick={() => setActiveLeague('all')}
            >
              All
            </button>
            {leagueChips.map((league) => (
              <button
                key={league.id}
                type="button"
                className={`home-league-chip ${isSameLeague(activeLeague, league.id) ? 'active' : ''}`}
                onClick={() => setActiveLeague(league.id)}
              >
                {league.icon && <span className="home-league-chip-icon">{league.icon}</span>}
                {league.name}
              </button>
            ))}
          </div>
        )}

        <div className="match-cards-scroll" ref={matchScrollRef} key={`${activeSport}-${activeLeague}`}>
          {sportMatches.length > 0 ? (
            sportMatches.map((match) => (
              <MatchCard key={match.id} match={match} variant="home" />
            ))
          ) : (
            <div className="no-matches-empty">
              <span className="no-matches-icon">{sportsCategories.find((s) => s.id === activeSport)?.icon || '🏆'}</span>
              <p>No {sportsCategories.find((s) => s.id === activeSport)?.name || 'sport'} matches right now</p>
              <button type="button" className="no-matches-cta" onClick={() => navigate('/sports')}>
                Browse all sports
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Top Live Games */}
      <section className="home-section home-live-games" id="top-live-games-section">
        <div className="section-header">
          <h2>Top Live Games</h2>
          <div className="section-header-actions">
            <button type="button" className="carousel-view-all" onClick={() => navigate('/live-casino')}>
              View All
            </button>
            <button type="button" className="carousel-nav-btn" onClick={() => scroll(liveGamesRef, 'left')} aria-label="Scroll left">
              <FiChevronLeft />
            </button>
            <button type="button" className="carousel-nav-btn" onClick={() => scroll(liveGamesRef, 'right')} aria-label="Scroll right">
              <FiChevronRight />
            </button>
          </div>
        </div>
        <div className="home-live-games-scroll" ref={liveGamesRef}>
          {topLiveGames.map((game) => (
            <div key={game.id} className="home-live-game-wrap">
              <GameCard game={game} />
            </div>
          ))}
        </div>
      </section>

      <button
        type="button"
        className="home-chat-fab"
        aria-label="Live chat"
        onClick={() => showToast('Live chat support coming soon!', 'info')}
      >
        💬
      </button>
    </div>
  );
}
