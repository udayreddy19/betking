import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiChevronLeft, FiChevronRight } from '../../icons';
import GameCard from '../GameCard/GameCard';
import './GameCarousel.css';

export default function GameCarousel({ title, games, viewAllLink, viewAllPath = '/casino', layout = 'scroll' }) {
  const scrollRef = useRef(null);
  const navigate = useNavigate();
  const displayGames = games || [];

  if (displayGames.length === 0) {
    return null;
  }

  const scroll = (direction) => {
    if (scrollRef.current) {
      const amount = direction === 'left' ? -300 : 300;
      scrollRef.current.scrollBy({ left: amount, behavior: 'smooth' });
    }
  };

  return (
    <div className="game-carousel" id={`carousel-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="game-carousel-header">
        <h2>{title}</h2>
        <div className="game-carousel-actions">
          {viewAllLink && (
            <button type="button" className="carousel-view-all" onClick={() => navigate(viewAllPath)}>
              All <FiChevronRight />
            </button>
          )}
          {layout === 'scroll' && (
            <>
              <button className="carousel-nav-btn" onClick={() => scroll('left')}>
                <FiChevronLeft />
              </button>
              <button className="carousel-nav-btn" onClick={() => scroll('right')}>
                <FiChevronRight />
              </button>
            </>
          )}
        </div>
      </div>
      {layout === 'scroll' ? (
        <div className="game-carousel-scroll" ref={scrollRef}>
          {displayGames.map(game => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      ) : (
        <div className="game-grid">
          {displayGames.map(game => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      )}
    </div>
  );
}
