import { useNavigate } from 'react-router-dom';
import { homeCategoryTiles } from '../../data/homePageData';
import { CASINO_ENABLED } from '../../utils/featureFlags';
import './HomeCategoryGrid.css';

const TILE_IMAGE_FALLBACK = 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?auto=format&fit=crop&w=600&q=80';

export default function HomeCategoryGrid() {
  const navigate = useNavigate();
  const tiles = CASINO_ENABLED
    ? homeCategoryTiles
    : homeCategoryTiles.filter((tile) => tile.id !== 'casino');

  return (
    <section className="home-category-grid" id="home-category-grid" aria-label="Quick links">
      {tiles.map((tile) => (
        <button
          key={tile.id}
          type="button"
          className={`home-cat-tile home-cat-tile--${tile.size}`}
          style={{ background: tile.bg }}
          onClick={() => navigate(tile.link)}
        >
          {tile.badge != null && (
            <span className="home-cat-badge">{tile.badge}</span>
          )}
          <span className="home-cat-label">{tile.label}</span>
          {tile.image && (
            <img
              className="home-cat-image"
              src={tile.image}
              alt=""
              loading="lazy"
              decoding="async"
              onError={(e) => {
                const img = e.currentTarget;
                if (img.dataset.fallback !== '1') {
                  img.dataset.fallback = '1';
                  img.src = TILE_IMAGE_FALLBACK;
                } else {
                  img.style.display = 'none';
                }
              }}
            />
          )}
        </button>
      ))}
    </section>
  );
}
