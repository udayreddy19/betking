import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { createPortal } from 'react-dom';

/**
 * Generic modal overlay with focus trapping, Escape-to-close, and backdrop click dismiss.
 */
export default function AdminModal({ isOpen, onClose, title, description, children, maxWidth, className = '' }) {
  const modalRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const timer = setTimeout(() => modalRef.current?.focus(), 80);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(timer);
    };
  }, [isOpen, onClose]);

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
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            ref={modalRef}
            className={`admin-modal ${className}`}
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
            {(title || description) && (
              <div className="admin-modal__header">
                {title && <h3 className="admin-modal__title">{title}</h3>}
                {description && <p className="admin-modal__description">{description}</p>}
              </div>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
