import { Link, useLocation } from 'react-router-dom';
import { UpiLogo, GPayLogo, PhonePeLogo, PaytmLogo } from '../PaymentLogos/PaymentLogos';
import BrandLogo from '../BrandLogo/BrandLogo';
import { useFeatureFlags } from '../../context/FeatureFlagsContext';
import './Footer.css';

export default function Footer() {
  const location = useLocation();
  const { isEnabled, isSportEnabled } = useFeatureFlags();
  if (location.pathname.startsWith('/admin')) return null;

  const sportLinks = [
    { to: '/sports?sport=cricket', id: 'cricket', label: 'Cricket' },
    { to: '/sports?sport=soccer', id: 'soccer', label: 'Soccer' },
    { to: '/sports?sport=tennis', id: 'tennis', label: 'Tennis' },
    { to: '/sports?sport=basketball', id: 'basketball', label: 'Basketball' },
    { to: '/sports?sport=kabaddi', id: 'kabaddi', label: 'Kabaddi' },
  ].filter((s) => isSportEnabled(s.id));

  return (
    <footer className="footer" id="main-footer">
      <div className="footer-inner">
        <div className="footer-grid">
          <div className="footer-section">
            <h4>Sports</h4>
            {sportLinks.map((s) => (
              <Link key={s.id} to={s.to}>{s.label}</Link>
            ))}
          </div>
          <div className="footer-section">
            <h4>More</h4>
            <Link to="/live-betting">Live Betting</Link>
            <Link to="/bets">My Bets</Link>
            {isEnabled('referral_system_ui', true) && <Link to="/invite">Invite</Link>}
            {isEnabled('promotion_engine_ui', true) && <Link to="/promotions">Promotions</Link>}
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
            {isEnabled('responsible_gaming_ui', true) && (
              <Link to="/responsible-gaming">Responsible Gaming</Link>
            )}
          </div>
        </div>

        <hr className="footer-divider" />

        <div className="footer-bottom">
          <p className="footer-brand">
            <BrandLogo size={32} className="footer-logo" />
            © 2026 OddsYra. All rights reserved.
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
            OddsYra promotes responsible gaming. Gambling can be addictive. Play responsibly.
            Must be 18+ to register and play.
          </p>
        </div>
      </div>
    </footer>
  );
}
