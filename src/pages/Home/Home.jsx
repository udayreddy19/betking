import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiChevronLeft, FiChevronRight } from '../../icons';
import FilterChips from '../../components/FilterChips/FilterChips';
import SportIcon from '../../components/SportIcon/SportIcon';
import MatchCard from '../../components/MatchCard/MatchCard';
import HomeCategoryGrid from '../../components/HomeCategoryGrid/HomeCategoryGrid';
import { sportsCategories, featuredLeagues } from '../../data/mockData';
import { homePromoSlides } from '../../data/homePageData';
import { useLiveSports } from '../../context/LiveSportsContext';
import { useAuth } from '../../context/AuthContext';
import { filterMatches } from '../../utils/matchFilters';
import { getLeagueMeta, isSameLeague, matchBelongsToLeague } from '../../utils/leagueNavigation';
import './Home.css';

function filterByLeague(matchList, leagueId) {
  if (!leagueId) return matchList;
  const meta = getLeagueMeta(leagueId);
  if (!meta) return matchList;
  return matchList.filter((m) => matchBelongsToLeague(m, meta));
}

export default function Home() {
  const { matches, isScoresLoading } = useLiveSports();
  const { showToast } = useAuth();
  const navigate = useNavigate();
  const [activeSport, setActiveSport] = useState('cricket');
  const [activeLeague, setActiveLeague] = useState(null);
  const [promoIndex, setPromoIndex] = useState(0);
  const matchScrollRef = useRef(null);

  const leagueChips = useMemo(
    () => featuredLeagues.filter((l) => l.sport === activeSport),
    [activeSport]
  );

  const sportMatches = useMemo(() => {
    const bySport = filterMatches(matches || [], { sport: activeSport, stateTab: 'bettable' });
    return activeLeague ? filterByLeague(bySport, activeLeague) : bySport;
  }, [matches, activeSport, activeLeague]);

  useEffect(() => {
    const timer = setInterval(() => {
      setPromoIndex((i) => (i + 1) % homePromoSlides.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const scroll = (ref, direction) => {
    if (!ref.current) return;
    ref.current.scrollBy({ left: direction === 'left' ? -320 : 320, behavior: 'smooth' });
  };

  const handleSportChange = (sportId) => {
    setActiveSport(sportId);
    setActiveLeague(null);
  };

  const promo = homePromoSlides[promoIndex];

  return (
    <div className="home-page container" id="home-page">
      <button
        type="button"
        className="home-promo-banner"
        style={{ background: promo.gradient }}
        onClick={() => {
          if (promo.id === 'welcome') navigate('/register');
          else navigate('/promotions');
        }}
      >
        <div className="home-promo-banner__coin">
          <span>{promo.emoji}</span>
        </div>
        <div className="home-promo-banner__text">
          <span className="home-promo-banner__title">{promo.title}</span>
          <span className="home-promo-banner__subtitle">{promo.subtitle}</span>
        </div>
        <div className="home-promo-banner__dots">
          {homePromoSlides.map((s, i) => (
            <span
              key={s.id}
              className={`home-promo-dot ${i === promoIndex ? 'active' : ''}`}
              onClick={(e) => { e.stopPropagation(); setPromoIndex(i); }}
            />
          ))}
        </div>
      </button>

      <HomeCategoryGrid />

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
            {leagueChips.map((league) => (
              <button
                key={league.id}
                type="button"
                className={`home-league-chip ${isSameLeague(activeLeague, league.id) ? 'active' : ''}`}
                onClick={() => setActiveLeague(
                  isSameLeague(activeLeague, league.id) ? null : league.id
                )}
              >
                {league.icon && <span className="home-league-chip-icon">{league.icon}</span>}
                {league.name}
              </button>
            ))}
          </div>
        )}

        <div className="match-cards-scroll scroll-row-bleed" ref={matchScrollRef} key={`${activeSport}-${activeLeague}`}>
          {sportMatches.length > 0 ? (
            sportMatches.map((match) => (
              <MatchCard key={match.id} match={match} variant="home" />
            ))
          ) : isScoresLoading ? (
            <div className="no-matches-empty">
              <span className="no-matches-icon">⏳</span>
              <p>Loading matches…</p>
            </div>
          ) : (
            <div className="no-matches-empty">
              <SportIcon sport={activeSport} className="no-matches-icon" />
              <p>No {sportsCategories.find((s) => s.id === activeSport)?.name || 'sport'} matches right now</p>
              <button type="button" className="no-matches-cta" onClick={() => navigate('/sports')}>
                Browse all sports
              </button>
            </div>
          )}
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
