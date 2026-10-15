import { Link } from 'react-router-dom';
import '../../components/ProductUnavailable/ProductUnavailable.css';

/** Shown for /casino and /live-casino while CASINO_ENABLED is false (no licensed aggregator yet). */
export default function CasinoComingSoon() {
  return (
    <div className="product-unavailable" role="status">
      <div className="product-unavailable__card">
        <h1 className="product-unavailable__title">Casino is coming soon</h1>
        <p className="product-unavailable__message">
          Casino games are not available yet. In the meantime, enjoy live cricket and sports betting on OddsYra.
        </p>
        <Link to="/sports" className="product-unavailable__home">
          Browse sports
        </Link>
      </div>
    </div>
  );
}
