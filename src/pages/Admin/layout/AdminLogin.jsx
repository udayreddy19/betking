import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Link } from 'react-router-dom';
import BrandLogo from '../../../components/BrandLogo/BrandLogo';
import ThemeToggle from '../../../components/ThemeToggle/ThemeToggle';
import AdminMfaQr from '../components/AdminMfaQr';

function headingForStep(mfaStep) {
  if (mfaStep === 'setup') {
    return {
      title: 'Set up authenticator',
      body: 'Scan the QR code, then enter a fresh 6-digit code to finish.',
    };
  }
  if (mfaStep === 'otp') {
    return {
      title: 'Authenticator',
      body: 'Enter the 6-digit code from your authenticator app.',
    };
  }
  return {
    title: 'Sign in',
    body: 'Use an authorized administrator account.',
  };
}

/**
 * Extracted Admin Login screen from AdminShell.
 * Contains the complete login + MFA flow (password → OTP → setup).
 * ALL existing auth state and handlers are preserved exactly.
 */
export default function AdminLogin({
  isDark,
  sessionError,
  signingIn,
  adminEmail,
  setAdminEmail,
  adminPassword,
  setAdminPassword,
  adminTotp,
  setAdminTotp,
  mfaStep,
  mfaSecret,
  mfaOtpauth,
  onSubmit,
  onResetMfa,
}) {
  const { title, body } = headingForStep(mfaStep);
  const [copied, setCopied] = useState(false);

  const copySecret = async () => {
    if (!mfaSecret) return;
    try {
      await navigator.clipboard.writeText(mfaSecret);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={`admin-shell admin-login ${isDark ? 'admin-shell--dark' : 'admin-shell--light'}`}>
      <header className="admin-login__bar">
        <div className="admin-login__brand">
          <BrandLogo size={28} />
          <div>
            <div className="admin-login__brand-title">OddsYra</div>
            <div className="admin-login__brand-sub">Admin</div>
          </div>
        </div>

        <div className="admin-login__bar-actions">
          <ThemeToggle />
          <Link to="/" className="admin-btn admin-btn--ghost admin-btn--sm">
            Back to sportsbook
          </Link>
        </div>
      </header>

      <div className="admin-login__stage">
        <motion.div
          className={`admin-login__card${mfaStep === 'setup' ? ' admin-login__card--wide' : ''}`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
        >
          <div className="admin-login__heading">
            <BrandLogo size={36} className="admin-login__mark" />
            <h2>{title}</h2>
            <p>{body}</p>
          </div>

          {sessionError && (
            <div className="admin-login__error" role="alert">
              {sessionError}
            </div>
          )}

          <form onSubmit={onSubmit} className="admin-login__form">
            <AnimatePresence mode="wait" initial={false}>
              {mfaStep === 'password' ? (
                <motion.div
                  key="password"
                  className="admin-login__fields"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                >
                  <label className="admin-login__label">
                    Email
                    <input
                      type="email"
                      required
                      autoFocus
                      autoComplete="username"
                      placeholder="admin@oddsyra.com"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      className="admin-input admin-login__input"
                    />
                  </label>
                  <label className="admin-login__label">
                    Password
                    <input
                      type="password"
                      required
                      autoComplete="current-password"
                      placeholder="••••••••••••"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      className="admin-input admin-login__input"
                    />
                  </label>
                </motion.div>
              ) : (
                <motion.div
                  key={mfaStep}
                  className="admin-login__fields"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                >
                  {mfaStep === 'setup' && mfaSecret && (
                    <div className="admin-login__setup">
                      {mfaOtpauth && (
                        <div className="admin-login__qr">
                          <AdminMfaQr otpauthUrl={mfaOtpauth} size={188} />
                          <p>Google Authenticator, 1Password, or Authy</p>
                        </div>
                      )}
                      <div className="admin-login__secret">
                        <div className="admin-login__secret-row">
                          <span>Can’t scan? Use this secret</span>
                          <button type="button" className="admin-link-btn" onClick={copySecret}>
                            {copied ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                        <code>{mfaSecret}</code>
                        <p>
                          Remove any old OddsYra Admin entries first, then wait for a new code before confirming.
                        </p>
                      </div>
                    </div>
                  )}

                  <label className="admin-login__label">
                    6-digit code
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      required
                      autoFocus
                      maxLength={6}
                      placeholder="••••••"
                      value={adminTotp}
                      onChange={(e) => setAdminTotp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="admin-input admin-login__otp"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={onResetMfa}
                    className="admin-btn admin-btn--ghost admin-login__back"
                  >
                    Back to email and password
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={signingIn}
              className="admin-btn admin-btn--primary admin-btn--lg admin-login__submit"
            >
              {signingIn
                ? 'Verifying…'
                : mfaStep === 'setup'
                  ? 'Confirm authenticator'
                  : mfaStep === 'otp'
                    ? 'Verify code'
                    : 'Continue'}
            </button>
          </form>

          <div className="admin-login__foot">
            Access is logged. An authenticator is required.
          </div>
        </motion.div>
      </div>
    </div>
  );
}
