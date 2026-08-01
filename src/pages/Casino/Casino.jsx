import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FiSearch } from 'react-icons/fi';
import GameCarousel from '../../components/GameCarousel/GameCarousel';
import { casinoGames, casinoCategories } from '../../data/mockData';
import { filterCasinoByCategory, filterGamesBySearch } from '../../data/casinoGamesData';
import './Casino.css';

export default function Casino() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialCategory = searchParams.get('cat') || 'all';
  const [activeCategory, setActiveCategory] = useState(initialCategory);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [searchOpen, setSearchOpen] = useState(Boolean(searchParams.get('q')));

  useEffect(() => {
    const cat = searchParams.get('cat');
    if (cat) setActiveCategory(cat);
    const q = searchParams.get('q') || '';
    setSearchQuery(q);
    if (q) setSearchOpen(true);
  }, [searchParams]);

  const selectCategory = (catId) => {
    setActiveCategory(catId);
    const next = new URLSearchParams(searchParams);
    if (catId === 'all') next.delete('cat');
    else next.set('cat', catId);
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
    () => filterCasinoByCategory(casinoGames, activeCategory),
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
      return [{
        title: casinoCategories.find(c => c.id === activeCategory)?.name || 'Games',
        games: filteredGames,
      }];
    }

    return [
      { title: 'Top Games', games: casinoGames.filter(g => g.category.split(' ').includes('top-slots')) },
      { title: 'Crash Games', games: casinoGames.filter(g => g.category.split(' ').includes('crash-games')) },
      { title: 'Slots', games: casinoGames.filter(g => g.category.split(' ').includes('slots') && !g.category.split(' ').includes('jackpots')) },
      { title: 'Jackpots', games: casinoGames.filter(g => g.category.split(' ').includes('jackpots')) },
      { title: 'Live Casino', games: casinoGames.filter(g => g.category.split(' ').includes('live-casino')) },
      { title: 'Table Games', games: casinoGames.filter(g => g.category.split(' ').includes('table-games') && !g.category.split(' ').includes('live-casino')) },
    ];
  }, [activeCategory, filteredGames, searchQuery]);

  return (
    <div className="casino-page container" id="casino-page">
      <div className="casino-hero">
        <h1>Casino</h1>
        <p>2,000+ slots, crash games, jackpots, and table classics — play instantly.</p>
      </div>

      <div className="casino-categories scroll-row-bleed" id="casino-categories">
        <button
          type="button"
          className={`casino-search-btn ${searchOpen ? 'active' : ''}`}
          aria-label="Search games"
          aria-expanded={searchOpen}
          onClick={() => setSearchOpen((open) => !open)}
        >
          <FiSearch />
        </button>
        {searchOpen && (
          <input
            type="search"
            className="casino-search-input"
            placeholder="Search games…"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            autoFocus
            aria-label="Search casino games"
          />
        )}
        {casinoCategories.map(cat => (
          <button
            key={cat.id}
            type="button"
            className={`casino-cat-btn ${activeCategory === cat.id ? 'active' : ''}`}
            onClick={() => selectCategory(cat.id)}
          >
            <span className="cat-icon">{cat.icon}</span> {cat.name}
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
            viewAllPath={`/casino?cat=${activeCategory === 'all' ? 'all' : activeCategory}`}
            layout={activeCategory !== 'all' || searchQuery.trim() ? 'grid' : 'scroll'}
          />
        )
      ))}

      {filteredGames.length === 0 && (
        <div className="casino-empty">
          <p>No games match your search. Try another name or category.</p>
        </div>
      )}
    </div>
  );
}
