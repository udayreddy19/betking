import { useState, useEffect } from 'react';
import { useBetSlip } from '../../context/BetSlipContext';
import { useAuth } from '../../context/AuthContext';
import { getWalletBreakdown, formatInr } from '../../utils/walletBalance';
import {
  BONUS_MIN_BET_ODDS,
  MIN_STAKE_INR,
  canBetWithBonusOnLegs,
} from '../../utils/wageringRules';
import { DEMO_MODE } from '../../utils/featureFlags';
import { cleanKycMessage, isKycError, KYC_PROFILE_PATH } from '../../utils/kycUi';
import { buildSpinGrantNotice } from '../../utils/spinGrantUi';
import './BetSlipFooter.css';

const QUICK_STAKES = [100, 500, 1000];

export default function BetSlipFooter({ variant = 'default', onPlaced }) {
  const {
    bets, betCount, stake, setStake, totalOdds, potentialReturn, placeBets, clearAll,
    betType, totalStakeAmount, setSingleStake,
    hasBlockingConflicts, singlesStakes,
    hasPendingOddsAcceptance,
  } = useBetSlip();
  const {
    user, isLoggedIn, deductStake, refundStake, showToast, openLoginModal,
  } = useAuth();
  const [isPlacing, setIsPlacing] = useState(false);
  const [stakeSource, setStakeSource] = useState('cash');
  const [placementNotice, setPlacementNotice] = useState(null);
  const hasOddsUpdates = bets.some((bet) => bet.oddsChanged || bet.oddsStatus === 'ODDS_CHANGED');
  const needsOddsAcceptance = hasPendingOddsAcceptance;

  useEffect(() => {
    if (!hasOddsUpdates) {
      setPlacementNotice(null);
    }
  }, [hasOddsUpdates]);

  const oddsNotice = placementNotice
    || (needsOddsAcceptance
      ? 'Odds changed — accept the updated price(s) before placing your bet.'
      : (hasOddsUpdates ? 'Odds updated — review the new prices and tap Place again.' : null));

  const singlesStakeInputValue = (() => {
    if (betType === 'multi') return stake;
    const values = bets.map((b) => singlesStakes[b.id]).filter((v) => v != null && v !== '');
    if (values.length === 0) return stake;
    const allSame = values.length === bets.length
      && values.every((v) => String(v) === String(values[0]));
    return allSame ? String(values[0]) : '';
  })();
  const singlesStakePlaceholder = betType === 'singles'
    && bets.some((b) => singlesStakes[b.id])
    && !singlesStakeInputValue
    ? 'Mixed'
    : '0.00';

  if (betCount === 0) return null;

  const wallet = getWalletBreakdown(user);
  const bonusAvailable = wallet.bonus;
  const freebetAvailable = wallet.freebets;
  const canUsePromoFunds = canBetWithBonusOnLegs(bets);
  const canUseBonus = bonusAvailable > 0 && canBetWithBonusOnLegs(bets);
  const canUseFreebet = freebetAvailable > 0;

  let activeSource = 'cash';
  if (stakeSource === 'bonus' && canUseBonus) activeSource = 'bonus';
  else if (stakeSource === 'freebet' && canUseFreebet) activeSource = 'freebet';

  const spinGrantNotice = buildSpinGrantNotice(user?.spinGrants);
  const showSpinExpiry = spinGrantNotice && (activeSource === 'bonus' || activeSource === 'freebet');

  const handlePlaceBet = async () => {
    if (isPlacing) return;

    if (!isLoggedIn) {
      showToast('Please log in to place a bet.', 'info');
      openLoginModal();
      return;
    }

    const amountToDeduct = betType === 'multi' ? parseFloat(stake) : totalStakeAmount;
    if (!amountToDeduct || amountToDeduct <= 0) {
      showToast('Enter a valid stake amount.', 'error');
      return;
    }
    if (amountToDeduct < MIN_STAKE_INR) {
      showToast(`Minimum stake is ${formatInr(MIN_STAKE_INR)}.`, 'error');
      return;
    }

    if (activeSource === 'bonus') {
      if (!canUsePromoFunds) {
        showToast(
          `Bonus requires odds of ${BONUS_MIN_BET_ODDS.toFixed(2)} or higher on every selection.`,
          'error',
        );
        return;
      }
      if (bonusAvailable < amountToDeduct) {
        showToast('Insufficient bonus balance.', 'error');
        return;
      }
    } else if (activeSource === 'freebet') {
      if (freebetAvailable < amountToDeduct) {
        showToast('Insufficient freebet balance.', 'error');
        return;
      }
    } else if (wallet.cashBalance < amountToDeduct) {
      showToast('Insufficient cash balance. Please deposit funds.', 'error');
      return;
    }

    if (hasBlockingConflicts) {
      showToast('Some selections are related and cannot be combined in a Multi.', 'error');
      return;
    }

    setIsPlacing(true);
    setPlacementNotice(null);
    try {
      const cashAmount = activeSource === 'cash' ? amountToDeduct : 0;
      const bonusAmount = activeSource === 'bonus' ? amountToDeduct : 0;
      const freebetAmount = activeSource === 'freebet' ? amountToDeduct : 0;
      let deducted = { success: true, wageringApplied: 0, winningsSpent: 0 };

      if (DEMO_MODE) {
        deducted = deductStake({ cashAmount, bonusAmount, freebetAmount });
        if (!deducted.success) {
          showToast('Insufficient balance. Please deposit funds.', 'error');
          return;
        }
      }

      const result = await placeBets({ stakeSource: activeSource });
      if (!result.success) {
        if (DEMO_MODE) {
          refundStake({
            cashAmount,
            bonusAmount,
            freebetAmount,
            wageringApplied: deducted.wageringApplied,
            winningsSpent: deducted.winningsSpent,
          });
        }
        if (isKycError(result.error)) {
          showToast(cleanKycMessage(result.error) || 'Verify your identity before withdrawing.', 'error', {
            action: { label: 'Proceed to KYC', path: KYC_PROFILE_PATH },
          });
        } else if (result.oddsUpdated || result.requiresAcceptance) {
          const msg = result.error || 'The odds have changed. Please review the new odds.';
          setPlacementNotice(msg);
          showToast(msg, 'info');
        } else {
          showToast(result.error || 'Could not place bet.', 'error');
        }
        return;
      }

      const ret = Number(
        result.potentialReturn
        ?? result.placed?.potentialReturn
        ?? (Array.isArray(result.placed)
          ? result.placed.reduce((s, p) => s + Number(p.potentialReturn || 0), 0)
          : potentialReturn),
      );

      showToast(
        betType === 'multi'
          ? `Multi bet placed (${activeSource})! Potential return ₹${ret.toFixed(2)}`
          : `${result.placed.length} single bet(s) placed (${activeSource})! Potential return ₹${ret.toFixed(2)}`,
        'success',
      );
      onPlaced?.();
    } finally {
      setIsPlacing(false);
    }
  };

  const stakeSourceToggle = (bonusAvailable > 0 || freebetAvailable > 0) && (
    <div className="betslip-stake-source">
      <span className="betslip-stake-source__label">Stake from</span>
      <div className="betslip-stake-source__tabs">
        <button
          type="button"
          className={`betslip-stake-source__tab ${activeSource === 'cash' ? 'active' : ''}`}
          onClick={() => setStakeSource('cash')}
        >
          Cash {formatInr(wallet.cashBalance)}
        </button>
        {bonusAvailable > 0 && (
          <button
            type="button"
            className={`betslip-stake-source__tab ${activeSource === 'bonus' ? 'active' : ''}`}
            onClick={() => setStakeSource('bonus')}
            disabled={!canUseBonus}
          >
            Bonus {formatInr(bonusAvailable)}
          </button>
        )}
        {freebetAvailable > 0 && (
          <button
            type="button"
            className={`betslip-stake-source__tab ${activeSource === 'freebet' ? 'active' : ''}`}
            onClick={() => setStakeSource('freebet')}
            disabled={!canUseFreebet}
          >
            Freebet {formatInr(freebetAvailable)}
          </button>
        )}
      </div>
      {stakeSource === 'bonus' && !canUsePromoFunds && (
        <p className="betslip-stake-source__warn">
          Bonus requires odds ≥ {BONUS_MIN_BET_ODDS.toFixed(2)} on every selection. Rotate 5× before withdrawing winnings.
        </p>
      )}
      {activeSource === 'bonus' && canUsePromoFunds && (
        <p className="betslip-stake-source__hint">
          Bonus must be rotated 5 times at {BONUS_MIN_BET_ODDS.toFixed(2)}+ odds. Winnings can be withdrawn after that — not the bonus.
        </p>
      )}
      {activeSource === 'freebet' && (
        <p className="betslip-stake-source__hint">
          Free bet plays like cash at any odds. Winning pays profit only.
        </p>
      )}
    </div>
  );

  const applySinglesStake = (value) => {
    setStake(value);
    bets.forEach((bet) => setSingleStake(bet.id, value));
  };

  const stakeControls = (
    <>
      <div className="betslip-quick-stakes">
        {QUICK_STAKES.map(amount => (
          <button
            key={amount}
            type="button"
            className="betslip-quick-stake-btn"
            onClick={() => applySinglesStake(String(amount))}
          >
            ₹{amount}
          </button>
        ))}
      </div>

      <div className="betslip-stake betslip-stake--inline">
        <span className="betslip-stake-label">
          {betType === 'multi' ? 'Stake (₹)' : 'Stake each (₹)'}
        </span>
        <input
          type="number"
          placeholder={singlesStakePlaceholder}
          value={betType === 'multi' ? stake : singlesStakeInputValue}
          onChange={(e) => {
            const value = e.target.value;
            if (betType === 'multi') {
              setStake(value);
            } else {
              applySinglesStake(value);
            }
          }}
          min={MIN_STAKE_INR}
          id="stake-input"
          aria-label={betType === 'multi' ? 'Stake amount' : 'Stake amount per single bet'}
        />
      </div>
    </>
  );
  const isModal = variant === 'modal';
  const placeLabel = betType === 'multi'
    ? 'Place Multi Bet'
    : `Place ${betCount} Single Bet${betCount > 1 ? 's' : ''}`;

  if (isModal) {
    return (
      <div className="betslip-footer-panel betslip-footer-panel--modal betslip-footer-panel--modal-compact">
        <div className="betslip-modal-bets-list">
          {bets.map(bet => (
            <div key={bet.id} className="betslip-modal-bet-row">
              <span className="betslip-modal-selection-name">{bet.selectionName}</span>
              <span className="betslip-modal-selection-odds">@ {Number(bet.odds).toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div className="betslip-modal-row">
          <button type="button" className="betslip-modal-clear" onClick={clearAll}>
            Clear all
          </button>
        </div>

        {stakeSourceToggle}

        {showSpinExpiry && (
          <div className="betslip-footer-notice betslip-footer-notice--spin-expiry" role="status">
            {spinGrantNotice.message}
          </div>
        )}
        {oddsNotice && (
          <div className="betslip-footer-notice" role="status">
            {oddsNotice}
          </div>
        )}

        <div className="betslip-modal-row betslip-modal-actions">
          <div className="betslip-modal-quick-stakes">
            {QUICK_STAKES.map(amount => (
              <button
                key={amount}
                type="button"
                className="betslip-quick-stake-btn"
                onClick={() => (betType === 'multi' ? setStake(String(amount)) : applySinglesStake(String(amount)))}
              >
                ₹{amount}
              </button>
            ))}
          </div>
          <input
            type="number"
            className="betslip-modal-stake-input"
            placeholder="Stake"
            value={stake}
            onChange={(e) => (betType === 'multi' ? setStake(e.target.value) : applySinglesStake(e.target.value))}
            min={MIN_STAKE_INR}
            id="modal-stake-input"
            aria-label={betType === 'multi' ? 'Stake amount' : 'Stake amount per single bet'}
          />
          <button
            className={`betslip-place-btn betslip-modal-place-btn ${isPlacing ? 'is-placing' : ''}`}
            disabled={!stake || parseFloat(stake) < MIN_STAKE_INR || isPlacing || hasBlockingConflicts}
            type="button"
            onClick={handlePlaceBet}
          >
            {isPlacing ? 'Placing…' : 'Place Bet'}
          </button>
        </div>

        <div className="betslip-modal-summary">
          <span>Return: <strong>₹{potentialReturn}</strong></span>
          <span>Odds: <strong>{totalOdds}</strong></span>
        </div>
      </div>
    );
  }

  return (
    <div className={`betslip-footer-panel ${variant === 'floating' ? 'betslip-footer-panel--floating' : ''}`}>
      {stakeSourceToggle}

      {stakeControls}

      <div className="betslip-footer-summary">
        <div className="betslip-summary">
          <span className="label">{betType === 'multi' ? 'Odds' : 'Total stake'}</span>
          <span className="value">
            {betType === 'multi' ? totalOdds : `₹${totalStakeAmount.toFixed(2)}`}
          </span>
        </div>
        <div className="betslip-summary">
          <span className="label">Return</span>
          <span className="value">₹{potentialReturn}</span>
        </div>
      </div>

      {showSpinExpiry && (
        <div className="betslip-footer-notice betslip-footer-notice--spin-expiry" role="status">
          {spinGrantNotice.message}
        </div>
      )}

      {oddsNotice && (
        <div className="betslip-footer-notice" role="status">
          {oddsNotice}
        </div>
      )}

      <button
        className={`betslip-place-btn ${isPlacing ? 'is-placing' : ''}`}
        disabled={(betType === 'multi' ? (!stake || parseFloat(stake) < MIN_STAKE_INR) : totalStakeAmount < MIN_STAKE_INR) || isPlacing || hasBlockingConflicts || needsOddsAcceptance}
        type="button"
        onClick={handlePlaceBet}
      >
        {isPlacing ? 'Placing bet…' : placeLabel}
      </button>
    </div>
  );
}
