import React from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { LockIcon, ShieldCheckIcon } from '../../../icons/animate/index';
import BrandLogo from '../../../components/BrandLogo/BrandLogo';
import ThemeToggle from '../../../components/ThemeToggle/ThemeToggle';
import AdminMfaQr from '../components/AdminMfaQr';

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
  return (
    <div
      className={`admin-shell ${isDark ? 'admin-shell--dark' : 'admin-shell--light'}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        height: '100vh',
        background: 'var(--admin-bg)',
        color: 'var(--admin-text)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif',
        overflow: 'auto',
      }}
    >
      {/* Top Navbar */}
      <header style={{
        height: '56px',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        borderBottom: '1px solid var(--admin-border)',
        background: 'var(--admin-panel)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <BrandLogo size={30} />
          <div>
            <div style={{ fontSize: '0.9rem', fontWeight: 900, letterSpacing: '0.3px', color: 'var(--admin-text)' }}>
              ODDSYRA ADMIN
            </div>
            <div style={{ fontSize: '0.64rem', color: '#10b981', fontWeight: 800, letterSpacing: '0.3px' }}>
              OPERATIONS CONTROL CENTER
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <ThemeToggle />
          <Link
            to="/"
            style={{
              fontSize: '0.8rem',
              fontWeight: 700,
              color: 'var(--admin-text-muted)',
              textDecoration: 'none',
              padding: '5px 10px',
              borderRadius: 'var(--admin-radius)',
              border: '1px solid var(--admin-border)',
              background: 'var(--admin-surface)',
              transition: 'all 0.15s ease',
            }}
          >
            ← Back to Sportsbook
          </Link>
        </div>
      </header>

      {/* Center Login Container */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 16px',
      }}>
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          style={{
            width: '100%',
            maxWidth: '420px',
            background: 'var(--admin-panel)',
            border: '1px solid var(--admin-border)',
            borderRadius: 'var(--admin-radius-xl)',
            padding: '28px 24px',
            boxShadow: 'var(--admin-shadow)',
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: '22px' }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: 'var(--admin-radius-lg)',
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#3b82f6',
              marginBottom: '12px',
            }}>
              <LockIcon size={22} />
            </div>
            <h2 style={{ margin: '0 0 6px', fontSize: '1.15rem', fontWeight: 800, color: 'var(--admin-text)' }}>
              Admin Sign In
            </h2>
            <p style={{ margin: 0, color: 'var(--admin-text-muted)', fontSize: '0.82rem', lineHeight: 1.45 }}>
              Sign in with an authorized administrator account to open the Operations Control Center.
            </p>
          </div>

          {sessionError && (
            <div style={{
              marginBottom: '16px',
              padding: '9px 12px',
              borderRadius: 'var(--admin-radius)',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              color: '#f87171',
              fontSize: '0.8rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              <span>⚠️</span>
              <span>{sessionError}</span>
            </div>
          )}

          <form onSubmit={onSubmit} style={{ display: 'grid', gap: '14px' }}>
            {mfaStep === 'password' && (
              <>
                <label style={{ display: 'grid', gap: '5px', fontSize: '0.76rem', fontWeight: 700, color: 'var(--admin-text-muted)' }}>
                  ADMIN EMAIL
                  <input
                    type="email"
                    required
                    autoFocus
                    autoComplete="username"
                    placeholder="admin@oddsyra.com"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    className="admin-input"
                    style={{ padding: '9px 12px', fontSize: '0.88rem' }}
                  />
                </label>
                <label style={{ display: 'grid', gap: '5px', fontSize: '0.76rem', fontWeight: 700, color: 'var(--admin-text-muted)' }}>
                  PASSWORD
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    placeholder="••••••••••••"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    className="admin-input"
                    style={{ padding: '9px 12px', fontSize: '0.88rem' }}
                  />
                </label>
              </>
            )}

            {mfaStep !== 'password' && (
              <>
                {mfaStep === 'setup' && mfaSecret && (
                  <div style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--admin-radius)',
                    border: '1px solid var(--admin-border)',
                    background: 'var(--admin-bg)',
                    fontSize: '0.78rem',
                    color: 'var(--admin-text)',
                    wordBreak: 'break-all',
                  }}>
                    <div style={{ fontWeight: 800, marginBottom: 10 }}>Set up authenticator</div>
                    {mfaOtpauth && (
                      <div style={{ marginBottom: 12 }}>
                        <AdminMfaQr otpauthUrl={mfaOtpauth} size={200} />
                        <div style={{ marginTop: 8, color: 'var(--admin-text-muted)', fontSize: '0.7rem', textAlign: 'center' }}>
                          Scan with Google Authenticator, 1Password, or Authy
                        </div>
                      </div>
                    )}
                    <div style={{ fontWeight: 700, marginBottom: 6, fontSize: '0.7rem', color: 'var(--admin-text-muted)' }}>
                      Or enter this secret manually
                    </div>
                    <code style={{ display: 'block', fontSize: '0.76rem' }}>{mfaSecret}</code>
                    <div style={{ marginTop: 8, color: 'var(--admin-text-muted)', fontSize: '0.7rem' }}>
                      Delete any old OddsYra Admin entries first, then scan or paste the secret.
                      Wait for a fresh 6-digit code before confirming.
                    </div>
                  </div>
                )}
                <label style={{ display: 'grid', gap: '5px', fontSize: '0.76rem', fontWeight: 700, color: 'var(--admin-text-muted)' }}>
                  AUTHENTICATOR CODE
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    autoFocus
                    maxLength={8}
                    placeholder="123456"
                    value={adminTotp}
                    onChange={(e) => setAdminTotp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="admin-input"
                    style={{
                      padding: '9px 12px',
                      fontSize: '0.88rem',
                      letterSpacing: '0.2em',
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={onResetMfa}
                  className="admin-btn admin-btn--ghost"
                  style={{ justifyContent: 'flex-start', padding: '4px 0' }}
                >
                  Back to email and password
                </button>
              </>
            )}

            <button
              type="submit"
              disabled={signingIn}
              className="admin-btn admin-btn--primary admin-btn--lg"
              style={{
                marginTop: '6px',
                width: '100%',
                boxShadow: '0 4px 14px rgba(59, 130, 246, 0.35)',
              }}
            >
              {signingIn
                ? 'Verifying…'
                : mfaStep === 'setup'
                  ? 'Confirm authenticator'
                  : mfaStep === 'otp'
                    ? 'Verify code'
                    : 'Sign In to Operations Console'}
            </button>
          </form>

          <div style={{
            marginTop: '18px',
            paddingTop: '14px',
            borderTop: '1px solid var(--admin-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            color: 'var(--admin-text-muted)',
            fontSize: '0.72rem',
          }}>
            <ShieldCheckIcon size={13} style={{ color: '#10b981' }} />
            <span>RBAC &amp; Audit Logging Enforced</span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
