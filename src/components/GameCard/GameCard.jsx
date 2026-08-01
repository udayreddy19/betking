import { IoInformationCircle } from 'react-icons/io5';
import { FiPlay } from 'react-icons/fi';
import './GameCard.css';

export default function GameCard({ game }) {
  return (
    <div className="game-card" id={`game-${game.id}`} style={{ background: game.gradient }}>
      <div className="game-card-bg">
        {game.name}
      </div>
      <div className="game-card-info">
        <IoInformationCircle />
      </div>
      <div className="game-card-play">
        <FiPlay />
      </div>
      <div className="game-card-overlay">
        <div className="game-card-provider">{game.provider}</div>
      </div>
    </div>
  );
}
