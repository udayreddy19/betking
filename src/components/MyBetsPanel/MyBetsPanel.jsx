import { useEffect, useRef } from 'react';
import { IoClose } from '../../icons';
import { useBetSlip } from '../../context/BetSlipContext';
import './MyBetsPanel.css';

export default function MyBetsPanel() {
  const { placedBets, myBetsCount, isMyBetsOpen, closeMyBets } = useBetSlip();
  const panelRef = useRef(null);

  useEffect(() => {
    if (!isMyBetsOpen) return undefined;

    const handleEscape = (event) => {
      if (event.key === 'Escape') closeMyBets();
    };

    const handleClickOutside = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        const trigger = event.target.closest?.('[data-my-bets-trigger]');
        if (!trigger) closeMyBets();
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMyBetsOpen, closeMyBets]);

  if (!isMyBetsOpen) return null;

  return (
    <>
      <div className="my-bets-backdrop" onClick={closeMyBets} aria-hidden="true" />
      <div className="my-bets-panel" ref={panelRef} role="dialog" aria-modal="true" aria-label="My bets">
        <div className="my-bets-header">
          <h3>My bets <span className="my-bets-count">{myBetsCount}</span></h3>
          <button type="button" className="my-bets-close" onClick={closeMyBets} aria-label="Close my bets">
            <IoClose />
          </button>
        </div>

        <div className="my-bets-body">
          {placedBets.length === 0 ? (
            <div className="my-bets-empty">
              <div className="my-bets-empty-icon">📋</div>
              <h4>No active bets</h4>
              <p>Your placed bets will appear here</p>
            </div>
          ) : (
            placedBets.map((placed) => (
              <div className={`my-bets-card my-bets-card--${placed.status || 'pending'}`} key={placed.id}>
                <div className="my-bets-card-top">
                  <div className="my-bets-card-badges">
                    <span className="my-bets-type-badge">{placed.type === 'multi' ? 'MULTI' : 'SINGLE'}</span>
                    <span className={`my-bets-status-badge my-bets-status-badge--${placed.status || 'pending'}`}>
                      {(placed.status || 'pending').toUpperCase()}
                    </span>
                  </div>
                  <span className="my-bets-time">
                    {new Date(placed.placedAt).toLocaleString('en-IN')}
                  </span>
                </div>

                {placed.legs.map((leg) => (
                  <div key={leg.id} className="my-bets-leg">
                    <div className="my-bets-market">{leg.marketName}</div>
                    <div className="my-bets-selection-row">
                      <span className="my-bets-selection">{leg.selectionName}</span>
                      <span className="my-bets-odds">{Number(leg.odds).toFixed(2)}</span>
                    </div>
                    <div className="my-bets-match">{leg.matchName}</div>
                  </div>
                ))}

                <div className="my-bets-summary">
                  <span className="label">Stake</span>
                  <span className="value">₹{placed.stake.toFixed(2)}</span>
                </div>
                {placed.type === 'multi' && (
                  <div className="my-bets-summary">
                    <span className="label">Total odds</span>
                    <span className="value">{Number(placed.totalOdds).toFixed(2)}</span>
                  </div>
                )}
                <div className="my-bets-summary">
                  <span className="label">Potential return</span>
                  <span className="value">₹{placed.potentialReturn.toFixed(2)}</span>
                </div>
                {placed.status === 'won' && placed.payout > 0 && (
                  <div className="my-bets-summary my-bets-summary--won">
                    <span className="label">Payout</span>
                    <span className="value">₹{placed.payout.toFixed(2)}</span>
                  </div>
                )}
                {placed.settledAt && (
                  <div className="my-bets-settled-at">
                    Settled {new Date(placed.settledAt).toLocaleString('en-IN')}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
