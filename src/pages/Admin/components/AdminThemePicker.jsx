import React, { useEffect, useRef, useState } from 'react';
import { useAdminTheme } from '../context/AdminThemeContext';

/**
 * Compact admin theme picker — palette presets for Ops chrome.
 */
export default function AdminThemePicker() {
  const { themeId, theme, setThemeId, themes } = useAdminTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
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
  }, [open]);

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

      {open && (
        <div className="admin-theme-picker__menu" role="listbox" aria-label="Admin themes">
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
                  setOpen(false);
                }}
              >
                <span className="admin-theme-picker__swatches" aria-hidden="true">
                  {t.swatches.map((c) => (
                    <span key={`${t.id}-${c}`} className="admin-theme-picker__dot" style={{ background: c }} />
                  ))}
                </span>
                <span className="admin-theme-picker__meta">
                  <span className="admin-theme-picker__name">{t.label}</span>
                  <span className="admin-theme-picker__desc">{t.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
