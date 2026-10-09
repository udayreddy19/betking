import { Link } from 'react-router-dom';
import './ProductUnavailable.css';

/**
 * Shown when a product route is hit while that product is disabled,
 * or when both Wallet and Betting are off (platform unavailable).
 */
export default function ProductUnavailable({
  title = 'Currently Unavailable',
  message = 'No products are currently enabled. Please try again later.',
  product = null,
}) {
  const resolvedTitle = product
    ? `${product === 'wallet' ? 'Wallet' : 'Betting'} is currently unavailable`
    : title;
  const resolvedMessage = product
    ? 'This product is currently unavailable. Please try again later.'
    : message;

  return (
    <div className="product-unavailable" role="status">
      <div className="product-unavailable__card">
        <h1 className="product-unavailable__title">{resolvedTitle}</h1>
        <p className="product-unavailable__message">{resolvedMessage}</p>
        <Link to="/" className="product-unavailable__home">
          Back to home
        </Link>
      </div>
    </div>
  );
}
