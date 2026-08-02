import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { FiChevronLeft, FiChevronRight, FiMessageCircle } from '../../icons';
import FilterChips from '../../components/FilterChips/FilterChips';
import SportIcon from '../../components/SportIcon/SportIcon';
import MatchCard from '../../components/MatchCard/MatchCard';
import HomeCategoryGrid from '../../components/HomeCategoryGrid/HomeCategoryGrid';
import FadeIn from '../../components/motion/FadeIn';
import StaggerChildren, { StaggerItem } from '../../components/motion/StaggerChildren';
import { MatchCardSkeleton } from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import Button from '../../components/ui/Button';
import { useReducedMotion, motionDuration } from '../../components/motion/useReducedMotion';
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
  const reduced = useReducedMotion();
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
      <FadeIn className="home-promo-wrap">
        <button
          type="button"
          className="home-promo-banner home-promo-banner--glass"
          onClick={() => {
            if (promo.id === 'welcome') navigate('/register');
            else navigate('/promotions');
          }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={promo.id}
              className="home-promo-banner__inner"
              style={{ background: promo.gradient }}
              initial={{ opacity: 0, x: reduced ? 0 : 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: reduced ? 0 : -20 }}
              transition={{ duration: motionDuration(reduced, 0.35) }}
            >
              <div className="home-promo-banner__coin">
                <span>{promo.emoji}</span>
              </div>
              <div className="home-promo-banner__text">
                <span className="home-promo-banner__title">{promo.title}</span>
                <span className="home-promo-banner__subtitle">{promo.subtitle}</span>
              </div>
            </motion.div>
          </AnimatePresence>
          <div className="home-promo-banner__dots">
            {homePromoSlides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                className={`home-promo-dot ${i === promoIndex ? 'active' : ''}`}
                onClick={(e) => { e.stopPropagation(); setPromoIndex(i); }}
                aria-label={`Promo slide ${i + 1}`}
              />
            ))}
          </div>
        </button>
      </FadeIn>

      <HomeCategoryGrid />

      <section className="home-section home-sports-action" id="sports-action-section">
        <FadeIn className="section-header">
          <h2>Sports action</h2>
          <div className="section-header-actions">
            <Button variant="ghost" size="sm" onClick={() => navigate('/sports')}>
              View All
            </Button>
            <button type="button" className="carousel-nav-btn" onClick={() => scroll(matchScrollRef, 'left')} aria-label="Scroll left">
              <FiChevronLeft />
            </button>
            <button type="button" className="carousel-nav-btn" onClick={() => scroll(matchScrollRef, 'right')} aria-label="Scroll right">
              <FiChevronRight />
            </button>
          </div>
        </FadeIn>

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
                <SportIcon sport={league.sport} icon={league.icon} className="home-league-chip-icon" />
                {league.name}
              </button>
            ))}
          </div>
        )}

        <div className="match-cards-scroll scroll-row-bleed" ref={matchScrollRef} key={`${activeSport}-${activeLeague}`}>
          {sportMatches.length > 0 ? (
            <StaggerChildren className="match-cards-stagger">
              {sportMatches.map((match) => (
                <StaggerItem key={match.id}>
                  <MatchCard match={match} variant="home" />
                </StaggerItem>
              ))}
            </StaggerChildren>
          ) : isScoresLoading ? (
            <div className="match-cards-loading">
              {[0, 1, 2].map((i) => <MatchCardSkeleton key={i} />)}
            </div>
          ) : (
            <EmptyState
              icon={<SportIcon sport={activeSport} className="no-matches-icon" size={32} />}
              title={`No ${sportsCategories.find((s) => s.id === activeSport)?.name || 'sport'} matches right now`}
              actionLabel="Browse all sports"
              onAction={() => navigate('/sports')}
            />
          )}
        </div>
      </section>

      <motion.button
        type="button"
        className="home-chat-fab"
        aria-label="Live chat"
        onClick={() => showToast('Live chat support coming soon!', 'info')}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <FiMessageCircle size={24} />
      </motion.button>
    </div>
  );
}
