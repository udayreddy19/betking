import SportIcon from '../SportIcon/SportIcon';
import './FilterChips.css';

export default function FilterChips({ items, activeId, onSelect, className = '' }) {
  return (
    <div className={`filter-chips ${className}`}>
      {items.map(item => (
        <button
          type="button"
          key={item.id}
          className={`filter-chip ${activeId === item.id ? 'active' : ''}`}
          onClick={() => onSelect(item.id)}
          id={`chip-${item.id}`}
        >
          <SportIcon sport={item.id} icon={item.icon} className="chip-icon" />
          {item.name}
        </button>
      ))}
    </div>
  );
}
