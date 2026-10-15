import { Link } from 'react-router-dom';
import './ProductUnavailable.css';

/**
 * Shown when a product route is hit while that product is disabled,
 * when both Wallet and Betting are off (platform unavailable), or when the
 * product configuration API could not be reached (`retry` state).
 */
export default function ProductUnavailable({
  title = 'Currently Unavailable',
  message = 'No products are currently enabled. Please try again later.',
  product = null,
  onRetry = null,
  retrying = false,
}) {
  const isLoadFailure = typeof onRetry === 'function';
  const resolvedTitle = isLoadFailure
    ? 'We could not load OddsYra'
    : product
      ? `${product === 'wallet' ? 'Wallet' : 'Betting'} is currently unavailable`
      : title;
  const resolvedMessage = isLoadFailure
    ? 'We could not reach the server to check which services are available. Please check your connection and try again.'
    : product
      ? 'This product is currently unavailable. Please try again later.'
      : message;

  return (
    <div className="product-unavailable" role="status">
      <div className="product-unavailable__card">
        <h1 className="product-unavailable__title">{resolvedTitle}</h1>
        <p className="product-unavailable__message">{resolvedMessage}</p>
        {isLoadFailure && (
          <button
            type="button"
            className="product-unavailable__home"
            onClick={onRetry}
            disabled={retrying}
            style={{ border: 0, cursor: retrying ? 'wait' : 'pointer', marginRight: 8 }}
          >
            {retrying ? 'Retrying…' : 'Retry'}
          </button>
        )}
        <Link to="/" className="product-unavailable__home">
          Back to home
        </Link>
      </div>
    </div>
  );
}
