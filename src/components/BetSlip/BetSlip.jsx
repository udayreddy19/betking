import { IoClose, IoSettingsOutline } from 'react-icons/io5';
import { useBetSlip } from '../../context/BetSlipContext';
import { useAuth } from '../../context/AuthContext';
import './BetSlip.css';

const QUICK_STAKES = [100, 500, 1000];

export default function BetSlip() {
  const {
    bets, removeBet, clearAll, activeTab, setActiveTab,
    stake, setStake, totalOdds, potentialReturn, betCount,
    placedBets, placeBets, myBetsCount,
  } = useBetSlip();
  const { user, isLoggedIn, deductFunds, showToast, openLoginModal } = useAuth();

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
    } else {
      showToast(result.error || 'Could not place bet.');
    }
  };

  return (
    <div className="betslip" id="betslip">
      <div className="betslip-header">
        <button
          className={`betslip-tab ${activeTab === 'betslip' ? 'active' : ''}`}
          onClick={() => setActiveTab('betslip')}
        >
          Betslip <span className="tab-count">{betCount}</span>
        </button>
        <button
          className={`betslip-tab ${activeTab === 'mybets' ? 'active' : ''}`}
          onClick={() => setActiveTab('mybets')}
        >
          My bets <span className="tab-count">{myBetsCount}</span>
        </button>
        {betCount > 0 && (
          <button className="betslip-clear" onClick={clearAll}>Clear all</button>
        )}
        <button className="betslip-settings" type="button" aria-label="Betslip settings">
          <IoSettingsOutline />
        </button>
      </div>

      <div className="betslip-body">
        {activeTab === 'betslip' ? (
          betCount === 0 ? (
            <div className="betslip-empty">
              <div className="betslip-empty-icon">🎟️</div>
              <h4>Your betslip is empty.</h4>
              <p>Once you select a bet it will show up here</p>
            </div>
          ) : (
            bets.map(bet => (
              <div className="betslip-bet" key={bet.id}>
                <div className="betslip-bet-header">
                  <span className="betslip-bet-match">{bet.league}</span>
                  <button className="betslip-bet-remove" onClick={() => removeBet(bet.id)} type="button">
                    <IoClose />
                  </button>
                </div>
                <div className="betslip-bet-selection">{bet.selectionName}</div>
                <div className="betslip-bet-match">{bet.matchName}</div>
                <div className="betslip-bet-odds">@ {Number(bet.odds).toFixed(2)}</div>
              </div>
            ))
          )
        ) : placedBets.length === 0 ? (
          <div className="betslip-empty">
            <div className="betslip-empty-icon">📋</div>
            <h4>No active bets</h4>
            <p>Your placed bets will appear here</p>
          </div>
        ) : (
          placedBets.map(placed => (
            <div className="betslip-bet placed-bet" key={placed.id}>
              <div className="betslip-bet-header">
                <span className="betslip-bet-match">{placed.status.toUpperCase()}</span>
                <span className="placed-bet-time">
                  {new Date(placed.placedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              {placed.legs.map(leg => (
                <div key={leg.id} className="placed-bet-leg">
                  <div className="betslip-bet-selection">{leg.selectionName}</div>
                  <div className="betslip-bet-match">{leg.matchName}</div>
                  <div className="betslip-bet-odds">@ {Number(leg.odds).toFixed(2)}</div>
                </div>
              ))}
              <div className="betslip-summary">
                <span className="label">Stake</span>
                <span className="value">₹{placed.stake.toFixed(2)}</span>
              </div>
              <div className="betslip-summary">
                <span className="label">Potential return</span>
                <span className="value">₹{placed.potentialReturn.toFixed(2)}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {activeTab === 'betslip' && betCount > 0 && (
        <div className="betslip-footer">
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
          <div className="betslip-summary">
            <span className="label">Total Odds</span>
            <span className="value">{totalOdds}</span>
          </div>
          <div className="betslip-summary">
            <span className="label">Potential Return</span>
            <span className="value">₹{potentialReturn}</span>
          </div>
          <button
            className="betslip-place-btn"
            disabled={!stake || parseFloat(stake) <= 0}
            id="place-bet-btn"
            type="button"
            onClick={handlePlaceBet}
          >
            Place Bet
          </button>
        </div>
      )}
    </div>
  );
}
