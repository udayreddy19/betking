import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { createPortal } from 'react-dom';

/**
 * Generic modal overlay with Escape-to-close and backdrop click dismiss.
 * Supports optional subtitle + sticky footer actions (Save / Cancel).
 * Initial focus runs only when the modal opens — never on each parent re-render.
 */
export default function AdminModal({
  isOpen,
  onClose,
  title,
  subtitle,
  description,
  children,
  actions,
  maxWidth,
  className = '',
}) {
  const modalRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const wasOpenRef = useRef(false);
  const desc = description || subtitle || '';

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

    // Focus dialog shell only on open transition, not on every parent re-render
    // (re-focusing steals caret from inputs after each keystroke).
    const justOpened = !wasOpenRef.current;
    wasOpenRef.current = true;
    let timer;
    if (justOpened) {
      timer = setTimeout(() => {
        const active = document.activeElement;
        const insideModal = modalRef.current?.contains(active);
        if (!insideModal || active === document.body) {
          modalRef.current?.focus();
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
        <motion.div
          className="admin-modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={(e) => { if (e.target === e.currentTarget) onCloseRef.current?.(); }}
        >
          <motion.div
            ref={modalRef}
            className={`admin-modal ${actions ? 'admin-modal--with-actions' : ''} ${className}`}
            role="dialog"
            aria-modal="true"
            aria-label={title || 'Dialog'}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            style={maxWidth ? { maxWidth } : undefined}
            onClick={(e) => e.stopPropagation()}
          >
            {(title || desc) && (
              <div className="admin-modal__header">
                {title && <h3 className="admin-modal__title">{title}</h3>}
                {desc && <p className="admin-modal__description">{desc}</p>}
              </div>
            )}
            <div className="admin-modal__body">
              {children}
            </div>
            {actions ? (
              <div className="admin-modal__actions">
                {actions}
              </div>
            ) : null}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
