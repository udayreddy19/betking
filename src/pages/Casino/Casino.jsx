import { useState, useMemo } from 'react';
import { FiSearch } from 'react-icons/fi';
import PromoBanner from '../../components/PromoBanner/PromoBanner';
import GameCarousel from '../../components/GameCarousel/GameCarousel';
import { casinoGames, casinoCategories, promotions } from '../../data/mockData';
import './Casino.css';

export default function Casino() {
  const [activeCategory, setActiveCategory] = useState('all');

  const filteredGames = useMemo(() => {
    if (activeCategory === 'all') return casinoGames;
    return casinoGames.filter(g => g.category.includes(activeCategory));
  }, [activeCategory]);

  // Group games by category for "all" view
  const gameGroups = useMemo(() => {
    if (activeCategory !== 'all') {
      return [{ title: casinoCategories.find(c => c.id === activeCategory)?.name || 'Games', games: filteredGames }];
    }
    return [
      { title: 'Top Games', games: casinoGames.filter(g => g.category.includes('top')) },
      { title: 'New', games: casinoGames.filter(g => g.category.includes('new')) },
      { title: 'Crash Games', games: casinoGames.filter(g => g.category.includes('crash')) },
      { title: 'Indian Favourites', games: casinoGames.filter(g => g.category.includes('indian')) },
      { title: 'Trending Games', games: casinoGames.filter(g => g.category.includes('trending')) },
      { title: 'Slots', games: casinoGames.filter(g => g.category.includes('slots')) },
    ];
  }, [activeCategory, filteredGames]);

  return (
    <div className="casino-page container" id="casino-page">
      <PromoBanner promos={promotions.slice(3, 6)} />

      <div className="casino-categories" id="casino-categories">
        <button className="casino-search-btn" aria-label="Search games">
          <FiSearch />
        </button>
        {casinoCategories.map(cat => (
          <button
            key={cat.id}
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
            viewAllLink
            layout={activeCategory !== 'all' ? 'grid' : 'scroll'}
          />
        )
      ))}
    </div>
  );
}
