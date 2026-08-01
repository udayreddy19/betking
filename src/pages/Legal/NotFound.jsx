import { Link } from 'react-router-dom';
import './LegalPage.css';

export default function NotFound() {
  return (
    <div className="legal-page container not-found-page">
      <h1>404</h1>
      <p>Page not found.</p>
      <div className="not-found-links">
        <Link to="/">Home</Link>
        <Link to="/sports">Sports</Link>
        <Link to="/casino">Casino</Link>
        <Link to="/help">Help</Link>
      </div>
    </div>
  );
}
