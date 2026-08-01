import { useBetSlip } from '../../context/BetSlipContext';
import { useAuth } from '../../context/AuthContext';
import './BetSlipFooter.css';

const QUICK_STAKES = [100, 500, 1000];

export default function BetSlipFooter({ variant = 'default', onPlaced }) {
  const {
    bets, betCount, stake, setStake, totalOdds, potentialReturn, placeBets,
  } = useBetSlip();
  const { user, isLoggedIn, deductFunds, showToast, openLoginModal } = useAuth();

  if (betCount === 0) return null;

  const handlePlaceBet = () => {
    const stakeAmount = parseFloat(stake);
    if (!isLoggedIn) {
      showToast('Please log in to place a bet.');
      openLoginModal();
      return;
    }
    if (!stakeAmount || stakeAmount <= 0) {
      showToast('Enter a valid stake amount.');
      return;
    }
    if (user.balance < stakeAmount) {
      showToast('Insufficient balance. Please deposit funds.');
      return;
    }

    const deducted = deductFunds(stakeAmount);
    if (!deducted) {
      showToast('Insufficient balance. Please deposit funds.');
      return;
    }

    const result = placeBets(stakeAmount);
    if (result.success) {
      showToast(`Bet placed! Potential return ₹${result.placed.potentialReturn.toFixed(2)}`);
      onPlaced?.();
    } else {
      showToast(result.error || 'Could not place bet.');
    }
  };

  return (
    <div className={`betslip-footer-panel ${variant === 'modal' ? 'betslip-footer-panel--modal' : ''} ${variant === 'floating' ? 'betslip-footer-panel--floating' : ''}`}>
      <div className="betslip-footer-selections">
        {bets.map(bet => (
          <div key={bet.id} className="betslip-footer-bet">
            <span className="betslip-footer-bet-name">{bet.selectionName}</span>
            <span className="betslip-footer-bet-odds">@ {Number(bet.odds).toFixed(2)}</span>
          </div>
        ))}
      </div>

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
        <label htmlFor={variant === 'modal' ? 'modal-stake-input' : 'stake-input'}>Stake (₹)</label>
        <input
          type="number"
          placeholder="0.00"
          value={stake}
          onChange={e => setStake(e.target.value)}
          min="0"
          id={variant === 'modal' ? 'modal-stake-input' : 'stake-input'}
        />
      </div>

      <div className="betslip-footer-summary">
        <div className="betslip-summary">
          <span className="label">Total Odds</span>
          <span className="value">{totalOdds}</span>
        </div>
        <div className="betslip-summary">
          <span className="label">Potential Return</span>
          <span className="value">₹{potentialReturn}</span>
        </div>
      </div>

      <button
        className="betslip-place-btn"
        disabled={!stake || parseFloat(stake) <= 0}
        type="button"
        onClick={handlePlaceBet}
      >
        Place Bet
      </button>
    </div>
  );
}
