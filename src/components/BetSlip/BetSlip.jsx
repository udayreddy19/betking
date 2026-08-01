import { IoClose, IoSettingsOutline } from 'react-icons/io5';
import { useBetSlip } from '../../context/BetSlipContext';
import BetSlipFooter from './BetSlipFooter';
import './BetSlip.css';

function formatBetTime(timestamp) {
  const d = new Date(timestamp);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export default function BetSlip() {
  const {
    bets, removeBet, clearAll, activeTab, setActiveTab,
    betCount, placedBets, myBetsCount,
    betType, setBetType, singlesStakes, setSingleStake,
  } = useBetSlip();

  return (
    <div className="betslip" id="betslip">
      <div className="betslip-header">
        <button
          type="button"
          className={`betslip-tab ${activeTab === 'betslip' ? 'active' : ''}`}
          onClick={() => setActiveTab('betslip')}
        >
          Betslip <span className="tab-count">{betCount}</span>
        </button>
        <button
          type="button"
          className={`betslip-tab ${activeTab === 'mybets' ? 'active' : ''}`}
          onClick={() => setActiveTab('mybets')}
        >
          My bets <span className="tab-count">{myBetsCount}</span>
        </button>
        {betCount > 0 && (
          <button type="button" className="betslip-clear" onClick={clearAll}>Clear all</button>
        )}
        <button className="betslip-settings" type="button" aria-label="Betslip settings">
          <IoSettingsOutline />
        </button>
      </div>

      {activeTab === 'betslip' && betCount > 0 && (
        <div className="betslip-type-toggle">
          <button
            type="button"
            className={betType === 'singles' ? 'active' : ''}
            onClick={() => setBetType('singles')}
          >
            Singles
          </button>
          <button
            type="button"
            className={betType === 'multi' ? 'active' : ''}
            onClick={() => setBetType('multi')}
          >
            Multi
          </button>
        </div>
      )}

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
                <div className="betslip-bet-top">
                  <div className="betslip-bet-meta">
                    <span className="betslip-bet-sport-icon">🏏</span>
                    <span className="betslip-bet-time">{formatBetTime(bet.timestamp)}</span>
                  </div>
                  <button className="betslip-bet-remove" onClick={() => removeBet(bet.id)} type="button" aria-label="Remove bet">
                    <IoClose />
                  </button>
                </div>
                <div className="betslip-bet-market">{bet.marketName}</div>
                <div className="betslip-bet-selection-row">
                  <span className="betslip-bet-selection">{bet.selectionName}</span>
                  <span className="betslip-bet-odds">{Number(bet.odds).toFixed(2)}</span>
                </div>
                {betType === 'singles' && (
                  <div className="betslip-bet-stake-row">
                    <label htmlFor={`stake-${bet.id}`}>Stake (₹)</label>
                    <input
                      id={`stake-${bet.id}`}
                      type="number"
                      min="0"
                      value={singlesStakes[bet.id] ?? ''}
                      onChange={e => setSingleStake(bet.id, e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                )}
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
                <span className="betslip-bet-type-badge">{placed.type === 'multi' ? 'MULTI' : 'SINGLE'}</span>
                <span className="placed-bet-time">
                  {new Date(placed.placedAt).toLocaleString('en-IN')}
                </span>
              </div>
              {placed.legs.map(leg => (
                <div key={leg.id} className="placed-bet-leg">
                  <div className="betslip-bet-market">{leg.marketName}</div>
                  <div className="betslip-bet-selection-row">
                    <span className="betslip-bet-selection">{leg.selectionName}</span>
                    <span className="betslip-bet-odds">{Number(leg.odds).toFixed(2)}</span>
                  </div>
                  <div className="betslip-bet-match">{leg.matchName}</div>
                </div>
              ))}
              <div className="betslip-summary">
                <span className="label">Stake</span>
                <span className="value">₹{placed.stake.toFixed(2)}</span>
              </div>
              {placed.type === 'multi' && (
                <div className="betslip-summary">
                  <span className="label">Total odds</span>
                  <span className="value">{Number(placed.totalOdds).toFixed(2)}</span>
                </div>
              )}
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
