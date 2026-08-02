import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { FiChevronUp } from '../../icons';
import { useReducedMotion, motionDuration } from '../motion/useReducedMotion';
import './ui.css';

const SCROLL_THRESHOLD = 400;

export default function BackToTop() {
  const [visible, setVisible] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SCROLL_THRESHOLD);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          className="ui-back-to-top"
          onClick={scrollToTop}
          initial={{ opacity: 0, scale: reduced ? 1 : 0.8, y: reduced ? 0 : 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: reduced ? 1 : 0.8, y: reduced ? 0 : 12 }}
          transition={{ duration: motionDuration(reduced, 0.25) }}
          aria-label="Back to top"
        >
          <FiChevronUp size={22} />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
