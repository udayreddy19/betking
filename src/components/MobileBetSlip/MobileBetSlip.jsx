import { useBetSlip } from '../../context/BetSlipContext';
import BetSlip from '../BetSlip/BetSlip';
import { IoClose } from '../../icons';
import './MobileBetSlip.css';

export default function MobileBetSlip() {
  const { betCount, isMobileOpen, setIsMobileOpen, openMobileBetslip } = useBetSlip();

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
            <BetSlip />
          </div>
        </div>
      )}

      {betCount > 0 && !isMobileOpen && (
        <div className="mobile-betslip-hint">Tap Betslip to view your selections</div>
      )}
    </>
  );
}
