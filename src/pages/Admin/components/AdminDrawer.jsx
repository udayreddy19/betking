import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { createPortal } from 'react-dom';

/**
 * Right-side slide-over drawer with header, scrollable body, and Escape-to-close.
 * Used for Customer 360, bet details, KYC review, etc.
 * Initial focus runs only when the drawer opens — never on each parent re-render.
 */
export default function AdminDrawer({ isOpen, onClose, title, subtitle, width, className, children, actions }) {
  const drawerRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      return undefined;
    }

    const onKey = (e) => {
      if (e.key === 'Escape') onCloseRef.current?.();
    };
    window.addEventListener('keydown', onKey);

    // Focus the drawer shell only on open — not on every parent re-render.
    // Re-focusing after each keystroke steals the caret from reply/note fields.
    const justOpened = !wasOpenRef.current;
    wasOpenRef.current = true;
    let timer;
    if (justOpened) {
      timer = setTimeout(() => {
        const active = document.activeElement;
        const insideDrawer = drawerRef.current?.contains(active);
        if (!insideDrawer || active === document.body) {
          drawerRef.current?.focus();
        }
      }, 80);
    }

    return () => {
      window.removeEventListener('keydown', onKey);
      if (timer) clearTimeout(timer);
    };
  }, [isOpen]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            className="admin-drawer-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Drawer Panel */}
          <motion.div
            ref={drawerRef}
            className={`admin-drawer${className ? ` ${className}` : ''}`}
            role="dialog"
            aria-modal="true"
            aria-label={title || 'Details'}
            tabIndex={-1}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 350 }}
            style={width ? { width: `min(${width}px, 100vw)` } : undefined}
          >
            {/* Header */}
            <div className="admin-drawer__header">
              <div style={{ minWidth: 0, flex: 1 }}>
                <h2 className="admin-drawer__title">{title}</h2>
                {subtitle && (
                  <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--admin-text-muted)' }}>
                    {subtitle}
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                {actions}
                <button
                  type="button"
                  className="admin-btn admin-btn--ghost admin-btn--icon"
                  onClick={onClose}
                  aria-label="Close drawer"
                  style={{ fontSize: '1.1rem' }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="admin-drawer__body">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
