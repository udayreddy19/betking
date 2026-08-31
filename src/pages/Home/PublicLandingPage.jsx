import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './PublicLandingPage.css';

export default function PublicLandingPage() {
  const { openLoginModal } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="landing-page">
      {/* ── 1. HERO SECTION ── */}
      <section className="landing-hero">
        <div className="landing-container">
          <div className="landing-hero-badge">
            <span>⚡</span>
            <span>NEXT-GEN SPORTS PLATFORM</span>
          </div>

          <h1 className="landing-hero-title">
            THE NEXT GENERATION SPORTS PLATFORM
          </h1>

          <p className="landing-hero-subtitle">
            Join ODDSYRA and access a seamless sports experience with real-time match updates, instant settlements, and exclusive rewards.
          </p>

          <div className="landing-hero-actions">
            <Link to="/register" className="landing-btn-primary">
              <span>CREATE ACCOUNT</span>
              <span>➔</span>
            </Link>
            <button
              type="button"
              onClick={openLoginModal}
              className="landing-btn-secondary"
            >
              LOGIN TO DASHBOARD
            </button>
          </div>
        </div>
      </section>

      {/* ── 2. TRUST STATS STRIP ── */}
      <section className="landing-stats-strip">
        <div className="landing-container">
          <div className="landing-stats-grid">
            <div className="landing-stat-item">
              <h3>Real-Time</h3>
              <p>Ultra-Low Latency Match Feeds</p>
            </div>
            <div className="landing-stat-item">
              <h3>Instant</h3>
              <p>Automated UPI & Bank Deposits</p>
            </div>
            <div className="landing-stat-item">
              <h3>Discrete</h3>
              <p>Dedicated Free Bet & Bonus Engine</p>
            </div>
            <div className="landing-stat-item">
              <h3>24 / 7</h3>
              <p>Round-the-Clock Dedicated Support</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. HOW IT WORKS ── */}
      <section id="how-it-works" className="landing-section">
        <div className="landing-container">
          <div className="landing-section-header">
            <div className="landing-section-tag">GETTING STARTED</div>
            <h2 className="landing-section-title">How It Works</h2>
            <p className="landing-section-subtitle">
              Get up and running on OddsYra in four straightforward steps.
            </p>
          </div>

          <div className="landing-steps-grid">
            <div className="landing-step-card">
              <div className="landing-step-number">1</div>
              <h4>Create Account</h4>
              <p>Quick and seamless sign up with your email or Google account in under 60 seconds.</p>
            </div>

            <div className="landing-step-card">
              <div className="landing-step-number">2</div>
              <h4>Complete Verification</h4>
              <p>Automated, secure KYC verification to protect your account and ensure fair play.</p>
            </div>

            <div className="landing-step-card">
              <div className="landing-step-number">3</div>
              <h4>Access Sports Dashboard</h4>
              <p>Log in to view live fixtures, ball-by-ball scorecards, team rosters, and real-time statistics.</p>
            </div>

            <div className="landing-step-card">
              <div className="landing-step-number">4</div>
              <h4>Enjoy the Platform</h4>
              <p>Experience an intuitive interface, discrete reward wallets, and VIP perks.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. FEATURE HIGHLIGHTS ── */}
      <section id="features" className="landing-section" style={{ background: 'rgba(15, 23, 42, 0.3)' }}>
        <div className="landing-container">
          <div className="landing-section-header">
            <div className="landing-section-tag">CORE CAPABILITIES</div>
            <h2 className="landing-section-title">Built for Modern Sports Enthusiasts</h2>
            <p className="landing-section-subtitle">
              Engineered with state-of-the-art technology for speed, precision, and complete data integrity.
            </p>
          </div>

          <div className="landing-features-grid">
            <div className="landing-feature-card">
              <div className="landing-feature-icon">🏏</div>
              <h4>Live Sports Experience</h4>
              <p>Comprehensive coverage of cricket, football, tennis, basketball, and more with ball-by-ball updates.</p>
            </div>

            <div className="landing-feature-card">
              <div className="landing-feature-icon">⚡</div>
              <h4>Real-Time Match Updates</h4>
              <p>High-frequency data streaming keeps you synchronized with live match events as they unfold.</p>
            </div>

            <div className="landing-feature-card">
              <div className="landing-feature-icon">💳</div>
              <h4>Secure Wallet & UPI Payments</h4>
              <p>Double-entry financial ledger with instant Razorpay UPI integration and transparent payouts.</p>
            </div>

            <div className="landing-feature-card">
              <div className="landing-feature-icon">🎁</div>
              <h4>Discrete Rewards & Bonuses</h4>
              <p>Individual reward tracking with exact stake rules and distinct bonus balances.</p>
            </div>

            <div className="landing-feature-card">
              <div className="landing-feature-icon">👥</div>
              <h4>Community Referral Program</h4>
              <p>Invite friends and earn recurring commission rewards directly into your reward balance.</p>
            </div>

            <div className="landing-feature-card">
              <div className="landing-feature-icon">🔒</div>
              <h4>Bank-Grade Security</h4>
              <p>End-to-end encryption, multi-factor authentication, and strict account privacy safeguards.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. CTA BANNER ── */}
      <div className="landing-container">
        <div className="landing-cta-banner">
          <h2 className="landing-cta-title">Ready to Experience ODDSYRA?</h2>
          <p className="landing-cta-subtitle">
            Create your account today and unlock full access to the live sports dashboard.
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/register" className="landing-btn-primary">
              Get Started Now
            </Link>
            <button
              type="button"
              onClick={openLoginModal}
              className="landing-btn-secondary"
            >
              Sign In
            </button>
          </div>
        </div>
      </div>

      {/* ── 6. TRUST & COMPLIANCE ── */}
      <div className="landing-container">
        <div className="landing-trust-bar">
          <div className="landing-trust-badge">
            <span>🛡️</span>
            <span>256-Bit SSL Encryption</span>
          </div>
          <div className="landing-trust-badge">
            <span>🔞</span>
            <span>18+ Responsible Platform</span>
          </div>
          <div className="landing-trust-badge">
            <span>⚖️</span>
            <span>Transparent & Fair Play</span>
          </div>
          <div className="landing-trust-badge">
            <span>⚡</span>
            <span>24/7 Dedicated Support</span>
          </div>
        </div>
      </div>
    </div>
  );
}
