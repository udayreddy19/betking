import { IoInformationCircle } from 'react-icons/io5';
import { FiPlay } from 'react-icons/fi';
import './GameCard.css';

export default function GameCard({ game }) {
  return (
    <div
      className={`game-card ${game.isLive ? 'game-card--live' : ''}`}
      id={`game-${game.id}`}
      style={{ background: game.gradient }}
    >
      {game.image && (
        <img className="game-card-image" src={game.image} alt="" loading="lazy" />
      )}

      <div className="game-card-badges">
        {game.isLive && <span className="game-card-badge game-card-badge--live">LIVE</span>}
        {game.isHot && <span className="game-card-badge game-card-badge--hot">HOT</span>}
        {game.isNew && <span className="game-card-badge game-card-badge--new">NEW</span>}
      </div>

      <div className="game-card-bg">
        {game.icon && <span className="game-card-icon" aria-hidden="true">{game.icon}</span>}
        <span className="game-card-title">{game.name}</span>
      </div>

      <div className="game-card-info" aria-label={`${game.name} info`}>
        <IoInformationCircle />
      </div>

      <div className="game-card-play" aria-hidden="true">
        <FiPlay />
      </div>

      <div className="game-card-overlay">
        <div className="game-card-name">{game.name}</div>
        <div className="game-card-provider">{game.provider}</div>
        {game.isLive && game.players != null && (
          <div className="game-card-players">{game.players.toLocaleString()} playing</div>
        )}
        {game.minBet && (
          <div className="game-card-min-bet">Min {game.minBet}</div>
        )}
      </div>
    </div>
  );
}
