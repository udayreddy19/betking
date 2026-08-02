import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FiSearch } from '../../icons';
import GameCarousel from '../../components/GameCarousel/GameCarousel';
import { liveCasinoGames, liveCasinoCategories } from '../../data/mockData';
import { filterLiveCasinoByType, filterGamesBySearch } from '../../data/casinoGamesData';
import './LiveCasino.css';

export default function LiveCasino() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialCategory = searchParams.get('type') || 'all';
  const [activeCategory, setActiveCategory] = useState(initialCategory);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [searchOpen, setSearchOpen] = useState(Boolean(searchParams.get('q')));

  useEffect(() => {
    const type = searchParams.get('type');
    if (type) setActiveCategory(type);
    const q = searchParams.get('q') || '';
    setSearchQuery(q);
    if (q) setSearchOpen(true);
  }, [searchParams]);

  const selectCategory = (catId) => {
    setActiveCategory(catId);
    const next = new URLSearchParams(searchParams);
    if (catId === 'all') next.delete('type');
    else next.set('type', catId);
    setSearchParams(next, { replace: true });
  };

  const handleSearchChange = (value) => {
    setSearchQuery(value);
    const next = new URLSearchParams(searchParams);
    if (value.trim()) next.set('q', value.trim());
    else next.delete('q');
    setSearchParams(next, { replace: true });
  };

  const categoryGames = useMemo(
    () => filterLiveCasinoByType(liveCasinoGames, activeCategory),
    [activeCategory]
  );

  const filteredGames = useMemo(
    () => filterGamesBySearch(categoryGames, searchQuery),
    [categoryGames, searchQuery]
  );

  const gameGroups = useMemo(() => {
    if (searchQuery.trim()) {
      return [{ title: `Results for "${searchQuery.trim()}"`, games: filteredGames }];
    }

    if (activeCategory !== 'all') {
      const catName = liveCasinoCategories.find(c => c.id === activeCategory)?.name || 'Games';
      return [{ title: catName, games: filteredGames }];
    }

    const byType = (type) => liveCasinoGames.filter(g => g.liveType === type);

    return [
      { title: 'Popular Live Tables', games: liveCasinoGames.filter(g => g.isHot).slice(0, 8) },
      { title: 'Game Shows', games: byType('game-shows') },
      { title: 'Roulette', games: byType('roulette') },
      { title: 'Blackjack', games: byType('blackjack') },
      { title: 'Baccarat & Cards', games: byType('baccarat') },
      { title: 'All Live Games', games: liveCasinoGames },
    ];
  }, [activeCategory, filteredGames, searchQuery]);

  return (
    <div className="live-casino-page container" id="live-casino-page">
      <div className="live-casino-hero">
        <h1>Live Casino</h1>
        <p>Real dealers, HD streams, and tables open 24/7 — from ₹10 minimum bets.</p>
      </div>

      <div className="live-casino-categories scroll-row-bleed" id="lc-categories">
        <button
          type="button"
          className={`lc-search-btn ${searchOpen ? 'active' : ''}`}
          aria-label="Search games"
          aria-expanded={searchOpen}
          onClick={() => setSearchOpen((open) => !open)}
        >
          <FiSearch />
        </button>
        {searchOpen && (
          <input
            type="search"
            className="lc-search-input"
            placeholder="Search live tables…"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            autoFocus
            aria-label="Search live casino games"
          />
        )}
        {liveCasinoCategories.map(cat => (
          <button
            key={cat.id}
            type="button"
            className={`lc-cat-btn ${activeCategory === cat.id ? 'active' : ''}`}
            onClick={() => selectCategory(cat.id)}
          >
            {cat.icon} {cat.name}
          </button>
        ))}
      </div>

      {gameGroups.map(group => (
        group.games.length > 0 && (
          <GameCarousel
            key={group.title}
            title={group.title}
            games={group.games}
            viewAllLink={activeCategory === 'all' && !searchQuery.trim()}
            viewAllPath="/live-casino"
            layout={activeCategory !== 'all' || searchQuery.trim() ? 'grid' : 'scroll'}
          />
        )
      ))}

      {filteredGames.length === 0 && (
        <div className="casino-empty">
          <p>No live tables match your search.</p>
        </div>
      )}
    </div>
  );
}
