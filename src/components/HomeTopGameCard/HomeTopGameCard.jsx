import { IoInformationCircle } from 'react-icons/io5';
import { useCasino } from '../../context/CasinoContext';
import './HomeTopGameCard.css';

export default function HomeTopGameCard({ game }) {
  const { openGame } = useCasino();

  return (
    <button
      type="button"
      className="home-top-game-card"
      style={{ background: game.gradient }}
      onClick={() => openGame(game)}
      aria-label={`Play ${game.name}`}
    >
      {game.image && (
        <img className="home-top-game-card__img" src={game.image} alt="" loading="lazy" />
      )}
      <span className="home-top-game-card__icon" aria-hidden="true">{game.icon}</span>
      <span className="home-top-game-card__title">{game.name}</span>
      <span className="home-top-game-card__provider">{game.provider}</span>
      <span
        className="home-top-game-card__info"
        onClick={(e) => { e.stopPropagation(); openGame(game); }}
        aria-hidden="true"
      >
        <IoInformationCircle />
      </span>
    </button>
  );
}
