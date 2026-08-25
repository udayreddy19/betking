import React from 'react';

/**
 * Horizontal filter bar with slots for selects, inputs, and action buttons.
 */
export default function AdminFilterBar({ children, label, className = '', style }) {
  return (
    <div className={`admin-filter-bar ${className}`} style={style} role="toolbar" aria-label={label || 'Filters'}>
      {label && <span className="admin-filter-bar__label">{label}</span>}
      {children}
    </div>
  );
}

/**
 * Pre-built select dropdown for filter bars.
 */
export function FilterSelect({ value, onChange, options = [], placeholder, style, className = '' }) {
  return (
    <select
      className={`admin-select ${className}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ minWidth: '140px', ...style }}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((opt) => {
        const val = typeof opt === 'string' ? opt : opt.value;
        const label = typeof opt === 'string' ? opt : opt.label;
        return <option key={val} value={val}>{label}</option>;
      })}
    </select>
  );
}

/**
 * Pre-built search input for filter bars.
 */
export function FilterSearch({ value, onChange, placeholder = 'Search...', style, className = '' }) {
  return (
    <input
      type="search"
      className={`admin-input ${className}`}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ minWidth: '180px', ...style }}
    />
  );
}
