import { IoInformationCircle } from '../../icons';
import { useCasino } from '../../context/CasinoContext';
import './HomeLiveGameCard.css';

export default function HomeLiveGameCard({ game, displayName, image, gradient }) {
  const { openGame } = useCasino();
  const title = displayName || game.name;

  return (
    <button
      type="button"
      className="home-live-game-card"
      style={{ background: gradient || game.gradient }}
      onClick={() => openGame(game)}
      aria-label={`Play ${title}`}
    >
      <img
        className="home-live-game-card__img"
        src={image || game.image}
        alt=""
        loading="lazy"
      />
      <div className="home-live-game-card__overlay" />
      <span className="home-live-game-card__title">{title}</span>
      <span
        className="home-live-game-card__info"
        onClick={(e) => { e.stopPropagation(); openGame(game); }}
        aria-hidden="true"
      >
        <IoInformationCircle />
      </span>
    </button>
  );
}
