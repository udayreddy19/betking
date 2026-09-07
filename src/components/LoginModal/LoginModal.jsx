import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { IoClose, IoEyeOutline, IoEyeOffOutline } from '../../icons';
import { useAuth } from '../../context/AuthContext';
import BrandLogo, { BrandWordmark } from '../BrandLogo/BrandLogo';
import { SocialAuthBlock } from '../SocialAuthButtons/SocialAuthButtons';
import { springSheet } from '../../utils/motionPresets';
import '../SocialAuthButtons/SocialAuthButtons.css';
import './LoginModal.css';

export default function LoginModal() {
  const { isLoginModalOpen, closeLoginModal, login, forgotPassword, resetPassword, showToast } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' | 'forgot' | 'reset'
  const [username, setUsername] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isLoginModalOpen) return null;

  const resetForm = () => {
    setError('');
    setPassword('');
    setConfirmPassword('');
    setResetToken('');
    setShowPassword(false);
    setLoading(false);
  };

  const handleClose = () => {
    resetForm();
    setMode('login');
    closeLoginModal();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // STEP 1: Forgot Password (Send reset link/code to email)
    if (mode === 'forgot') {
      if (!username) {
        setError('Please enter your registered email address.');
        return;
      }
      setLoading(true);
      try {
        const result = await forgotPassword(username);
        if (!result.ok) {
          setError(result.error || 'Failed to send password reset email.');
          return;
        }
        showToast('Password reset link sent to your email!', 'success');
        setMode('sent');
      } finally {
        setLoading(false);
      }
      return;
    }

    // STEP 2: Reset Password (Verify code + Set new password)
    if (mode === 'reset') {
      if (!resetToken || resetToken.length !== 6) {
        setError('Please enter the 6-digit reset code from your email.');
        return;
      }
      if (!password || password.length < 6) {
        setError('Password must be at least 6 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
      setLoading(true);
      try {
        const result = await resetPassword(resetToken, password);
        if (!result.ok) {
          setError(result.error || 'Invalid or expired reset code.');
          return;
        }
        showToast('Password updated! You can now log in.', 'success');
        resetForm();
        setMode('login');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Default: Login
    if (!username || !password) {
      setError('Please enter both email and password.');
      return;
    }

    setLoading(true);
    try {
      const success = await login(username, password);
      if (!success) {
        setError('Invalid email or password. Please try again or create an account.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = () => {
    handleClose();
  };

  const getTitle = () => {
    if (mode === 'forgot') return 'Forgot password';
    if (mode === 'reset') return 'Set new password';
    return 'Welcome back';
  };

  return (
    <motion.div
      className="modal-overlay apple-scrim"
      onClick={handleClose}
      id="login-modal"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        className="modal-card apple-material--heavy"
        onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={springSheet}
      >
        <button className="modal-close" onClick={handleClose}>
          <IoClose />
        </button>

        <div className="modal-logo">
          <BrandLogo size={64} />
          <BrandWordmark />
        </div>

        <h2 className="modal-title">{getTitle()}</h2>

        {error && <div className="modal-error">{error}</div>}

        {mode === 'sent' ? (
          <div className="modal-sent-state">
            <div style={{ fontSize: '42px', marginBottom: '16px' }} aria-hidden="true">📧</div>
            <p className="modal-sent-title">
              Check your inbox
            </p>
            <p className="modal-sent-copy">
              We've sent a password reset <strong>link</strong> and a <strong>6-digit code</strong> to <strong>{username}</strong>.
              Open the link, or tap below and enter the code from the email.
            </p>
            <button
              type="button"
              className="modal-submit-btn"
              onClick={() => {
                setMode('reset');
              }}
              style={{ marginBottom: '12px' }}
            >
              Enter Code Manually
            </button>
            <div className="modal-links" style={{ justifyContent: 'center', gap: '16px' }}>
              <button type="button" onClick={() => setMode('forgot')}>
                Resend email
              </button>
              <button type="button" onClick={() => { resetForm(); setMode('login'); }}>
                Back to login
              </button>
            </div>
          </div>
        ) : (
          <form className="modal-form" onSubmit={handleSubmit}>
            {mode === 'login' && (
              <>
                <SocialAuthBlock disabled={loading} />
              </>
            )}

            {/* Email input for Login & Forgot password */}
            {mode !== 'reset' && (
              <div className="form-group">
                <label className="form-label" htmlFor="login-username">Email</label>
                <input
                  className="form-input"
                  id="login-username"
                  type="email"
                  placeholder="Enter your email"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
            )}

            {/* Reset Code input for Step 2 */}
            {mode === 'reset' && (
              <div className="form-group">
                <label className="form-label" htmlFor="login-reset-token">6-digit reset code</label>
                <input
                  className="form-input"
                  id="login-reset-token"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  placeholder="Enter 6-digit code"
                  value={resetToken}
                  onChange={e => setResetToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                />
              </div>
            )}

            {/* Password fields for Login and Reset Password */}
            {mode !== 'forgot' && (
              <div className="form-group">
                <label className="form-label" htmlFor="login-password">
                  {mode === 'reset' ? 'New password' : 'Password'}
                </label>
                <div className="form-input-wrapper">
                  <input
                    className="form-input"
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder={mode === 'reset' ? 'At least 6 characters' : 'Enter your password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete={mode === 'reset' ? 'new-password' : 'current-password'}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? <IoEyeOffOutline /> : <IoEyeOutline />}
                  </button>
                </div>
              </div>
            )}

            {/* Confirm Password for Reset Mode */}
            {mode === 'reset' && (
              <div className="form-group">
                <label className="form-label" htmlFor="login-password-confirm">Confirm new password</label>
                <input
                  className="form-input"
                  id="login-password-confirm"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>
            )}

            <button type="submit" className="modal-submit-btn" id="login-submit" disabled={loading}>
              {loading
                ? 'Please wait...'
                : mode === 'forgot'
                ? 'Send reset link'
                : mode === 'reset'
                ? 'Update password'
                : 'Log in'}
            </button>

            <div className="modal-links">
              {mode === 'forgot' && (
                <button type="button" onClick={() => { resetForm(); setMode('login'); }}>
                  Back to login
                </button>
              )}
              {mode === 'reset' && (
                <>
                  <button type="button" onClick={() => setMode('forgot')}>
                    Resend code
                  </button>
                  <button type="button" onClick={() => { resetForm(); setMode('login'); }}>
                    Back to login
                  </button>
                </>
              )}
              {mode === 'login' && (
                <>
                  <button type="button" onClick={() => { resetForm(); setMode('forgot'); }}>
                    Forgot password?
                  </button>
                  <Link to="/register" onClick={handleRegister}>
                    Create account
                  </Link>
                </>
              )}
            </div>
          </form>
        )}
      </motion.div>
    </motion.div>
  );
}

