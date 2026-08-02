import { Link } from 'react-router-dom';
import './Footer.css';

export default function Footer() {
  return (
    <footer className="footer" id="main-footer">
      <div className="footer-inner">
        <div className="footer-grid">
          <div className="footer-section">
            <h4>Sports</h4>
            <Link to="/sports?sport=cricket">Cricket</Link>
            <Link to="/sports?sport=soccer">Soccer</Link>
            <Link to="/sports?sport=tennis">Tennis</Link>
            <Link to="/sports?sport=basketball">Basketball</Link>
            <Link to="/sports?sport=kabaddi">Kabaddi</Link>
          </div>
          <div className="footer-section">
            <h4>More</h4>
            <Link to="/live-betting">Live Betting</Link>
            <Link to="/fantasy">Fantasy</Link>
            <Link to="/promotions">Promotions</Link>
            <Link to="/profile">My Profile</Link>
          </div>
          <div className="footer-section">
            <h4>Support</h4>
            <Link to="/help">Help Center</Link>
            <Link to="/help">FAQ</Link>
            <Link to="/promotions">Promotions</Link>
          </div>
          <div className="footer-section">
            <h4>About</h4>
            <Link to="/terms">Terms & Conditions</Link>
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/responsible-gaming">Responsible Gaming</Link>
          </div>
        </div>

        <hr className="footer-divider" />

        <div className="footer-bottom">
          <p>© 2026 BetKing. All rights reserved.</p>
          <div className="footer-payments">
            <div className="footer-payment-icon" style={{ background: '#22c55e', color: '#fff', fontWeight: 'bold' }}>UPI</div>
            <div className="footer-payment-icon" style={{ background: '#4285f4', color: '#fff', fontWeight: 'bold' }}>GPay</div>
            <div className="footer-payment-icon" style={{ background: '#5f259f', color: '#fff', fontWeight: 'bold' }}>PhonePe</div>
            <div className="footer-payment-icon" style={{ background: '#00baf2', color: '#fff', fontWeight: 'bold' }}>Paytm</div>
          </div>
        </div>

        <div className="footer-responsible">
          <div className="footer-age-badge">18+</div>
          <p>
            BetKing promotes responsible gaming. Gambling can be addictive. Play responsibly.
            Must be 18+ to register and play.
          </p>
        </div>
      </div>
    </footer>
  );
}
