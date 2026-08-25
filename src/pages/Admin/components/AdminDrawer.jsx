import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { createPortal } from 'react-dom';

/**
 * Right-side slide-over drawer with header, scrollable body, and Escape-to-close.
 * Used for Customer 360, bet details, KYC review, etc.
 */
export default function AdminDrawer({ isOpen, onClose, title, subtitle, width, children, actions }) {
  const drawerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    // Trap focus inside drawer
    const timer = setTimeout(() => drawerRef.current?.focus(), 80);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(timer);
    };
  }, [isOpen, onClose]);

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
            className="admin-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={title || 'Details'}
            tabIndex={-1}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 350 }}
            style={width ? { width: `min(${width}px, 90vw)` } : undefined}
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
