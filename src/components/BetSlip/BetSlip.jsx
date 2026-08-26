import { useState } from 'react';
import { IoClose, IoSettingsOutline } from '../../icons';
import { useBetSlip } from '../../context/BetSlipContext';
import BetSlipFooter from './BetSlipFooter';
import { MIN_STAKE_INR, BONUS_MIN_BET_ODDS, QUICK_STAKE_PRESETS, sanitizeStakeInput } from '../../utils/wageringRules';
import { formatOddsChangeAnnouncement, ODDS_STATUS } from '../../utils/oddsChangeHandler';
import './BetSlip.css';

const PER_BET_QUICK_STAKES = QUICK_STAKE_PRESETS;

function formatBetTime(timestamp) {
  const d = new Date(timestamp || Date.now());
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function ToggleRow({ label, checked, onChange }) {
  return (
    <label className="betslip-toggle-row">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`betslip-toggle${checked ? ' is-on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="betslip-toggle__knob" />
      </button>
    </label>
  );
}

export default function BetSlip({ showFooter = true, hidePerBetStakes = false }) {
  const {
    bets, removeBet, clearAll,
    betCount,
    betType, setBetType, singlesStakes, setSingleStake,
    betslipPrefs, setBetslipPref,
    multiConflicts,
    acceptOddsChange,
    acceptAllOddsChanges,
    hasPendingOddsAcceptance,
  } = useBetSlip();
  const [showSettings, setShowSettings] = useState(false);
  const pendingOddsCount = bets.filter((b) => b.oddsStatus === ODDS_STATUS.CHANGED).length;

  if (betCount === 0) return null;

  const showPerBetStakes = betType === 'singles' && !hidePerBetStakes;

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
          <div className="betslip-settings-panel__head">
            <strong>Settings</strong>
            <button
              type="button"
              className="betslip-settings-panel__close"
              onClick={() => setShowSettings(false)}
              aria-label="Close settings"
            >
              <IoClose />
            </button>
          </div>
          <ToggleRow
            label="Accept any odds change"
            checked={betslipPrefs.acceptAnyOddsChange}
            onChange={(v) => setBetslipPref('acceptAnyOddsChange', v)}
          />
          <ToggleRow
            label="Accept higher odds"
            checked={betslipPrefs.acceptHigherOdds}
            onChange={(v) => setBetslipPref('acceptHigherOdds', v)}
          />
          <div className="betslip-settings-panel__info">
            <p><strong>Min stake:</strong> ₹{MIN_STAKE_INR}</p>
            <p><strong>Bonus:</strong> odds ≥ {BONUS_MIN_BET_ODDS.toFixed(2)}, rotate 5× before withdrawing winnings</p>
            <p><strong>Free bet:</strong> any odds, like cash (profit only)</p>
            <p>Verify Aadhaar and PAN to withdraw. Bonus itself cannot be withdrawn.</p>
          </div>
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

      {pendingOddsCount > 1 && hasPendingOddsAcceptance && (
        <div className="betslip-accept-all-row">
          <p>Odds changed on {pendingOddsCount} selections</p>
          <button
            type="button"
            className="betslip-accept-all-btn"
            onClick={acceptAllOddsChanges}
          >
            Accept all updated odds
          </button>
        </div>
      )}

      <div className="betslip-body">
        {bets.map((bet) => {
          const conflict = multiConflicts.get(bet.id);
          const stakeVal = singlesStakes[bet.id] ?? '';
          const stakeNum = parseFloat(stakeVal) || 0;
          const possibleWin = stakeNum > 0 ? (stakeNum * Number(bet.odds)).toFixed(2) : '0.00';

          return (
            <div
              className={`betslip-bet${conflict ? ' betslip-bet--conflict' : ''}${bet.oddsChanged ? ' betslip-bet--odds-updated' : ''}`}
              key={bet.id}
            >
              {conflict && (
                <div className="betslip-bet-alert" role="alert">
                  <span className="betslip-bet-alert__icon">!</span>
                  <span>{conflict.message}</span>
                </div>
              )}

                  {bet.oddsStatus === ODDS_STATUS.CHANGED && !conflict && (
                <div
                  className="betslip-bet-alert betslip-bet-alert--odds-changed"
                  role="status"
                  aria-live="polite"
                >
                  <strong>Odds have changed.</strong>
                  <span className="betslip-bet-alert__detail">
                    {formatOddsChangeAnnouncement(bet)}
                  </span>
                </div>
              )}

              {bet.oddsChanged && bet.oddsStatus !== ODDS_STATUS.CHANGED && !conflict && (
                <div className="betslip-bet-alert betslip-bet-alert--info" role="status">
                  Odds have changed. Review the new price below.
                </div>
              )}

              <div className="betslip-bet-meta">
                <span>{formatBetTime(bet.timestamp)}</span>
                <button className="betslip-bet-remove" onClick={() => removeBet(bet.id)} type="button" aria-label="Remove bet">
                  <IoClose />
                </button>
              </div>

              <div className="betslip-bet-market">{bet.marketName}</div>

              <div className="betslip-bet-selection-row">
                <span className="betslip-bet-selection">{bet.selectionName}</span>
                <span className={`betslip-bet-odds${bet.oddsStatus === ODDS_STATUS.CHANGED ? ' betslip-bet-odds--updated' : ''}`}>
                  {bet.oddsStatus === ODDS_STATUS.CHANGED && bet.previousOdds != null && (
                    <>
                      <span className="betslip-bet-odds-old" aria-hidden="true">
                        <s>{Number(bet.previousOdds).toFixed(2)}</s>
                      </span>
                      <span className="betslip-bet-odds-arrow" aria-hidden="true">→</span>
                    </>
                  )}
                  <strong>{Number(bet.odds).toFixed(2)}</strong>
                </span>
              </div>

              {bet.oddsStatus === ODDS_STATUS.CHANGED && (
                <div className="betslip-odds-actions">
                  <button
                    type="button"
                    className="betslip-accept-odds-btn"
                    onClick={() => acceptOddsChange(bet.id)}
                  >
                    Accept New Odds
                  </button>
                  <button
                    type="button"
                    className="betslip-bet-clear-btn"
                    onClick={() => removeBet(bet.id)}
                  >
                    Cancel
                  </button>
                </div>
              )}

              <div className="betslip-bet-match">{bet.matchName}</div>

              {conflict && (
                <button type="button" className="betslip-bet-clear-btn" onClick={() => removeBet(bet.id)}>
                  Clear the selection
                </button>
              )}

              {showPerBetStakes && (
                <div className="betslip-bet-stake-block">
                  <div className="betslip-bet-quick-stakes">
                    {PER_BET_QUICK_STAKES.map((amount) => (
                      <button
                        key={amount}
                        type="button"
                        className={`betslip-bet-quick-stake${String(amount) === String(stakeVal) ? ' is-active' : ''}`}
                        onClick={() => setSingleStake(bet.id, String(amount))}
                      >
                        ₹{amount >= 1000 ? `${amount / 1000}K` : amount}
                      </button>
                    ))}
                  </div>
                  <label className="betslip-bet-stake-row" htmlFor={`stake-${bet.id}`}>
                    <span>Bet Total: ₹</span>
                    <input
                      id={`stake-${bet.id}`}
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={stakeVal}
                      onChange={(e) => setSingleStake(bet.id, sanitizeStakeInput(e.target.value))}
                      placeholder="Enter amount"
                    />
                  </label>
                  <p className="betslip-bet-winnings">
                    Possible winnings: <strong>INR {possibleWin}</strong>
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showFooter && <BetSlipFooter />}
    </div>
  );
}
