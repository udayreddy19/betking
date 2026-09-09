import React, { useEffect, useRef, useState } from 'react';
import { useAdminTheme } from '../context/AdminThemeContext';

/**
 * Admin theme picker.
 * - default: compact topbar/login dropdown
 * - variant="inline": list only (for profile panel)
 */
export default function AdminThemePicker({ variant = 'dropdown' }) {
  const { themeId, theme, setThemeId, themes } = useAdminTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const inline = variant === 'inline';

  useEffect(() => {
    if (inline || !open) return undefined;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, inline]);

  const list = (
    <div
      className={inline ? 'admin-theme-picker__list' : 'admin-theme-picker__menu'}
      role="listbox"
      aria-label="Admin themes"
    >
      {themes.map((t) => {
        const active = t.id === themeId;
        return (
          <button
            key={t.id}
            type="button"
            role="option"
            aria-selected={active}
            className={`admin-theme-picker__option${active ? ' is-active' : ''}`}
            onClick={() => {
              setThemeId(t.id);
              if (!inline) setOpen(false);
            }}
          >
            <span className="admin-theme-picker__swatches" aria-hidden="true">
              {t.swatches.map((c) => (
                <span key={`${t.id}-${c}`} className="admin-theme-picker__dot" style={{ background: c }} />
              ))}
            </span>
            <span className="admin-theme-picker__meta">
              <span className="admin-theme-picker__name">
                {t.label}
                <span className="admin-theme-picker__mode-tag">
                  {t.mode}
                </span>
              </span>
              <span className="admin-theme-picker__desc">{t.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );

  if (inline) {
    return <div className="admin-theme-picker admin-theme-picker--inline">{list}</div>;
  }

  return (
    <div className="admin-theme-picker" ref={rootRef}>
      <button
        type="button"
        className={`admin-theme-picker__btn${open ? ' is-open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={`Theme: ${theme.label}`}
      >
        <span className="admin-theme-picker__swatches" aria-hidden="true">
          {theme.swatches.slice(0, 3).map((c) => (
            <span key={c} className="admin-theme-picker__dot" style={{ background: c }} />
          ))}
        </span>
        <span className="admin-theme-picker__label">{theme.label}</span>
      </button>
      {open ? list : null}
    </div>
  );
}
