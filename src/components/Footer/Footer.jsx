import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { UpiLogo, GPayLogo, PhonePeLogo, PaytmLogo } from '../PaymentLogos/PaymentLogos';
import BrandLogo from '../BrandLogo/BrandLogo';
import './Footer.css';

export default function Footer() {
  const location = useLocation();
  const { isLoggedIn } = useAuth();

  if (location.pathname.startsWith('/admin')) return null;
  if (!isLoggedIn && location.pathname === '/') return null;

  if (!isLoggedIn) {
    return (
      <footer className="footer" id="main-footer">
        <div className="footer-inner">
          <div className="footer-bottom" style={{ borderTop: 'none', paddingTop: 0, paddingBottom: 0 }}>
            <p className="footer-brand">
              <BrandLogo size={28} className="footer-logo" />
              © {new Date().getFullYear()} ODDSYRA. All rights reserved.
            </p>
            <div className="footer-links" style={{ display: 'flex', gap: '1.5rem' }}>
              <Link to="/help">Support</Link>
              <Link to="/privacy">Privacy Policy</Link>
              <Link to="/terms">Terms</Link>
            </div>
          </div>
        </div>
      </footer>
    );
  }

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
            <Link to="/profile?tab=support">My support tickets</Link>
            <a href="mailto:support@oddsyra.com">Email support@oddsyra.com</a>
            <button
              type="button"
              className="footer-link-btn"
              onClick={() => window.dispatchEvent(new CustomEvent('oddsyra:open-support-chat'))}
            >
              Live chat
            </button>
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
          <p className="footer-brand">
            <BrandLogo size={32} className="footer-logo" />
            © {new Date().getFullYear()} ODDSYRA. All rights reserved.
          </p>
          <div className="footer-payments" aria-label="Accepted payment methods">
            <span className="footer-payment-badge" title="UPI Instant Payment"><UpiLogo height={34} width={112} /></span>
            <span className="footer-payment-badge" title="Google Pay"><GPayLogo height={34} width={112} /></span>
            <span className="footer-payment-badge" title="PhonePe"><PhonePeLogo height={34} width={112} /></span>
            <span className="footer-payment-badge" title="Paytm Wallet & UPI"><PaytmLogo height={34} width={112} /></span>
          </div>
        </div>

        <div className="footer-responsible">
          <div className="footer-age-badge">18+</div>
          <p>
            ODDSYRA promotes responsible gaming. Gambling can be addictive. Play responsibly.
            Must be 18+ to register and play.
          </p>
        </div>
      </div>
    </footer>
  );
}
