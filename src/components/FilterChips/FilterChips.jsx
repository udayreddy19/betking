import { useEffect, useState, memo } from 'react';
import SportIcon from '../SportIcon/SportIcon';
import './FilterChips.css';

function FilterChips({ items, activeId, onSelect, className = '' }) {
  const [iconsReady, setIconsReady] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setIconsReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className={`filter-chips ${className}`}>
      {items.map((item) => (
        <button
          type="button"
          key={item.id}
          className={`filter-chip ${activeId === item.id ? 'active' : ''}`}
          onClick={() => onSelect(item.id)}
          id={`chip-${item.id}`}
        >
          {iconsReady ? (
            <SportIcon sport={item.id} icon={item.icon} className="chip-icon" />
          ) : (
            <span className="chip-icon chip-icon--placeholder" aria-hidden />
          )}
          {item.name}
        </button>
      ))}
    </div>
  );
}

export default memo(FilterChips);
