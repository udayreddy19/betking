import { useState, useMemo } from 'react';
import { FiSearch } from 'react-icons/fi';
import PromoBanner from '../../components/PromoBanner/PromoBanner';
import GameCarousel from '../../components/GameCarousel/GameCarousel';
import { casinoGames, liveCasinoCategories, promotions } from '../../data/mockData';
import './LiveCasino.css';

export default function LiveCasino() {
  const [activeCategory, setActiveCategory] = useState('all');

  const liveGames = useMemo(() =>
    casinoGames.filter(g => g.category.includes('live')),
    []
  );

  const gameGroups = useMemo(() => {
    if (activeCategory !== 'all') {
      const filtered = liveGames.filter(g =>
        g.category.includes(activeCategory) ||
        g.provider.toLowerCase().includes(activeCategory)
      );
      const catName = liveCasinoCategories.find(c => c.id === activeCategory)?.name || 'Games';
      return [{ title: catName, games: filtered.length > 0 ? filtered : liveGames }];
    }
    return [
      { title: 'Recently Played', games: liveGames.slice(0, 3) },
      { title: 'Recommended For You', games: liveGames.slice(2, 8) },
      { title: 'Top Evolution', games: liveGames.filter(g => g.provider === 'Evolution') },
      { title: 'All Live Games', games: liveGames },
    ];
  }, [activeCategory, liveGames]);

  return (
    <div className="live-casino-page container" id="live-casino-page">
      <PromoBanner promos={[promotions[1], promotions[4], promotions[5]]} />

      <div className="live-casino-categories" id="lc-categories">
        <button className="lc-search-btn" aria-label="Search games">
          <FiSearch />
        </button>
        {liveCasinoCategories.map(cat => (
          <button
            key={cat.id}
            className={`lc-cat-btn ${activeCategory === cat.id ? 'active' : ''}`}
            onClick={() => setActiveCategory(cat.id)}
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
            viewAllLink
          />
        )
      ))}
    </div>
  );
}
