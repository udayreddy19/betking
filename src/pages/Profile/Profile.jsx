import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import '../Legal/LegalPage.css';
import './Profile.css';

export default function Profile() {
  const { user, isLoggedIn } = useAuth();

  if (!isLoggedIn) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="profile-page container" id="profile-page">
      <div className="profile-card">
        <div className="profile-avatar">👤</div>
        <h1>{user.displayName}</h1>
        <p className="profile-email">{user.email}</p>

        <div className="profile-stats">
          <div className="profile-stat">
            <span className="label">Balance</span>
            <span className="value">₹{user.balance.toLocaleString('en-IN')}</span>
          </div>
          <div className="profile-stat">
            <span className="label">Loyalty</span>
            <span className="value">{user.loyaltyRank} · Lv.{user.loyaltyLevel}</span>
          </div>
          <div className="profile-stat">
            <span className="label">Coins</span>
            <span className="value">{user.coins ?? 0}</span>
          </div>
        </div>

        <div className="profile-actions">
          <Link to="/sports" className="profile-link-btn">View sports</Link>
          <Link to="/help" className="profile-link-btn outline">Help centre</Link>
        </div>
      </div>
    </div>
  );
}
