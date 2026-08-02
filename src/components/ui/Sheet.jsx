import { AnimatePresence, motion } from 'motion/react';
import { useReducedMotion, motionDuration } from '../motion/useReducedMotion';
import './ui.css';

export default function Sheet({
  isOpen,
  onClose,
  children,
  position = 'center',
  className = '',
}) {
  const reduced = useReducedMotion();

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="ui-sheet-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: motionDuration(reduced, 0.2) }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            className={`ui-sheet-panel ui-sheet-panel--${position} ${className}`.trim()}
            initial={position === 'bottom'
              ? { y: reduced ? 0 : '100%' }
              : { opacity: 0, scale: reduced ? 1 : 0.95 }}
            animate={position === 'bottom' ? { y: 0 } : { opacity: 1, scale: 1 }}
            exit={position === 'bottom'
              ? { y: reduced ? 0 : '100%' }
              : { opacity: 0, scale: reduced ? 1 : 0.95 }}
            transition={{ duration: motionDuration(reduced, 0.3), ease: [0.32, 0.72, 0, 1] }}
            role="dialog"
            aria-modal="true"
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
