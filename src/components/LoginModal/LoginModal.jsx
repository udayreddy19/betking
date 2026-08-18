import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IoClose, IoEyeOutline, IoEyeOffOutline } from '../../icons';
import { useAuth } from '../../context/AuthContext';
import BrandLogo, { BrandWordmark } from '../BrandLogo/BrandLogo';
import './LoginModal.css';

export default function LoginModal() {
  const { isLoginModalOpen, closeLoginModal, login, forgotPassword, resetPassword, showToast } = useAuth();
  const navigate = useNavigate();
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
      if (!resetToken) {
        setError('Please enter the verification reset code.');
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
    navigate('/register');
  };

  const getTitle = () => {
    if (mode === 'forgot') return 'Forgot password';
    if (mode === 'reset') return 'Set new password';
    return 'Welcome back';
  };

  return (
    <div className="modal-overlay" onClick={handleClose} id="login-modal">
      <div className="modal-card" onClick={e => e.stopPropagation()}>
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
            <div style={{ fontSize: '42px', marginBottom: '16px' }}>📧</div>
            <p style={{ color: '#e6edf3', fontSize: '15px', fontWeight: '600', marginBottom: '8px' }}>
              Check your inbox
            </p>
            <p style={{ color: '#8b949e', fontSize: '13px', lineHeight: '1.5', marginBottom: '24px' }}>
              We've sent a password reset link to <strong>{username}</strong>. Click the link in the email to set your new password.
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
                <label className="form-label" htmlFor="login-reset-token">Verification / Reset code</label>
                <input
                  className="form-input"
                  id="login-reset-token"
                  type="text"
                  placeholder="Enter the code sent to your email"
                  value={resetToken}
                  onChange={e => setResetToken(e.target.value)}
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
                  <button type="button" onClick={handleRegister}>
                    Create account
                  </button>
                </>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

