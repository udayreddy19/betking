import { useNavigate } from 'react';
import { heroCategories } from '../../data/mockData';
import './CategoryGrid.css';

export default function CategoryGrid() {
  const navigate = useNavigate();

  return (
    <div className="category-grid" id="category-grid" style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
      gap: '16px',
      margin: '24px 0'
    }}>
      {heroCategories.map(cat => (
        <div
          key={cat.id}
          className="category-card"
          style={{
            background: cat.bgGradient || 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            border: `1.5px solid ${cat.borderColor || '#3b82f6'}`,
            borderRadius: '16px',
            padding: '20px',
            color: '#ffffff',
            cursor: 'pointer',
            position: 'relative',
            overflow: 'hidden',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease'
          }}
          onClick={() => navigate(cat.link || '/')}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <span style={{ fontSize: '2.5rem' }}>{cat.icon}</span>
            <span style={{
              background: 'rgba(255, 255, 255, 0.15)',
              color: '#ffffff',
              padding: '4px 10px',
              borderRadius: '20px',
              fontSize: '0.65rem',
              fontWeight: 800,
              letterSpacing: '0.5px'
            }}>{cat.badge}</span>
          </div>

          <h3 style={{
            fontSize: '1.2rem',
            fontWeight: 900,
            color: '#ffffff',
            margin: '0 0 6px 0',
            letterSpacing: '-0.3px'
          }}>{cat.name}</h3>

          <p style={{
            fontSize: '0.8rem',
            color: '#cbd5e1',
            margin: 0,
            lineHeight: 1.4
          }}>{cat.description}</p>
        </div>
      ))}
    </div>
  );
}
