import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { LogOutIcon } from '../../../icons/animate/index';
import { useAdminTheme } from '../context/AdminThemeContext';

/**
 * Compact avatar menu — jumps to Admin Profile pages + sign out.
 */
export default function AdminProfileMenu({
  activeRole = 'ADMIN',
  onLogout,
  onOpenProfile,
}) {
  const { theme } = useAdminTheme();
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

  const go = (sub) => {
    setOpen(false);
    onOpenProfile?.(sub);
  };

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
        <div className="admin-profile-menu__panel admin-profile-menu__panel--compact" role="dialog" aria-label="Admin profile">
          <div className="admin-profile-menu__head">
            <div className="admin-topbar__avatar admin-profile-menu__avatar" aria-hidden="true">{initial}</div>
            <div className="admin-profile-menu__identity">
              <div className="admin-profile-menu__title">Admin profile</div>
              <div className="admin-profile-menu__role">{activeRole}</div>
              <div className="admin-profile-menu__role">Theme · {theme.label}</div>
            </div>
          </div>

          <div className="admin-profile-menu__links">
            <button type="button" className="admin-profile-menu__link" onClick={() => go('account')}>
              Account
            </button>
            <button type="button" className="admin-profile-menu__link" onClick={() => go('appearance')}>
              Appearance & themes
            </button>
            <button type="button" className="admin-profile-menu__link" onClick={() => go('security')}>
              Security
            </button>
            <button type="button" className="admin-profile-menu__link" onClick={() => go('session')}>
              Session
            </button>
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
