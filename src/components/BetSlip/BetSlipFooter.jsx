import { useState } from 'react';
import { useBetSlip } from '../../context/BetSlipContext';
import { useAuth } from '../../context/AuthContext';
import { getWalletBreakdown, formatInr } from '../../utils/walletBalance';
import {
  BONUS_MIN_BET_ODDS,
  BONUS_MIN_WITHDRAW_ODDS,
  canBetWithBonusOnLegs,
} from '../../utils/wageringRules';
import './BetSlipFooter.css';

const QUICK_STAKES = [100, 500, 1000];

export default function BetSlipFooter({ variant = 'default', onPlaced }) {
  const {
    bets, betCount, stake, setStake, totalOdds, potentialReturn, placeBets, clearAll,
    betType, totalStakeAmount,
  } = useBetSlip();
  const {
    user, isLoggedIn, deductStake, refundStake, showToast, openLoginModal,
  } = useAuth();
  const [isPlacing, setIsPlacing] = useState(false);
  const [stakeSource, setStakeSource] = useState('cash');

  if (betCount === 0) return null;

  const wallet = getWalletBreakdown(user);
  const bonusAvailable = wallet.bonus;
  const canUseBonus = bonusAvailable > 0 && canBetWithBonusOnLegs(bets);
  const activeSource = stakeSource === 'bonus' && canUseBonus ? 'bonus' : 'cash';

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

    if (activeSource === 'bonus') {
      if (!canBetWithBonusOnLegs(bets)) {
        showToast(
          `Bonus bets require odds of ${BONUS_MIN_BET_ODDS.toFixed(2)} or higher on every selection.`,
          'error',
        );
        return;
      }
      if (bonusAvailable < amountToDeduct) {
        showToast('Insufficient bonus balance.', 'error');
        return;
      }
    } else if (wallet.cashBalance < amountToDeduct) {
      showToast('Insufficient cash balance. Please deposit funds.', 'error');
      return;
    }

    setIsPlacing(true);
    try {
      const cashAmount = activeSource === 'cash' ? amountToDeduct : 0;
      const bonusAmount = activeSource === 'bonus' ? amountToDeduct : 0;
      const deducted = deductStake({ cashAmount, bonusAmount });

      if (!deducted.success) {
        showToast('Insufficient balance. Please deposit funds.', 'error');
        return;
      }

      const result = placeBets({ stakeSource: activeSource });
      if (!result.success) {
        refundStake({
          cashAmount,
          bonusAmount,
          wageringApplied: deducted.wageringApplied,
          winningsSpent: deducted.winningsSpent,
        });
        showToast(result.error || 'Could not place bet.', 'error');
        return;
      }

      const ret = betType === 'multi'
        ? result.placed.potentialReturn
        : result.placed.reduce((s, p) => s + p.potentialReturn, 0);

      const sourceLabel = activeSource === 'bonus' ? 'bonus' : 'cash';
      showToast(
        betType === 'multi'
          ? `Multi bet placed (${sourceLabel})! Potential return ₹${ret.toFixed(2)}`
          : `${result.placed.length} single bet(s) placed (${sourceLabel})! Potential return ₹${ret.toFixed(2)}`,
        'success',
      );
      onPlaced?.();
    } finally {
      setIsPlacing(false);
    }
  };

  const stakeSourceToggle = bonusAvailable > 0 && (
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
        <button
          type="button"
          className={`betslip-stake-source__tab ${activeSource === 'bonus' ? 'active' : ''}`}
          onClick={() => setStakeSource('bonus')}
          disabled={!canUseBonus}
        >
          Bonus {formatInr(bonusAvailable)}
        </button>
      </div>
      {stakeSource === 'bonus' && !canBetWithBonusOnLegs(bets) && (
        <p className="betslip-stake-source__warn">
          Bonus requires odds ≥ {BONUS_MIN_BET_ODDS.toFixed(2)}. Winnings withdrawable only at ≥
          {BONUS_MIN_WITHDRAW_ODDS.toFixed(2)}.
        </p>
      )}
      {activeSource === 'bonus' && canBetWithBonusOnLegs(bets) && (
        <p className="betslip-stake-source__hint">
          Winnings withdrawable only when odds are ≥ {BONUS_MIN_WITHDRAW_ODDS.toFixed(2)}.
        </p>
      )}
    </div>
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

        <div className="betslip-modal-row betslip-modal-actions">
          <div className="betslip-modal-quick-stakes">
            {QUICK_STAKES.map(amount => (
              <button
                key={amount}
                type="button"
                className="betslip-quick-stake-btn"
                onClick={() => setStake(String(amount))}
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
            onChange={e => setStake(e.target.value)}
            min="0"
            id="modal-stake-input"
            aria-label="Stake amount"
          />
          <button
            className={`betslip-place-btn betslip-modal-place-btn ${isPlacing ? 'is-placing' : ''}`}
            disabled={!stake || parseFloat(stake) <= 0 || isPlacing}
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

      {betType === 'multi' && (
        <>
          <div className="betslip-quick-stakes">
            {QUICK_STAKES.map(amount => (
              <button
                key={amount}
                type="button"
                className="betslip-quick-stake-btn"
                onClick={() => setStake(String(amount))}
              >
                ₹{amount}
              </button>
            ))}
          </div>

          <div className="betslip-stake">
            <label htmlFor="stake-input">Stake (₹)</label>
            <input
              type="number"
              placeholder="0.00"
              value={stake}
              onChange={e => setStake(e.target.value)}
              min="0"
              id="stake-input"
            />
          </div>
        </>
      )}

      <div className="betslip-footer-summary">
        <div className="betslip-summary">
          <span className="label">{betType === 'multi' ? 'Total Odds' : 'Total Stake'}</span>
          <span className="value">
            {betType === 'multi' ? totalOdds : `₹${totalStakeAmount.toFixed(2)}`}
          </span>
        </div>
        <div className="betslip-summary">
          <span className="label">Potential Return</span>
          <span className="value">₹{potentialReturn}</span>
        </div>
      </div>

      <button
        className={`betslip-place-btn ${isPlacing ? 'is-placing' : ''}`}
        disabled={(betType === 'multi' ? (!stake || parseFloat(stake) <= 0) : totalStakeAmount <= 0) || isPlacing}
        type="button"
        onClick={handlePlaceBet}
      >
        {isPlacing ? 'Placing bet…' : placeLabel}
      </button>
    </div>
  );
}
