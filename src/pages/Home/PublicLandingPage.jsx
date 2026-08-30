import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { FiLock, FiHelpCircle } from '../../icons';
import './PublicLandingPage.css';

export default function PublicLandingPage() {
  const { openLoginModal } = useAuth();

  return (
    <div className="private-landing-page">
      {/* ── HERO SECTION ── */}
      <section className="private-hero">
        <div className="private-container">
          <div className="private-badge">
            <span className="private-badge-dot" />
            <span>PLATFORM NOTICE</span>
          </div>

          <h1 className="private-hero-title">
            ODDSYRA
          </h1>

          <h2 className="private-hero-subheadline">
            Our platform is currently undergoing updates and verification.
          </h2>

          <p className="private-hero-description">
            We are currently preparing the next phase of the ODDSYRA platform. Access is temporarily limited while system updates and verification processes are completed.
          </p>

          <div className="private-hero-actions">
            <button
              type="button"
              onClick={openLoginModal}
              className="private-btn-primary"
              id="private-login-btn"
            >
              <FiLock className="btn-icon" />
              <span>LOG IN</span>
            </button>
            <Link to="/help" className="private-btn-outline">
              <FiHelpCircle className="btn-icon" />
              <span>SUPPORT</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="private-footer">
        <div className="private-container">
          <div className="private-footer-inner">
            <div className="private-footer-copy">
              © {new Date().getFullYear()} ODDSYRA. All rights reserved.
            </div>
            <div className="private-footer-links">
              <Link to="/help">Support</Link>
              <Link to="/privacy">Privacy Policy</Link>
              <Link to="/terms">Terms</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
