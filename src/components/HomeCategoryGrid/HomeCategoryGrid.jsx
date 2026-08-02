import { useNavigate } from 'react-router-dom';
import { homeCategoryTiles } from '../../data/homePageData';
import './HomeCategoryGrid.css';

export default function HomeCategoryGrid() {
  const navigate = useNavigate();

  return (
    <section className="home-category-grid" id="home-category-grid" aria-label="Quick links">
      {homeCategoryTiles.map((tile) => (
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
            <img className="home-cat-image" src={tile.image} alt="" loading="lazy" />
          )}
        </button>
      ))}
    </section>
  );
}
