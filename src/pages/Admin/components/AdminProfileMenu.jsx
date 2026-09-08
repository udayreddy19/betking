import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { LogOutIcon } from '../../../icons/animate/index';
import ThemeToggle from '../../../components/ThemeToggle/ThemeToggle';
import AdminThemePicker from './AdminThemePicker';
import { useAdminTheme } from '../context/AdminThemeContext';

/**
 * Admin profile menu — avatar opens appearance (themes) + sign out.
 */
export default function AdminProfileMenu({
  activeRole = 'ADMIN',
  onLogout,
}) {
  const { theme, themeId } = useAdminTheme();
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

  const initial = String(activeRole || 'A').replace(/[^A-Z]/g, '').slice(0, 1) || 'A';

  return (
    <div className="admin-profile-menu" ref={rootRef}>
      <button
        type="button"
        className={`admin-profile-menu__trigger${open ? ' is-open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Admin profile"
      >
        <span className="admin-topbar__avatar" aria-hidden="true">{initial}</span>
      </button>

      {open && (
        <div className="admin-profile-menu__panel" role="dialog" aria-label="Admin profile">
          <div className="admin-profile-menu__head">
            <div className="admin-topbar__avatar admin-profile-menu__avatar" aria-hidden="true">{initial}</div>
            <div className="admin-profile-menu__identity">
              <div className="admin-profile-menu__title">Admin profile</div>
              <div className="admin-profile-menu__role">{activeRole}</div>
            </div>
          </div>

          <div className="admin-profile-menu__section">
            <div className="admin-profile-menu__section-label">Appearance</div>
            <p className="admin-profile-menu__hint">
              Current theme: <strong>{theme.label}</strong>
            </p>
            <AdminThemePicker variant="inline" />
            {themeId === 'match' && (
              <div className="admin-profile-menu__site-theme">
                <span>Site light / dark</span>
                <ThemeToggle />
              </div>
            )}
          </div>

          <div className="admin-profile-menu__footer">
            <motion.button
              type="button"
              className="admin-btn admin-btn--ghost admin-profile-menu__logout"
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                setOpen(false);
                onLogout?.();
              }}
            >
              <LogOutIcon size={14} />
              Sign out
            </motion.button>
          </div>
        </div>
      )}
    </div>
  );
}
