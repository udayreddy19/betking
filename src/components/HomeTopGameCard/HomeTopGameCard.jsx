import { IoInformationCircle } from '../../icons';
import { useCasino } from '../../context/CasinoContext';
import './HomeTopGameCard.css';

export default function HomeTopGameCard({ game, displayName, provider, image, gradient }) {
  const { openGame } = useCasino();
  const title = displayName || game.name;
  const providerName = provider || game.provider;

  return (
    <button
      type="button"
      className="home-top-game-card"
      style={{ background: gradient || game.gradient }}
      onClick={() => openGame(game)}
      aria-label={`Play ${title}`}
    >
      {image && (
        <img className="home-top-game-card__img" src={image} alt="" loading="lazy" />
      )}
      <div className="home-top-game-card__overlay" />
      <span className="home-top-game-card__title">{title}</span>
      <span className="home-top-game-card__provider">{providerName}</span>
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
