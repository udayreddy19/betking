import { useEffect, useState } from 'react';
import SportIcon from '../SportIcon/SportIcon';
import './FilterChips.css';

export default function FilterChips({ items, activeId, onSelect, className = '', counts = {} }) {
  const [iconsReady, setIconsReady] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setIconsReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className={`filter-chips ${className}`}>
      {items.map((item) => {
        const count = item.count ?? counts[item.id] ?? 0;
        return (
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
            <span className="chip-label-text">{item.name}</span>
            {count > 0 && (
              <span className="chip-count-badge">
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
