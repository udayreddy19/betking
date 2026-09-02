import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FiChevronLeft, FiChevronRight } from '../../icons';
import FilterChips from '../../components/FilterChips/FilterChips';
import SportIcon from '../../components/SportIcon/SportIcon';
import MatchCard from '../../components/MatchCard/MatchCard';
import HomeCategoryGrid from '../../components/HomeCategoryGrid/HomeCategoryGrid';
import { sportsCategories, featuredLeagues } from '../../data/mockData';
import { useFeatureFlags } from '../../context/FeatureFlagsContext';
import { homePromoSlides } from '../../data/homePageData';
import { isSrlSeasonLive, SRL_LAUNCH_LABEL, SRL_PAGE_PATH } from '../../data/oddsyraSrlSeason';
import { useLiveMatches, useLiveSportsMeta } from '../../context/LiveSportsContext';
import LiveScoresFeedBanner from '../../components/LiveScoresFeedBanner/LiveScoresFeedBanner';
import { filterMatches, compareMatchesForSportsBoard } from '../../utils/matchFilters';
import { getMatchState } from '../../utils/matchBetting';
import { getLeagueMeta, isSameLeague, matchBelongsToLeague } from '../../utils/leagueNavigation';
import { useMatchWatchlist } from '../../hooks/useMatchWatchlist';
import BoostedOddsWidget from '../../components/BoostedOddsWidget/BoostedOddsWidget';
import AnimatedMotionGiftIcon from '../../components/AnimatedMotionGiftIcon/AnimatedMotionGiftIcon';
import ErrorBoundary from '../../components/ErrorBoundary/ErrorBoundary';
import './Home.css';

const HOME_MATCH_LIMIT = 12;

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function getPromoStride(track) {
  const slide = track?.firstElementChild;
  if (!slide) return 0;
  const gap = Number.parseFloat(getComputedStyle(track).gap || '0') || 0;
  return slide.getBoundingClientRect().width + gap;
}

function getPromoIndexFromScroll(track) {
  const stride = getPromoStride(track);
  if (!stride) return 0;
  return Math.max(
    0,
    Math.min(homePromoSlides.length - 1, Math.round(track.scrollLeft / stride)),
  );
}

function filterByLeague(matchList, leagueId) {
  if (!leagueId) return matchList;
  const meta = getLeagueMeta(leagueId);
  if (!meta) return matchList;
  return matchList.filter((m) => matchBelongsToLeague(m, meta));
}

