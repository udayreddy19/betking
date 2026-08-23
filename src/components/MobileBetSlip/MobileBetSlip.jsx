import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useBetSlip } from '../../context/BetSlipContext';
import { useAuth } from '../../context/AuthContext';
import BetSlip from '../BetSlip/BetSlip';
import BetSlipFooter from '../BetSlip/BetSlipFooter';
import { NavBetslipIcon } from '../MobileBottomBar/MobileNavIcons';
import { MIN_STAKE_INR } from '../../utils/wageringRules';
import { springSheet, pressScale } from '../../utils/motionPresets';
import { IoClose } from '../../icons';
import './MobileBetSlip.css';

const QUICK_STAKES = [500, 1500, 5000];

function subscribeDesktopMq(onChange) {
  if (typeof window === 'undefined') return () => {};
  const mq = window.matchMedia('(min-width: 1025px)');
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

function getDesktopMqSnapshot() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(min-width: 1025px)').matches;
}

function useDesktopBetslipLayout() {
  return useSyncExternalStore(subscribeDesktopMq, getDesktopMqSnapshot, () => false);
}

const sheetMotionMobile = {
  initial: { y: '100%' },
  animate: { y: 0 },
  exit: { y: '100%' },
};

const sheetMotionDesktop = {
  initial: { opacity: 0, y: 16, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 12, scale: 0.97 },
};

function QuickBetPanel({
  bet, stake, betCount, isPlacing, placementNotice, onStake, onPlace, onClose, onOpenFull, isDesktop,
}) {
  const stakeNum = parseFloat(stake) || 0;
  const potentialReturn = stakeNum > 0 ? (stakeNum * Number(bet.odds)).toFixed(2) : '0.00';
  const sheetMotion = isDesktop ? sheetMotionDesktop : sheetMotionMobile;

  return (
    <>
      <motion.button
        type="button"
        className="mobile-betslip-backdrop"
        aria-label="Close quick bet"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="mobile-betslip-sheet mobile-betslip-sheet--quick"
        role="dialog"
        aria-label="Quick bet"
        initial={sheetMotion.initial}
        animate={sheetMotion.animate}
        exit={sheetMotion.exit}
        transition={springSheet}
      >
        <div className="mobile-betslip-sheet__handle" aria-hidden="true" />
        <div className="mobile-betslip-sheet__head">
          <div className="mobile-betslip-sheet__head-row">
            <div>
              <strong>{bet.selectionName}</strong>
              <span className="mobile-betslip-quick-odds">• {Number(bet.odds).toFixed(2)}</span>
            </div>
            <button type="button" className="mobile-betslip-sheet__close" onClick={onClose} aria-label="Close">
              <IoClose />
            </button>
          </div>
          <p className="mobile-betslip-sheet__market">{bet.marketName}</p>
        </div>

        {betCount >= 2 && (
          <button type="button" className="mobile-betslip-promo" onClick={onOpenFull}>
            View full betslip ({betCount} selections) →
          </button>
        )}

        <div className="mobile-betslip-quick-stakes">
          {QUICK_STAKES.map((amount) => (
            <button
              key={amount}
              type="button"
              className={`mobile-betslip-quick-stake${String(amount) === String(stake) ? ' is-active' : ''}`}
              onClick={() => onStake(amount)}
            >
              ₹{amount >= 1000 ? `${amount / 1000}K` : amount}
            </button>
          ))}
        </div>

        {placementNotice && (
          <p className="mobile-betslip-notice" role="status">{placementNotice}</p>
        )}

        <button
          type="button"
          className={`mobile-betslip-place-btn${isPlacing ? ' is-placing' : ''}`}
          disabled={stakeNum < MIN_STAKE_INR || isPlacing}
          onClick={onPlace}
        >
          {isPlacing ? 'Placing…' : 'Place bet'}
        </button>
        <p className="mobile-betslip-return-hint">
          Potential return <strong>₹{potentialReturn}</strong>
        </p>
      </motion.div>
    </>
  );
}

