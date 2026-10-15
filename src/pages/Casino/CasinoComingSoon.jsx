import { Link } from 'react-router-dom';
import '../../components/ProductUnavailable/ProductUnavailable.css';

/** Shown for /casino and /live-casino while CASINO_ENABLED is false (no licensed aggregator yet). */
export default function CasinoComingSoon() {
  return (
    <div className="product-unavailable" role="status">
      <div className="product-unavailable__card">
        <h1 className="product-unavailable__title">Casino is coming soon</h1>
        <p className="product-unavailable__message">
          Casino is gated until we integrate a licensed game aggregator for India. Slots and live dealer
          tables are not offered on OddsYra yet — sports and cricket betting stay fully available.
        </p>
        <Link to="/sports" className="product-unavailable__home">
          Browse sports
        </Link>
      </div>
    </div>
  );
}
