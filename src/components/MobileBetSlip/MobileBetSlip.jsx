import { useEffect } from 'react';
import { useBetSlip } from '../../context/BetSlipContext';
import BetSlip from '../BetSlip/BetSlip';
import BetSlipFooter from '../BetSlip/BetSlipFooter';
import { IoClose } from '../../icons';
import './MobileBetSlip.css';

export default function MobileBetSlip() {
  const { betCount, isMobileOpen, setIsMobileOpen, openMobileBetslip } = useBetSlip();

  useEffect(() => {
    document.body.classList.toggle('mobile-betslip-open', isMobileOpen);
    return () => document.body.classList.remove('mobile-betslip-open');
  }, [isMobileOpen]);

  return (
    <>
      <button
        type="button"
        className="mobile-betslip-fab"
        onClick={openMobileBetslip}
        aria-label="Open betslip"
      >
        Betslip
        {betCount > 0 && <span className="mobile-betslip-badge">{betCount}</span>}
      </button>

      {isMobileOpen && (
        <div className="mobile-betslip-overlay" onClick={() => setIsMobileOpen(false)}>
          <div className="mobile-betslip-sheet" onClick={e => e.stopPropagation()}>
            <button
              type="button"
              className="mobile-betslip-close"
              onClick={() => setIsMobileOpen(false)}
              aria-label="Close betslip"
            >
              <IoClose />
            </button>
            <div className="mobile-betslip-main">
              <BetSlip showFooter={false} />
            </div>
            {betCount > 0 && (
              <div className="mobile-betslip-cta">
                <BetSlipFooter onPlaced={() => setIsMobileOpen(false)} />
              </div>
            )}
          </div>
        </div>
      )}

      {betCount > 0 && !isMobileOpen && (
        <div className="mobile-betslip-hint">Tap Betslip to view your selections</div>
      )}
    </>
  );
}