function FullBetslipSheet({ onClose, onPlaced, isDesktop }) {
  const sheetMotion = isDesktop ? sheetMotionDesktop : sheetMotionMobile;

  return (
    <>
      <motion.button
        type="button"
        className="mobile-betslip-backdrop"
        aria-label="Close betslip"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="mobile-betslip-sheet mobile-betslip-sheet--full"
        role="dialog"
        aria-label="Betslip"
        aria-modal="true"
        initial={sheetMotion.initial}
        animate={sheetMotion.animate}
        exit={sheetMotion.exit}
        transition={springSheet}
      >
        <div className="mobile-betslip-sheet__handle" aria-hidden="true" />
        <div className="mobile-betslip-sheet__scroll">
          <BetSlip showFooter={false} />
        </div>
        <div className="mobile-betslip-sheet__footer">
          <BetSlipFooter variant="floating" onPlaced={onPlaced} />
        </div>
      </motion.div>
    </>
  );
}

export default function MobileBetSlip() {
  const {
    betCount,
    isMobileOpen,
    setIsMobileOpen,
    quickBet,
    closeQuickBet,
    openQuickBetPanel,
    placeBets,
    setSingleStake,
    singlesStakes,
  } = useBetSlip();
  const { isLoggedIn, openLoginModal, showToast, dismissToast } = useAuth();
  const isDesktop = useDesktopBetslipLayout();
  const [isPlacing, setIsPlacing] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const [placementNotice, setPlacementNotice] = useState(null);
  const prevBetCountRef = useRef(betCount);

  const bet = quickBet?.bet;
  const stake = bet ? (singlesStakes[bet.id] || quickBet.defaultStake || '500') : '';

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
    if (!bet) return undefined;
    setSingleStake(bet.id, stake);
    return undefined;
  }, [bet?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isMobileOpen || quickBet) {
      dismissToast?.();
    }
  }, [isMobileOpen, quickBet, dismissToast]);

  useEffect(() => {
    if (!isMobileOpen && !quickBet) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') {
        if (quickBet) closeQuickBet();
        else setIsMobileOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isMobileOpen, quickBet, closeQuickBet, setIsMobileOpen]);

  const handleQuickPlace = async () => {
    if (isPlacing || !bet) return;
    if (!isLoggedIn) {
      showToast('Please log in to place a bet.', 'info');
      openLoginModal();
      return;
    }
    const stakeNum = parseFloat(stake) || 0;
    if (stakeNum < MIN_STAKE_INR) {
      showToast(`Minimum stake is ₹${MIN_STAKE_INR}.`, 'error');
      return;
    }
    setIsPlacing(true);
    setPlacementNotice(null);
    try {
      const result = await placeBets({ stakeSource: 'cash', singleBetId: bet.id });
      if (result.success) {
        closeQuickBet();
        showToast('Bet placed!', 'success');
      } else if (result.oddsUpdated || result.requiresAcceptance) {
        const msg = result.error || 'The odds have changed. Please review the new odds.';
        setPlacementNotice(msg);
        showToast(msg, 'info');
      } else {
        showToast(result.error || 'Could not place bet.', 'error');
      }
    } finally {
      setIsPlacing(false);
    }
  };

  const openFullFromQuick = () => {
    closeQuickBet();
    setIsMobileOpen(true);
  };

  const handleFabClick = () => {
    if (quickBet) return;
    openQuickBetPanel();
  };

  if (betCount === 0 && !quickBet) return null;

  const showFab = betCount > 0 && !quickBet;

  return (
    <div className="mobile-betslip-root" aria-live="polite">
      <AnimatePresence>
        {quickBet && bet && (
          <QuickBetPanel
            bet={bet}
            stake={stake}
            betCount={betCount}
            isPlacing={isPlacing}
            placementNotice={placementNotice}
            onStake={(amount) => setSingleStake(bet.id, String(amount))}
            onPlace={handleQuickPlace}
            onClose={closeQuickBet}
            onOpenFull={openFullFromQuick}
            isDesktop={isDesktop}
          />
        )}
        {isMobileOpen && betCount > 0 && (
          <FullBetslipSheet
            onClose={() => setIsMobileOpen(false)}
            onPlaced={() => setIsMobileOpen(false)}
            isDesktop={isDesktop}
          />
        )}
      </AnimatePresence>

      {showFab && (
        <motion.button
          type="button"
          className={`mobile-betslip-fab${justAdded ? ' is-new' : ''}`}
          onClick={handleFabClick}
          aria-label={`Open betslip, ${betCount} selections`}
          whileTap={{ scale: pressScale }}
          transition={springSheet}
        >
          <NavBetslipIcon className="mobile-betslip-fab-icon" />
          <span className="mobile-betslip-fab-badge">{betCount}</span>
        </motion.button>
      )}
    </div>
  );
}
