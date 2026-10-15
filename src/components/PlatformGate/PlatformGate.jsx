import { useLocation } from 'react-router-dom';
import { useProducts } from '../../context/ProductContext';
import ProductUnavailable from '../ProductUnavailable/ProductUnavailable';
import { isPlatformGateExemptPath, platformGateDecision } from '../../utils/productConfigLogic';

function GateLoader() {
  return <div className="page-loader" role="status">Loading…</div>;
}

/**
 * Platform-level product gate.
 * Access is allowed when Betting OR Wallet is enabled (wallet-only users get the wallet home).
 * Only when both are off do we show "Currently Unavailable"; if the product API itself failed
 * and we have no trustworthy config we show a retry state instead of a permanent "disabled".
 */
export default function PlatformGate({ children }) {
  const location = useLocation();
  const {
    ready, walletEnabled, bettingEnabled, pgReviewMode, softwarePlatformEnabled, loadError, retry,
  } = useProducts();
  const decision = platformGateDecision({
    ready,
    walletEnabled,
    bettingEnabled,
    loadError,
    pgReviewMode,
    softwarePlatformEnabled,
    isExempt: isPlatformGateExemptPath(location.pathname || '/'),
  });

  if (decision === 'loading') return <GateLoader />;
  if (decision === 'retry') return <ProductUnavailable onRetry={retry} />;
  if (decision === 'unavailable') return <ProductUnavailable />;
  return children;
}