export default function Home() {
  const matches = useLiveMatches();
  const { isScoresLoading, scoresError, refreshScores } = useLiveSportsMeta();
  const { isSportEnabled } = useFeatureFlags();
  const navigate = useNavigate();
  const [activeSport, setActiveSport] = useState('cricket');
  const [activeLeague, setActiveLeague] = useState(null);
  const [promoIndex, setPromoIndex] = useState(0);
  const matchScrollRef = useRef(null);
  const watchlistScrollRef = useRef(null);
  const promoScrollRef = useRef(null);
  const promoIndexRef = useRef(0);
  const promoAutoplayPaused = useRef(false);
  const promoAutoplayResumeId = useRef(0);
  const promoPointerStartX = useRef(0);
  const promoDidSwipe = useRef(false);
  const { ids: watchlistIds, count: watchlistCount } = useMatchWatchlist();

  const liveCount = useMemo(
    () => (matches || []).filter((m) => getMatchState(m) === 'in').length,
    [matches],
  );

  const sportCounts = useMemo(() => {
    const map = {};
    for (const cat of sportsCategories) {
      map[cat.id] = (matches || []).filter((m) => {
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

  const leagueChips = useMemo(() => {
    const all = featuredLeagues.filter((l) => l.sport === activeSport);
    // Only leagues that currently have matches — keeps the chip row short
    const withMatches = all.filter((league) => {
      const meta = getLeagueMeta(league.id);
      if (!meta) return false;
      return (matches || []).some((m) => {
        const s = String(m.sport || '').toLowerCase();
        const sportOk = activeSport === 'all'
          || s === activeSport
          || (activeSport === 'soccer' && (s === 'soccer' || s === 'football'));
        return sportOk && matchBelongsToLeague(m, meta);
      });
    });
    return (withMatches.length > 0 ? withMatches : all).slice(0, 4);
  }, [activeSport, matches]);

  const homeSportChips = useMemo(() => {
    const enabledCats = sportsCategories.filter((c) => c.id === 'all' || isSportEnabled(c.id));
    const withAction = enabledCats.filter((c) => c.id === 'all' || (sportCounts[c.id] || 0) > 0);
    return withAction.length > 1 ? withAction : enabledCats;
  }, [sportCounts, isSportEnabled]);

  useEffect(() => {
    if (activeSport !== 'all' && !isSportEnabled(activeSport)) {
      const next = homeSportChips.find((c) => c.id !== 'all')?.id || 'all';
      setActiveSport(next);
    }
  }, [activeSport, homeSportChips, isSportEnabled]);

  const sectionTitle = useMemo(() => {
    const sport = sportsCategories.find((c) => c.id === activeSport);
    const name = sport?.name || 'Sports';
    if (activeLeague) {
      const league = featuredLeagues.find((l) => isSameLeague(activeLeague, l.id));
      return league?.name || name;
    }
    if (activeSport === 'all') return liveCount > 0 ? 'Live now' : 'Sports';
    return liveCount > 0 && (sportCounts[activeSport] || 0) > 0
      ? `${name} · Live`
      : name;
  }, [activeSport, activeLeague, liveCount, sportCounts]);

  const sportMatches = useMemo(() => {
    const bySport = filterMatches(matches || [], { sport: activeSport, stateTab: 'bettable' });
    const filtered = activeLeague ? filterByLeague(bySport, activeLeague) : bySport;
    return [...filtered].sort((a, b) => {
      const oddsScore = (m) => {
        const o = m?.odds || m?.authoritativeOdds || {};
        const n = [o.team1, o.team2, o.draw].filter((v) => v != null && Number(v) > 1).length;
        return n;
      };
      const d = oddsScore(b) - oddsScore(a);
      if (d !== 0) return d;
      return compareMatchesForSportsBoard(a, b);
    });
  }, [matches, activeSport, activeLeague]);

  const scrollPromoTo = (index, behavior = 'smooth') => {
    const track = promoScrollRef.current;
    if (!track) return;
    const stride = getPromoStride(track);
    if (!stride) return;
    const clamped = ((index % homePromoSlides.length) + homePromoSlides.length) % homePromoSlides.length;
    const motion = prefersReducedMotion() ? 'auto' : behavior;
    track.scrollTo({ left: clamped * stride, behavior: motion });
    promoIndexRef.current = clamped;
    setPromoIndex(clamped);
  };

  const pausePromoAutoplay = () => {
    promoAutoplayPaused.current = true;
    window.clearTimeout(promoAutoplayResumeId.current);
    promoAutoplayResumeId.current = window.setTimeout(() => {
      promoAutoplayPaused.current = false;
    }, 8000);
  };

  useEffect(() => {
    const track = promoScrollRef.current;
    if (!track) return undefined;

    const syncIndexFromScroll = () => {
      const next = getPromoIndexFromScroll(track);
      promoIndexRef.current = next;
      setPromoIndex((prev) => (prev === next ? prev : next));
    };

    const snapToCurrent = () => {
      const stride = getPromoStride(track);
      if (!stride) return;
      track.scrollTo({ left: promoIndexRef.current * stride, behavior: 'auto' });
    };

    track.addEventListener('scroll', syncIndexFromScroll, { passive: true });
    window.addEventListener('resize', snapToCurrent);
    return () => {
      track.removeEventListener('scroll', syncIndexFromScroll);
      window.removeEventListener('resize', snapToCurrent);
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      if (promoAutoplayPaused.current || document.hidden || prefersReducedMotion()) return;
      const track = promoScrollRef.current;
      const current = track ? getPromoIndexFromScroll(track) : promoIndexRef.current;
      scrollPromoTo(current + 1);
    }, 5000);
    return () => {
      clearInterval(timer);
      window.clearTimeout(promoAutoplayResumeId.current);
    };
  }, []);

  const scroll = (ref, direction) => {
    if (!ref.current) return;
    ref.current.scrollBy({ left: direction === 'left' ? -320 : 320, behavior: 'smooth' });
  };

  const handleSportChange = (sportId) => {
    setActiveSport(sportId);
    setActiveLeague(null);
  };

  const watchlistMatches = useMemo(() => {
    const idSet = new Set(watchlistIds);
    return (matches || []).filter((m) => idSet.has(String(m.id)));
  }, [matches, watchlistIds]);

  const resolvePromoSlide = (slide) => (
    slide.id === 'srl'
      ? {
        ...slide,
        subtitle: isSrlSeasonLive()
          ? 'NOW LIVE — SIMULATED CRICKET'
          : `BEGINS ${SRL_LAUNCH_LABEL.toUpperCase()} — SIMULATED CRICKET`,
      }
      : slide
  );

  const promoSlidePath = (id) => {
    if (id === 'srl') return SRL_PAGE_PATH;
    if (id === 'sports') return '/live-betting';
    return '/promotions';
  };

  return (
    <div className="home-page container" id="home-page">
      <LiveScoresFeedBanner
        message={scoresError}
        onRetry={() => refreshScores({ force: true })}
        retrying={isScoresLoading}
      />

      <div
        className="home-promo-carousel"
        role="region"
        aria-roledescription="carousel"
        aria-label="Featured promotions"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
          e.preventDefault();
          pausePromoAutoplay();
          scrollPromoTo(promoIndex + (e.key === 'ArrowRight' ? 1 : -1));
        }}
      >
        <div
          className="home-promo-track"
          ref={promoScrollRef}
          onPointerDown={(e) => {
            promoPointerStartX.current = e.clientX;
            promoDidSwipe.current = false;
            pausePromoAutoplay();
          }}
          onPointerMove={(e) => {
            if (Math.abs(e.clientX - promoPointerStartX.current) > 10) {
              promoDidSwipe.current = true;
            }
          }}
        >
          {homePromoSlides.map((raw, i) => {
            const slide = resolvePromoSlide(raw);
            return (
              <Link
                key={slide.id}
                to={promoSlidePath(slide.id)}
                className="home-promo-banner"
                style={{ background: slide.gradient, '--promo-accent': slide.accent }}
                aria-label={`${slide.title}. ${slide.subtitle}`}
                aria-hidden={i === promoIndex ? undefined : 'true'}
                tabIndex={i === promoIndex ? 0 : -1}
                draggable={false}
                onClick={(e) => {
                  if (promoDidSwipe.current) e.preventDefault();
                }}
              >
                <div className="home-promo-banner__coin">
                  {slide.emoji === '🎁'
                    ? <AnimatedMotionGiftIcon size={32} paused={i !== promoIndex} />
                    : <span>{slide.emoji}</span>}
                </div>
                <div className="home-promo-banner__text">
                  <span className="home-promo-banner__title">{slide.title}</span>
                  <span className="home-promo-banner__subtitle">{slide.subtitle}</span>
                </div>
              </Link>
            );
          })}
        </div>
        <div className="home-promo-banner__dots" role="group" aria-label="Promotion slides">
          {homePromoSlides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={`home-promo-dot ${i === promoIndex ? 'active' : ''}`}
              aria-label={`Show ${s.title}`}
              aria-pressed={i === promoIndex}
              onClick={() => {
                pausePromoAutoplay();
                scrollPromoTo(i);
              }}
            />
          ))}
        </div>
      </div>

      <HomeCategoryGrid liveCount={liveCount} />

      {watchlistCount > 0 && (
        <section className="home-section home-watchlist" id="watchlist-section">
          <div className="section-header">
            <h2>Your watchlist</h2>
            <div className="section-header-actions">
              <button type="button" className="carousel-view-all" onClick={() => navigate('/sports?watchlist=1')}>
                View all
              </button>
              <button type="button" className="carousel-nav-btn" onClick={() => scroll(watchlistScrollRef, 'left')} aria-label="Scroll watchlist left">
                <FiChevronLeft />
              </button>
              <button type="button" className="carousel-nav-btn" onClick={() => scroll(watchlistScrollRef, 'right')} aria-label="Scroll watchlist right">
                <FiChevronRight />
              </button>
            </div>
          </div>
          <div className="match-cards-scroll scroll-row-bleed" ref={watchlistScrollRef}>
            {watchlistMatches.length > 0 ? (
              watchlistMatches.slice(0, HOME_MATCH_LIMIT).map((match) => (
                <ErrorBoundary key={match.id} resetKey={match.id} fallback={null}>
                  <MatchCard match={match} variant="home" />
                </ErrorBoundary>
              ))
            ) : (
              <div className="no-matches-empty">
                <p>Saved matches are not on the board right now. They’ll show here again when they return.</p>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="home-section home-boosted">
        <BoostedOddsWidget />
      </section>

      <section className="home-section home-sports-action" id="sports-action-section">
        <div className="section-header">
          <h2>{sectionTitle}</h2>
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
          items={homeSportChips}
          activeId={activeSport}
          onSelect={handleSportChange}
          counts={sportCounts}
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
            sportMatches.slice(0, HOME_MATCH_LIMIT).map((match) => (
              <ErrorBoundary key={match.id} resetKey={match.id} fallback={null}>
                <MatchCard match={match} variant="home" />
              </ErrorBoundary>
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
    </div>
  );
}
