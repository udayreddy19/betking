import { IoClose, IoSettingsOutline } from 'react-icons/io5';
import { useBetSlip } from '../../context/BetSlipContext';
import './BetSlip.css';

export default function BetSlip() {
  const {
    bets, removeBet, clearAll, activeTab, setActiveTab,
    stake, setStake, totalOdds, potentialReturn, betCount,
  } = useBetSlip();

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
          My bets <span className="tab-count">0</span>
        </button>
        {betCount > 0 && (
          <button className="betslip-clear" onClick={clearAll}>Clear all</button>
        )}
        <button className="betslip-settings">
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
                  <button className="betslip-bet-remove" onClick={() => removeBet(bet.id)}>
                    <IoClose />
                  </button>
                </div>
                <div className="betslip-bet-selection">{bet.selectionName}</div>
                <div className="betslip-bet-match">{bet.matchName}</div>
                <div className="betslip-bet-odds">@ {bet.odds.toFixed(2)}</div>
              </div>
            ))
          )
        ) : (
          <div className="betslip-empty">
            <div className="betslip-empty-icon">📋</div>
            <h4>No active bets</h4>
            <p>Your placed bets will appear here</p>
          </div>
        )}
      </div>

      {activeTab === 'betslip' && betCount > 0 && (
        <div className="betslip-footer">
          <div className="betslip-stake">
            <label>Stake (₹)</label>
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
          <button className="betslip-place-btn" disabled={!stake || parseFloat(stake) <= 0} id="place-bet-btn">
            Place Bet
          </button>
        </div>
      )}
    </div>
  );
}
