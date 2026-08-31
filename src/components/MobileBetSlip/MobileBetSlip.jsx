import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useLocation } from 'react-router-dom';
import { useBetSlip } from '../../context/BetSlipContext';
import { ODDS_STATUS } from '../../utils/oddsChangeHandler';
import { useAuth } from '../../context/AuthContext';
import BetSlip from '../BetSlip/BetSlip';
import BetSlipFooter from '../BetSlip/BetSlipFooter';
import { NavBetslipIcon } from '../MobileBottomBar/MobileNavIcons';
import { getWalletBreakdown, formatInr } from '../../utils/walletBalance';
import {
  BONUS_MIN_BET_ODDS,
  MIN_STAKE_INR,
  QUICK_STAKE_PRESETS,
  sanitizeStakeInput,
  canBetWithBonusOnLegs,
} from '../../utils/wageringRules';
import { springSheet, pressScale } from '../../utils/motionPresets';
import { IoClose } from '../../icons';
import '../BetSlip/BetSlipFooter.css';
import './MobileBetSlip.css';

const QUICK_STAKES = QUICK_STAKE_PRESETS;

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
  bet,
  stake,
  betCount,
  isPlacing,
  placementNotice,
  onStake,
  onPlace,
  onClose,
  onRemove,
  onClearAll,
  onOpenFull,
  onAcceptOdds,
  isDesktop,
}) {
  const { user } = useAuth();
  const {
    fundingSource,
    activeFundingSource,
    selectFundingSource,
    isPromoLocked,
    promoAmount,
  } = useBetSlip();

  const wallet = getWalletBreakdown(user);
  const bonusAvailable = wallet.bonus;
  const freebetAvailable = wallet.freebets;
  const canUseBonus = bonusAvailable > 0 && canBetWithBonusOnLegs([bet]);
  const canUseFreebet = freebetAvailable > 0;
  const activeSource = activeFundingSource;

  const stakeNum = isPromoLocked ? promoAmount : (parseFloat(stake) || 0);
  const odds = Number(bet.odds) || 0;
  const potentialReturn = stakeNum > 0 && odds > 0
    ? (activeSource === 'freebet'
      ? Math.max(0, stakeNum * (odds - 1))
      : stakeNum * odds).toFixed(2)
    : '0.00';
  const showStakeSource = bonusAvailable > 0 || freebetAvailable > 0;
  const sheetMotion = isDesktop ? sheetMotionDesktop : sheetMotionMobile;
  const oldOdds = Number(bet.previousOdds ?? bet.oldOdds);
  const newOdds = Number(bet.odds);
  const oddsChanged = bet.oddsStatus === ODDS_STATUS.CHANGED;
  const showStrike = oddsChanged && Number.isFinite(oldOdds);
  const noticeText = oddsChanged
    ? 'Odds have changed.'
    : placementNotice;

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
              <strong>{bet.selectionName || bet.selection}</strong>
              <span className="mobile-betslip-quick-odds">
                •
                {showStrike ? (
                  <>
                    <span className="mobile-betslip-quick-odds-old">{oldOdds.toFixed(2)}</span>
                    <span className="mobile-betslip-quick-odds-new">{Number.isFinite(newOdds) ? newOdds.toFixed(2) : ''}</span>
                  </>
                ) : (
                  <span>{Number.isFinite(newOdds) ? newOdds.toFixed(2) : ''}</span>
                )}
              </span>
            </div>
            <button type="button" className="mobile-betslip-sheet__close" onClick={onRemove} aria-label="Remove selection">
              <IoClose />
            </button>
          </div>
          <p className="mobile-betslip-sheet__market">{bet.marketName}</p>
        </div>

        <div className="mobile-betslip-sheet__actions">
          <button
            type="button"
            className="mobile-betslip-clear-all"
            onClick={onClearAll}
          >
            Clear all{betCount > 1 ? ` (${betCount})` : ''}
          </button>
        </div>

        {betCount >= 2 && (
          <button type="button" className="mobile-betslip-promo" onClick={onOpenFull}>
            View full betslip ({betCount} selections) →
          </button>
        )}

        {showStakeSource && (
          <div className="betslip-stake-source mobile-betslip-stake-source">
            <span className="betslip-stake-source__label">Stake from</span>
            <div className="betslip-stake-source__tabs">
              <button
                type="button"
                className={`betslip-stake-source__tab ${activeSource === 'cash' ? 'active' : ''}`}
                onClick={() => selectFundingSource('cash')}
              >
                Cash {formatInr(wallet.cashBalance)}
              </button>
              {bonusAvailable > 0 && (
                <button
                  type="button"
                  className={`betslip-stake-source__tab ${activeSource === 'bonus' ? 'active' : ''}`}
                  onClick={() => selectFundingSource('bonus')}
                  disabled={!canUseBonus}
                >
                  Bonus {formatInr(bonusAvailable)}
                </button>
              )}
              {freebetAvailable > 0 && (
                <button
                  type="button"
                  className={`betslip-stake-source__tab ${activeSource === 'freebet' ? 'active' : ''}`}
                  onClick={() => selectFundingSource('freebet')}
                  disabled={!canUseFreebet}
                >
                  Freebet {formatInr(freebetAvailable)}
                </button>
              )}
            </div>
            {activeSource === 'bonus' && !canUseBonus && (
              <p className="betslip-stake-source__warn">
                Bonus requires odds ≥ {BONUS_MIN_BET_ODDS.toFixed(2)}.
              </p>
            )}
            {activeSource === 'bonus' && canUseBonus && (
              <p className="betslip-stake-source__hint">
                🔒 Bonus must be used in full ({formatInr(bonusAvailable)}).
              </p>
            )}
            {activeSource === 'freebet' && (
              <p className="betslip-stake-source__hint">
                🔒 Free Bet must be used in full ({formatInr(freebetAvailable)}).
              </p>
            )}
          </div>
        )}

        <div className="mobile-betslip-stake-row">
          <label className="mobile-betslip-stake-label" htmlFor="mobile-quick-stake-input">
            Stake (₹)
          </label>
          <div className="mobile-betslip-stake-input-wrap">
            <span className="mobile-betslip-stake-prefix" aria-hidden="true">₹</span>
            <input
              id="mobile-quick-stake-input"
              type="text"
              inputMode="decimal"
              enterKeyHint="done"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              value={isPromoLocked ? String(promoAmount) : stake}
              readOnly={isPromoLocked}
              disabled={isPromoLocked}
              onChange={(e) => {
                if (!isPromoLocked) onStake(sanitizeStakeInput(e.target.value));
              }}
              placeholder="Enter amount"
              aria-label="Enter stake amount"
            />
            {isPromoLocked && <span style={{ marginLeft: 6 }}>🔒</span>}
          </div>
        </div>

        {!isPromoLocked ? (
          <div className="mobile-betslip-quick-stakes">
            {QUICK_STAKES.map((amount) => (
              <button
                key={amount}
                type="button"
                className={`mobile-betslip-quick-stake${String(amount) === String(stake) ? ' is-active' : ''}`}
                onClick={() => onStake(String(amount))}
              >
                ₹{amount >= 1000 ? `${amount / 1000}K` : amount}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: '0.78rem', color: '#f59e0b', fontWeight: 600, padding: '4px 0 8px', textAlign: 'center' }}>
            🔒 Promotional stake is fixed ({formatInr(promoAmount)})
          </div>
        )}

        {noticeText && (
          <p className="mobile-betslip-notice" role="status">{noticeText}</p>
        )}

        {oddsChanged && (
          <div className="mobile-betslip-odds-actions">
            {showStrike && (
              <p className="mobile-betslip-odds-compare" aria-live="polite">
                <s>{oldOdds.toFixed(2)}</s>
                {' → '}
                <strong>{Number.isFinite(newOdds) ? newOdds.toFixed(2) : '—'}</strong>
              </p>
            )}
            <button
              type="button"
              className="mobile-betslip-accept-odds"
              onClick={onAcceptOdds}
            >
              Accept New Odds
            </button>
            <button
              type="button"
              className="mobile-betslip-cancel-odds"
              onClick={onRemove || onClose}
            >
              Cancel
            </button>
          </div>
        )}

        <button
          type="button"
          className={`mobile-betslip-place-btn${isPlacing ? ' is-placing' : ''}`}
          disabled={stakeNum < MIN_STAKE_INR || isPlacing || oddsChanged}
          onClick={onPlace}
        >
          {isPlacing ? 'Placing…' : 'Place bet'}
        </button>
        <p className="mobile-betslip-return-hint">
          {activeSource === 'freebet' ? 'Potential profit' : 'Potential return'}
          {' '}
          <strong>₹{potentialReturn}</strong>
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
    bets,
    quickBet,
    closeQuickBet,
    openQuickBetPanel,
    placeBets,
    setSingleStake,
    singlesStakes,
    removeBet,
    clearAll,
    acceptOddsChange,
    activeFundingSource,
    selectFundingSource,
    isPromoLocked,
    promoAmount,
  } = useBetSlip();
  const { isLoggedIn, openLoginModal, showToast, dismissToast, user } = useAuth();
  const location = useLocation();
  const isDesktop = useDesktopBetslipLayout();
  const [isPlacing, setIsPlacing] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const [placementNotice, setPlacementNotice] = useState(null);
  const prevBetCountRef = useRef(betCount);

  const bet = !quickBet?.bet
    ? null
    : (bets.find((item) => item.id === quickBet.bet.id) || quickBet.bet);
  // Use ?? so an emptied field ('') is not replaced by the default 100.
  const stake = !bet ? '' : (singlesStakes[bet.id] ?? quickBet.defaultStake ?? '100');

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
    closeQuickBet();
    setIsMobileOpen(false);
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

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

  useEffect(() => {
    if (!isMobileOpen && !quickBet) return undefined;
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, [isMobileOpen, quickBet]);

  useEffect(() => {
    if (!isMobileOpen && !quickBet) return undefined;
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const syncKeyboard = () => {
      const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty('--kb-inset', `${covered}px`);
    };
    syncKeyboard();
    vv.addEventListener('resize', syncKeyboard);
    vv.addEventListener('scroll', syncKeyboard);
    return () => {
      vv.removeEventListener('resize', syncKeyboard);
      vv.removeEventListener('scroll', syncKeyboard);
      document.documentElement.style.setProperty('--kb-inset', '0px');
    };
  }, [isMobileOpen, quickBet]);

  const handleQuickPlace = async () => {
    if (isPlacing || !bet) return;
    if (!isLoggedIn) {
      showToast('Please log in to place a bet.', 'info');
      openLoginModal();
      return;
    }
    const stakeNum = isPromoLocked ? promoAmount : (parseFloat(stake) || 0);
    if (stakeNum < MIN_STAKE_INR) {
      showToast(`Minimum stake is ₹${MIN_STAKE_INR}.`, 'error');
      return;
    }

    const wallet = getWalletBreakdown(user);
    const activeSource = activeFundingSource;

    if (activeSource === 'bonus' && !canBetWithBonusOnLegs([bet])) {
      showToast(
        `Bonus requires odds of ${BONUS_MIN_BET_ODDS.toFixed(2)} or higher.`,
        'error',
      );
      return;
    }
    if (activeSource === 'bonus' && Math.round(stakeNum * 100) !== Math.round(wallet.bonus * 100)) {
      showToast(`This Bonus must be used in full (₹${wallet.bonus}). Partial usage is not allowed.`, 'error');
      return;
    }
    if (activeSource === 'freebet' && Math.round(stakeNum * 100) !== Math.round(wallet.freebets * 100)) {
      showToast(`This Free Bet must be used in full (₹${wallet.freebets}). Partial usage is not allowed.`, 'error');
      return;
    }
    if (activeSource === 'cash' && wallet.cashBalance < stakeNum) {
      showToast('Insufficient cash balance. Please deposit funds.', 'error');
      return;
    }

    setIsPlacing(true);
    setPlacementNotice(null);
    try {
      const result = await placeBets({ stakeSource: activeSource, singleBetId: bet.id });
      if (result.success) {
        closeQuickBet();
        showToast('Bet placed!', 'success');
      } else if (result.oddsUpdated || result.requiresAcceptance) {
        const update = result.updates?.[0];
        const oldPrice = Number(update?.oldOdds ?? update?.previousOdds);
        const newPrice = Number(update?.newOdds ?? update?.odds);
        const msg = Number.isFinite(oldPrice) && Number.isFinite(newPrice)
          ? `Odds changed from ${oldPrice.toFixed(2)} to ${newPrice.toFixed(2)}.`
          : (result.error || 'The odds have changed. Please review the new odds.');
        setPlacementNotice(msg);
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
            onRemove={() => { removeBet(bet.id); closeQuickBet(); }}
            onClearAll={() => { clearAll(); closeQuickBet(); }}
            onOpenFull={openFullFromQuick}
            onAcceptOdds={() => {
              if (bet) {
                acceptOddsChange(bet.id);
                setPlacementNotice(null);
              }
            }}
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
