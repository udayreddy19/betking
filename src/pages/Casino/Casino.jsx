import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FiSearch } from 'react-icons/fi';
import GameCarousel from '../../components/GameCarousel/GameCarousel';
import { casinoGames, casinoCategories } from '../../data/mockData';
import { filterCasinoByCategory } from '../../data/casinoGamesData';
import './Casino.css';

export default function Casino() {
  const [searchParams] = useSearchParams();
  const initialCategory = searchParams.get('cat') || 'all';
  const [activeCategory, setActiveCategory] = useState(initialCategory);

  useEffect(() => {
    const cat = searchParams.get('cat');
    if (cat) setActiveCategory(cat);
  }, [searchParams]);

  const filteredGames = useMemo(
    () => filterCasinoByCategory(casinoGames, activeCategory),
    [activeCategory]
  );

  const gameGroups = useMemo(() => {
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
  }, [activeCategory, filteredGames]);

  return (
    <div className="casino-page container" id="casino-page">
      <div className="casino-hero">
        <h1>Casino</h1>
        <p>2,000+ slots, crash games, jackpots, and table classics — play instantly.</p>
      </div>

      <div className="casino-categories scroll-row-bleed" id="casino-categories">
        <button type="button" className="casino-search-btn" aria-label="Search games">
          <FiSearch />
        </button>
        {casinoCategories.map(cat => (
          <button
            key={cat.id}
            type="button"
            className={`casino-cat-btn ${activeCategory === cat.id ? 'active' : ''}`}
            onClick={() => setActiveCategory(cat.id)}
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
            viewAllLink={activeCategory === 'all'}
            viewAllPath={`/casino?cat=${activeCategory === 'all' ? 'all' : activeCategory}`}
            layout={activeCategory !== 'all' ? 'grid' : 'scroll'}
          />
        )
      ))}
    </div>
  );
}
