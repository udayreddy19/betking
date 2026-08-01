import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FiSearch } from 'react-icons/fi';
import PromoBanner from '../../components/PromoBanner/PromoBanner';
import GameCarousel from '../../components/GameCarousel/GameCarousel';
import { casinoGames, casinoCategories, promotions } from '../../data/mockData';
import './Casino.css';

export default function Casino() {
  const [searchParams] = useSearchParams();
  const initialCategory = searchParams.get('cat') || 'all';
  const [activeCategory, setActiveCategory] = useState(initialCategory);

  useEffect(() => {
    const cat = searchParams.get('cat');
    if (cat) setActiveCategory(cat);
  }, [searchParams]);

  const filteredGames = useMemo(() => {
    if (activeCategory === 'all') return casinoGames;
    return casinoGames.filter(g => g.category.split(' ').includes(activeCategory));
  }, [activeCategory]);

  // Group games by category for "all" view
  const gameGroups = useMemo(() => {
    if (activeCategory !== 'all') {
      return [{ title: casinoCategories.find(c => c.id === activeCategory)?.name || 'Games', games: filteredGames }];
    }
    return [
      { title: 'Top Games', games: casinoGames.filter(g => g.category.split(' ').includes('top-slots')) },
      { title: 'Crash Games', games: casinoGames.filter(g => g.category.split(' ').includes('crash-games')) },
      { title: 'Slots', games: casinoGames.filter(g => g.category.split(' ').includes('slots')) },
      { title: 'Live Casino', games: casinoGames.filter(g => g.category.split(' ').includes('live-casino')) },
      { title: 'Table Games', games: casinoGames.filter(g => g.category.split(' ').includes('table-games')) },
    ];
  }, [activeCategory, filteredGames]);

  return (
    <div className="casino-page container" id="casino-page">
      <PromoBanner promos={promotions} />

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
