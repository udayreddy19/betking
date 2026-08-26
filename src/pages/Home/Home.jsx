import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiChevronLeft, FiChevronRight } from '../../icons';
import FilterChips from '../../components/FilterChips/FilterChips';
import SportIcon from '../../components/SportIcon/SportIcon';
import MatchCard from '../../components/MatchCard/MatchCard';
import HomeCategoryGrid from '../../components/HomeCategoryGrid/HomeCategoryGrid';
import { sportsCategories, featuredLeagues } from '../../data/mockData';
import { homePromoSlides } from '../../data/homePageData';
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

function filterByLeague(matchList, leagueId) {
  if (!leagueId) return matchList;
  const meta = getLeagueMeta(leagueId);
  if (!meta) return matchList;
  return matchList.filter((m) => matchBelongsToLeague(m, meta));
}

export default function Home() {
  const matches = useLiveMatches();
  const { isScoresLoading, scoresError, refreshScores } = useLiveSportsMeta();
  const navigate = useNavigate();
  const [activeSport, setActiveSport] = useState('cricket');
  const [activeLeague, setActiveLeague] = useState(null);
  const [promoIndex, setPromoIndex] = useState(0);
  const matchScrollRef = useRef(null);
  const watchlistScrollRef = useRef(null);
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
    const withAction = sportsCategories.filter((c) => c.id === 'all' || (sportCounts[c.id] || 0) > 0);
    return withAction.length > 1 ? withAction : sportsCategories;
  }, [sportCounts]);

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

  const watchlistMatches = useMemo(() => {
    const idSet = new Set(watchlistIds);
    return (matches || []).filter((m) => idSet.has(String(m.id)));
  }, [matches, watchlistIds]);

  const promo = homePromoSlides[promoIndex];

  return (
    <div className="home-page container" id="home-page">
      <LiveScoresFeedBanner
        message={scoresError}
        onRetry={() => refreshScores({ force: true })}
        retrying={isScoresLoading}
      />
      <button
        type="button"
        className="home-promo-banner"
        style={{ background: promo.gradient }}
        onClick={() => {
          if (promo.id === 'sports') navigate('/live-betting');
          else navigate('/promotions');
        }}
      >
        <div className="home-promo-banner__coin">
          {promo.emoji === '🎁' ? <AnimatedMotionGiftIcon size={32} /> : <span>{promo.emoji}</span>}
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
