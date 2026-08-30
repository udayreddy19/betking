import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { FiCheckCircle, FiShield, FiLock, FiCpu, FiHelpCircle } from '../../icons';
import './PublicLandingPage.css';

export default function PublicLandingPage() {
  const { openLoginModal } = useAuth();

  return (
    <div className="private-landing-page">
      {/* ── 1. HERO SECTION ── */}
      <section className="private-hero">
        <div className="private-container">
          <div className="private-badge">
            <span className="private-badge-dot" />
            <span>PRIVATE ACCESS MODE</span>
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

      {/* ── 2. STATUS SECTION ── */}
      <section className="private-status-section">
        <div className="private-container">
          <div className="private-status-grid">
            <div className="private-status-card">
              <div className="status-card-icon status-green">
                <FiCheckCircle />
              </div>
              <div className="status-card-content">
                <span className="status-card-label">Platform Updates</span>
                <h3 className="status-card-state">In progress</h3>
                <p className="status-card-sub">Infrastructure and system optimization</p>
              </div>
            </div>

            <div className="private-status-card">
              <div className="status-card-icon status-green">
                <FiCheckCircle />
              </div>
              <div className="status-card-content">
                <span className="status-card-label">System Verification</span>
                <h3 className="status-card-state">In progress</h3>
                <p className="status-card-sub">Compliance and integrity validations</p>
              </div>
            </div>

            <div className="private-status-card">
              <div className="status-card-icon status-amber">
                <FiShield />
              </div>
              <div className="status-card-content">
                <span className="status-card-label">Private Access</span>
                <h3 className="status-card-state">Temporarily enabled</h3>
                <p className="status-card-sub">Restricted to authorized accounts</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. NOTICE SECTION ── */}
      <section className="private-notice-section">
        <div className="private-container">
          <div className="private-notice-box">
            <div className="notice-icon">
              <FiCpu />
            </div>
            <div className="notice-content">
              <h4>System Information</h4>
              <p>
                Public registrations are paused during this maintenance cycle. If you are an authorized system operator or tester, please log in with your assigned credentials. For inquiries, please contact our support desk.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. FOOTER ── */}
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
