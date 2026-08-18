import { useState } from 'react';
import { IoClose, IoSettingsOutline } from '../../icons';
import SportIcon from '../SportIcon/SportIcon';
import { useBetSlip } from '../../context/BetSlipContext';
import BetSlipFooter from './BetSlipFooter';
import { MIN_STAKE_INR, BONUS_MIN_BET_ODDS, BONUS_MIN_WITHDRAW_ODDS } from '../../utils/wageringRules';
import './BetSlip.css';

function formatBetTime(timestamp) {
  const d = new Date(timestamp);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export default function BetSlip({ showFooter = true }) {
  const {
    bets, removeBet, clearAll,
    betCount,
    betType, setBetType, singlesStakes, setSingleStake,
  } = useBetSlip();
  const [showSettings, setShowSettings] = useState(false);

  if (betCount === 0) return null;

  return (
    <div className="betslip" id="betslip">
      <div className="betslip-header">
        <div className="betslip-title">
          Betslip <span className="tab-count">{betCount}</span>
        </div>
        {betCount > 0 && (
          <button type="button" className="betslip-clear" onClick={clearAll}>Clear all</button>
        )}
        <button
          className="betslip-settings"
          type="button"
          aria-label="Betslip settings"
          aria-expanded={showSettings}
          onClick={() => setShowSettings((v) => !v)}
        >
          <IoSettingsOutline />
        </button>
      </div>

      {showSettings && (
        <div className="betslip-settings-panel">
          <p><strong>Min stake:</strong> ₹{MIN_STAKE_INR}</p>
          <p><strong>Bonus/Freebet:</strong> odds ≥ {BONUS_MIN_BET_ODDS.toFixed(2)}</p>
          <p><strong>Withdrawable bonus wins:</strong> odds ≥ {BONUS_MIN_WITHDRAW_ODDS.toFixed(2)}</p>
          <p>Deposits must be wagered before withdrawal. Only Winnings can be withdrawn.</p>
        </div>
      )}

      {betCount > 0 && (
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
        {betCount === 0 ? (
          <div className="betslip-empty">
            <div className="betslip-empty-icon">🎟️</div>
            <h4>Your betslip is empty.</h4>
            <p>Once you select a bet it will show up here</p>
          </div>
        ) : (
          bets.map(bet => (
            <div className="betslip-bet" key={bet.id}>
              <div className="betslip-bet-top">
                <div className="betslip-bet-market">{bet.marketName}</div>
                <button className="betslip-bet-remove" onClick={() => removeBet(bet.id)} type="button" aria-label="Remove bet">
                  <IoClose />
                </button>
              </div>
              <div className="betslip-bet-selection-row">
                <span className="betslip-bet-selection">{bet.selectionName}</span>
                <span className="betslip-bet-odds">{Number(bet.odds).toFixed(2)}</span>
              </div>
              {betType === 'singles' && (
                <div className="betslip-bet-stake-row">
                  <label htmlFor={`stake-${bet.id}`}>Stake</label>
                  <input
                    id={`stake-${bet.id}`}
                    type="number"
                    min={MIN_STAKE_INR}
                    value={singlesStakes[bet.id] ?? ''}
                    onChange={e => setSingleStake(bet.id, e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {showFooter && <BetSlipFooter />}
    </div>
  );
}
