import { useBetSlip } from '../../context/BetSlipContext';
import { useAuth } from '../../context/AuthContext';
import './BetSlipFooter.css';

const QUICK_STAKES = [100, 500, 1000];

export default function BetSlipFooter({ variant = 'default', onPlaced }) {
  const {
    bets, betCount, stake, setStake, totalOdds, potentialReturn, placeBets, clearAll,
    betType, totalStakeAmount,
  } = useBetSlip();
  const { user, isLoggedIn, deductFunds, showToast, openLoginModal } = useAuth();

  if (betCount === 0) return null;

  const handlePlaceBet = () => {
    if (!isLoggedIn) {
      showToast('Please log in to place a bet.');
      openLoginModal();
      return;
    }

    const amountToDeduct = betType === 'multi' ? parseFloat(stake) : totalStakeAmount;
    if (!amountToDeduct || amountToDeduct <= 0) {
      showToast('Enter a valid stake amount.');
      return;
    }
    if (user.balance < amountToDeduct) {
      showToast('Insufficient balance. Please deposit funds.');
      return;
    }

    const deducted = deductFunds(amountToDeduct);
    if (!deducted) {
      showToast('Insufficient balance. Please deposit funds.');
      return;
    }

    const result = placeBets();
    if (result.success) {
      const ret = betType === 'multi'
        ? result.placed.potentialReturn
        : result.placed.reduce((s, p) => s + p.potentialReturn, 0);
      showToast(
        betType === 'multi'
          ? `Multi bet placed! Potential return ₹${ret.toFixed(2)}`
          : `${result.placed.length} single bet(s) placed! Potential return ₹${ret.toFixed(2)}`
      );
      onPlaced?.();
    } else {
      showToast(result.error || 'Could not place bet.');
    }
  };

  const isModal = variant === 'modal';
  const activeBet = bets[bets.length - 1];
  const placeLabel = betType === 'multi'
    ? 'Place Multi Bet'
    : `Place ${betCount} Single Bet${betCount > 1 ? 's' : ''}`;

  if (isModal) {
    return (
      <div className="betslip-footer-panel betslip-footer-panel--modal betslip-footer-panel--modal-compact">
        <div className="betslip-modal-row">
          <div className="betslip-modal-selection">
            <span className="betslip-modal-selection-name">{activeBet?.selectionName}</span>
            <span className="betslip-modal-selection-odds">@ {Number(activeBet?.odds).toFixed(2)}</span>
          </div>
          <button type="button" className="betslip-modal-clear" onClick={clearAll}>
            Clear
          </button>
        </div>

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
            className="betslip-place-btn betslip-modal-place-btn"
            disabled={!stake || parseFloat(stake) <= 0}
            type="button"
            onClick={handlePlaceBet}
          >
            Place Bet
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
        className="betslip-place-btn"
        disabled={betType === 'multi' ? (!stake || parseFloat(stake) <= 0) : totalStakeAmount <= 0}
        type="button"
        onClick={handlePlaceBet}
      >
        {placeLabel}
      </button>
    </div>
  );
}
