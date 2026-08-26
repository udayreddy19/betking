import { useNavigate } from 'react-router-dom';
import { homeCategoryTiles } from '../../data/homePageData';
import { CASINO_ENABLED } from '../../utils/featureFlags';
import {
  NavLiveIcon,
  NavPromotionsIcon,
} from '../MobileBottomBar/MobileNavIcons';
import SportIcon from '../SportIcon/SportIcon';
import './HomeCategoryGrid.css';

const TILE_IMAGE_FALLBACK = 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?auto=format&fit=crop&w=600&q=80';

export default function HomeCategoryGrid({ liveCount = 0 }) {
  const navigate = useNavigate();
  const tiles = CASINO_ENABLED
    ? homeCategoryTiles
    : homeCategoryTiles.filter((tile) => tile.id !== 'casino');

  const shortcuts = [
    { id: 'in-play', label: 'In-play', link: '/live-betting', Icon: NavLiveIcon, count: liveCount },
    { id: 'cricket', label: 'Cricket', link: '/sports?sport=cricket', iconSport: 'cricket' },
    { id: 'soccer', label: 'Soccer', link: '/sports?sport=soccer', iconSport: 'soccer' },
    { id: 'promos', label: 'Promos', link: '/promotions', Icon: NavPromotionsIcon },
  ];

  return (
    <>
      <nav className="home-quick-links" aria-label="Quick links">
        {shortcuts.map((item) => {
          const Icon = item.Icon;
          return (
            <button
              key={item.id}
              type="button"
              className="home-quick-link"
              onClick={() => navigate(item.link)}
            >
              <span className="home-quick-link-icon">
                {Icon ? <Icon /> : <SportIcon sport={item.iconSport} />}
                {item.count > 0 && (
                  <span className="home-quick-link-count">{item.count}</span>
                )}
              </span>
              <span className="home-quick-link-label">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <section className="home-category-grid" id="home-category-grid" aria-label="Browse">
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
    </>
  );
}
