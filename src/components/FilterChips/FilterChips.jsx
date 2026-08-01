import './FilterChips.css';

export default function FilterChips({ items, activeId, onSelect, className = '' }) {
  return (
    <div className={`filter-chips ${className}`}>
      {items.map(item => (
        <button
          key={item.id}
          className={`filter-chip ${activeId === item.id ? 'active' : ''}`}
          onClick={() => onSelect(item.id)}
          id={`chip-${item.id}`}
        >
          {item.icon && <span className="chip-icon">{item.icon}</span>}
          {item.name}
        </button>
      ))}
    </div>
  );
}
