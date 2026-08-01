import { useNavigate } from 'react-router-dom';
import { heroCategories } from '../../data/mockData';
import './CategoryGrid.css';

const routes = {
  sports: '/sports',
  'live-casino': '/live-casino',
  instant: '/casino',
  vip: '/promotions',
  promos: '/promotions',
  loyalty: '/promotions',
};

export default function CategoryGrid() {
  const navigate = useNavigate();

  return (
    <div className="category-grid" id="category-grid">
      {heroCategories.map(cat => (
        <div
          key={cat.id}
          className="category-card"
          style={{ background: cat.color }}
          onClick={() => navigate(routes[cat.id] || '/')}
        >
          <h3>{cat.name}</h3>
          <p>{cat.description}</p>
          <span className="category-card-icon">{cat.image}</span>
        </div>
      ))}
    </div>
  );
}
