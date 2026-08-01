import { useState, useMemo } from 'react';
import { FiSearch } from 'react-icons/fi';
import GameCarousel from '../../components/GameCarousel/GameCarousel';
import { liveCasinoGames, liveCasinoCategories } from '../../data/mockData';
import { filterLiveCasinoByType } from '../../data/casinoGamesData';
import './LiveCasino.css';

export default function LiveCasino() {
  const [activeCategory, setActiveCategory] = useState('all');

  const filteredGames = useMemo(
    () => filterLiveCasinoByType(liveCasinoGames, activeCategory),
    [activeCategory]
  );

  const gameGroups = useMemo(() => {
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
  }, [activeCategory, filteredGames]);

  return (
    <div className="live-casino-page container" id="live-casino-page">
      <div className="live-casino-hero">
        <h1>Live Casino</h1>
        <p>Real dealers, HD streams, and tables open 24/7 — from ₹10 minimum bets.</p>
      </div>

      <div className="live-casino-categories scroll-row-bleed" id="lc-categories">
        <button className="lc-search-btn" aria-label="Search games">
          <FiSearch />
        </button>
        {liveCasinoCategories.map(cat => (
          <button
            key={cat.id}
            type="button"
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
            viewAllLink={activeCategory === 'all'}
            viewAllPath="/live-casino"
            layout={activeCategory !== 'all' ? 'grid' : 'scroll'}
          />
        )
      ))}
    </div>
  );
}
