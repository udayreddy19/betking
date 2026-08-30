import { useState, useEffect } from 'react';
import { useBetSlip } from '../../context/BetSlipContext';
import { useAuth } from '../../context/AuthContext';
import { getWalletBreakdown, formatInr } from '../../utils/walletBalance';
import {
  BONUS_MIN_BET_ODDS,
  MIN_STAKE_INR,
  MAX_STAKE_INR,
  QUICK_STAKE_PRESETS,
  sanitizeStakeInput,
  canBetWithBonusOnLegs,
} from '../../utils/wageringRules';
import { DEMO_MODE } from '../../utils/featureFlags';
import { cleanKycMessage, isKycError, KYC_PROFILE_PATH } from '../../utils/kycUi';
import { buildSpinGrantNotice } from '../../utils/spinGrantUi';
import './BetSlipFooter.css';

const QUICK_STAKES = QUICK_STAKE_PRESETS;

export default function BetSlipFooter({ variant = 'default', onPlaced }) {
  const {
    bets, betCount, stake, setStake, totalOdds, potentialReturn, placeBets, clearAll,
    betType, totalStakeAmount, setSingleStake,
    hasBlockingConflicts, singlesStakes,
    hasPendingOddsAcceptance,
    availableRewards, selectedRewardId, setSelectedRewardId, selectReward, selectedReward, isStakeLocked,
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
  if (selectedReward) {
    activeSource = selectedReward.rewardType;
  } else if (stakeSource === 'bonus' && canUseBonus) {
    activeSource = 'bonus';
  } else if (stakeSource === 'freebet' && canUseFreebet) {
    activeSource = 'freebet';
  }

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
    if (amountToDeduct > MAX_STAKE_INR) {
      showToast(`Maximum stake allowed is ${formatInr(MAX_STAKE_INR)} (server-enforced).`, 'error');
      return;
    }

    // Exact Stake Enforcement on Frontend
    if (selectedReward) {
      const expectedAmount = Number(selectedReward.amount);
      if (!selectedReward.allowPartialUse && Math.round(amountToDeduct * 100) !== Math.round(expectedAmount * 100)) {
        showToast(
          `${selectedReward.rewardType === 'freebet' ? 'Free Bet' : 'Bonus'} must be placed as a single exact ${formatInr(expectedAmount)} stake.`,
          'error',
        );
        return;
      }
      if (selectedReward.minOdds && selectedReward.minOdds > 1.00 && Number(totalOdds) < selectedReward.minOdds) {
        showToast(
          `This reward requires minimum odds of ${selectedReward.minOdds.toFixed(2)}. Current odds: ${totalOdds}`,
          'error',
        );
        return;
      }
    } else if (activeSource === 'bonus') {
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

      const result = await placeBets({
        stakeSource: activeSource,
        rewardId: selectedReward?.rewardId || null,
      });
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
          ? `Multi bet placed (${selectedReward ? selectedReward.title : activeSource})! Potential return ₹${ret.toFixed(2)}`
          : `${result.placed.length} single bet(s) placed (${selectedReward ? selectedReward.title : activeSource})! Potential return ₹${ret.toFixed(2)}`,
        'success',
      );
      onPlaced?.();
    } finally {
      setIsPlacing(false);
    }
  };

  const handleSelectPaymentMethod = (type, reward = null) => {
    if (type === 'cash') {
      setSelectedRewardId(null);
      setStakeSource('cash');
    } else if (reward) {
      selectReward(reward);
      setStakeSource(reward.rewardType);
    }
  };

  const stakeSourceToggle = (
    <div className="betslip-stake-source">
      <span className="betslip-stake-source__label">Payment Method</span>
      <div className="betslip-stake-source__tabs betslip-stake-source__tabs--scrollable">
        <button
          type="button"
          className={`betslip-stake-source__tab ${!selectedRewardId && activeSource === 'cash' ? 'active' : ''}`}
          onClick={() => handleSelectPaymentMethod('cash')}
        >
          ○ Cash Wallet {formatInr(wallet.cashBalance)}
        </button>

        {availableRewards.map((reward) => {
          const isSelected = selectedRewardId === reward.rewardId;
          const isFreeBet = reward.rewardType === 'freebet';
          return (
            <button
              key={reward.rewardId}
              type="button"
              className={`betslip-stake-source__tab betslip-stake-source__tab--reward ${isSelected ? 'active' : ''} ${isFreeBet ? 'betslip-stake-source__tab--freebet' : 'betslip-stake-source__tab--bonus'}`}
              onClick={() => handleSelectPaymentMethod('reward', reward)}
            >
              {isFreeBet ? '🎁' : '⭐'} {reward.title || `${isFreeBet ? 'Free Bet' : 'Bonus'} ${formatInr(reward.amount)}`}
            </button>
          );
        })}
      </div>

      {selectedReward && (
        <div className="betslip-reward-applied-banner">
          <span className="betslip-reward-applied-banner__icon">🔒</span>
          <div className="betslip-reward-applied-banner__text">
            <strong>{selectedReward.rewardType === 'freebet' ? 'Free Bet Applied' : 'Bonus Applied'}:</strong> You must place this reward as a single exact {formatInr(selectedReward.amount)} stake.
            {selectedReward.minOdds && selectedReward.minOdds > 1.00 && (
              <div className="betslip-reward-applied-banner__sub">Requires min odds of {selectedReward.minOdds.toFixed(2)}.</div>
            )}
          </div>
        </div>
      )}

      {!selectedReward && stakeSource === 'bonus' && !canUsePromoFunds && (
        <p className="betslip-stake-source__warn">
          Bonus requires odds ≥ {BONUS_MIN_BET_ODDS.toFixed(2)} on every selection. Rotate 5× before withdrawing winnings.
        </p>
      )}
      {!selectedReward && activeSource === 'bonus' && canUsePromoFunds && (
        <p className="betslip-stake-source__hint">
          Bonus must be rotated 5 times at {BONUS_MIN_BET_ODDS.toFixed(2)}+ odds. Winnings can be withdrawn after that — not the bonus.
        </p>
      )}
      {!selectedReward && activeSource === 'freebet' && (
        <p className="betslip-stake-source__hint">
          Free bet plays like cash at any odds. Winning pays profit only.
        </p>
      )}
    </div>
  );

  const applySinglesStake = (value) => {
    if (isStakeLocked) return;
    setStake(value);
    bets.forEach((bet) => setSingleStake(bet.id, value));
  };

  const stakeControls = (
    <>
      {!isStakeLocked && (
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
      )}

      <div className="betslip-stake betslip-stake--inline">
        <span className="betslip-stake-label">
          {betType === 'multi' ? 'Stake (₹)' : 'Stake each (₹)'}
        </span>
        <div className="betslip-stake-input-wrap">
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder={singlesStakePlaceholder}
            value={betType === 'multi' ? stake : singlesStakeInputValue}
            readOnly={isStakeLocked}
            disabled={isStakeLocked}
            className={`betslip-stake-input ${isStakeLocked ? 'betslip-stake-input--locked' : ''}`}
            onChange={(e) => {
              if (isStakeLocked) return;
              const value = sanitizeStakeInput(e.target.value);
              if (betType === 'multi') {
                setStake(value);
              } else {
                applySinglesStake(value);
              }
            }}
            id="stake-input"
            aria-label={betType === 'multi' ? 'Stake amount' : 'Stake amount per single bet'}
          />
          {isStakeLocked && (
            <span className="betslip-stake-lock-icon" title="Stake locked to exact reward amount">
              🔒
            </span>
          )}
        </div>
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
            disabled={!stake || parseFloat(stake) < MIN_STAKE_INR || isPlacing || hasBlockingConflicts || needsOddsAcceptance}
            type="button"
            onClick={handlePlaceBet}
          >
            {isPlacing ? 'Placing…' : (needsOddsAcceptance ? 'Accept odds first' : 'Place Bet')}
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
