import { IoClose, IoSettingsOutline } from 'react-icons/io5';
import { useBetSlip } from '../../context/BetSlipContext';
import BetSlipFooter from './BetSlipFooter';
import './BetSlip.css';

export default function BetSlip() {
  const {
    bets, removeBet, clearAll, activeTab, setActiveTab,
    betCount, placedBets, myBetsCount,
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

      {activeTab === 'betslip' && <BetSlipFooter />}
    </div>
  );
}
