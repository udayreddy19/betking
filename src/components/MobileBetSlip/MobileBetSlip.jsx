import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useBetSlip } from '../../context/BetSlipContext';
import BetSlip from '../BetSlip/BetSlip';
import BetSlipFooter from '../BetSlip/BetSlipFooter';
import { NavBetslipIcon } from '../MobileBottomBar/MobileNavIcons';
import { IoClose } from '../../icons';
import { pressScale, springSheet } from '../../utils/motionPresets';
import './MobileBetSlip.css';

export default function MobileBetSlip() {
  const { betCount, isMobileOpen, setIsMobileOpen } = useBetSlip();
  const panelRef = useRef(null);
  const [justAdded, setJustAdded] = useState(false);
  const prevBetCountRef = useRef(betCount);

  const toggleOpen = () => setIsMobileOpen((open) => !open);

  useEffect(() => {
    if (betCount > prevBetCountRef.current) {
      setJustAdded(true);
      const timer = window.setTimeout(() => setJustAdded(false), 900);
      prevBetCountRef.current = betCount;
      return () => window.clearTimeout(timer);
    }
    prevBetCountRef.current = betCount;
    return undefined;
  }, [betCount]);

  useEffect(() => {
    if (!isMobileOpen) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setIsMobileOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isMobileOpen, setIsMobileOpen]);

  useEffect(() => {
    if (!isMobileOpen) return undefined;
    const onPointerDown = (event) => {
      if (panelRef.current?.contains(event.target)) return;
      if (event.target.closest('.floating-betslip-fab')) return;
      setIsMobileOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isMobileOpen, setIsMobileOpen]);

  if (betCount === 0) return null;

  return (
    <div className="floating-betslip-root" aria-live="polite">
      <AnimatePresence>
        {isMobileOpen && (
          <>
            <motion.button
              type="button"
              className="floating-betslip-backdrop"
              aria-label="Close betslip"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setIsMobileOpen(false)}
            />
            <motion.div
              ref={panelRef}
              className="floating-betslip-panel"
              role="dialog"
              aria-label="Betslip"
              aria-modal="true"
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={springSheet}
            >
              <button
                type="button"
                className="floating-betslip-close"
                onClick={() => setIsMobileOpen(false)}
                aria-label="Close betslip"
              >
                <IoClose />
              </button>
              <div className="floating-betslip-main">
                <BetSlip showFooter={false} hidePerBetStakes />
              </div>
              <div className="floating-betslip-cta">
                <BetSlipFooter variant="floating" onPlaced={() => setIsMobileOpen(false)} />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        className={`floating-betslip-fab ${isMobileOpen ? 'is-open' : ''} ${justAdded ? 'is-new' : ''}`}
        onClick={toggleOpen}
        aria-label={isMobileOpen ? 'Close betslip' : `Open betslip, ${betCount} selections`}
        aria-expanded={isMobileOpen}
        whileTap={{ scale: pressScale }}
        transition={springSheet}
      >
        <NavBetslipIcon className="floating-betslip-fab-icon" />
        <span className="floating-betslip-badge">{betCount}</span>
      </motion.button>
    </div>
  );
}
