import { Link } from 'react-router-dom';
import './Fantasy.css';

export default function Fantasy() {
  return (
    <div className="fantasy-page container" id="fantasy-page">
      <div className="fantasy-hero">
        <span className="fantasy-icon">🏆</span>
        <h1>Fantasy Cricket</h1>
        <p>Create your dream team, join contests, and win real cash prizes.</p>
        <div className="fantasy-actions">
          <Link to="/sports" className="fantasy-btn primary">Browse live matches</Link>
          <Link to="/promotions" className="fantasy-btn outline">View promotions</Link>
        </div>
        <p className="fantasy-note">Full fantasy contests coming soon. Meanwhile, place bets on live cricket from the Sports page.</p>
      </div>
    </div>
  );
}
