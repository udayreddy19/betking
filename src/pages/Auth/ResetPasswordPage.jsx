import { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { IoEyeOutline, IoEyeOffOutline } from '../../icons';
import { useAuth } from '../../context/AuthContext';
import './AuthPages.css';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { resetPassword, openLoginModal, showToast } = useAuth();

  const tokenFromUrl = searchParams.get('token') || '';
  const [token, setToken] = useState(tokenFromUrl);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!token.trim()) {
      setError('Please provide a valid reset token or use the link sent to your email.');
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
      const res = await resetPassword(token.trim(), password);
      if (!res.ok) {
        setError(res.error || 'Failed to reset password. Link may be expired.');
        return;
      }

      setSuccess(true);
      showToast('Password updated successfully! You can now log in.', 'success');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page-container">
      <div className="auth-card">
        <div className="auth-logo">
          <img src="/oddsyra-logo.png" alt="OddsYra" />
        </div>

        {success ? (
          <div className="auth-state-box">
            <div className="auth-success-icon">🔒</div>
            <h2>Password Updated!</h2>
            <p>Your password has been successfully reset. All previous sessions have been securely terminated.</p>
            <button
              type="button"
              className="auth-primary-btn"
              onClick={() => {
                openLoginModal();
                navigate('/sports');
              }}
            >
              Log In With New Password
            </button>
          </div>
        ) : (
          <div className="auth-state-box">
            <h2>Set New Password</h2>
            <p>Enter your new password below to secure your OddsYra account.</p>

            {error && <div className="auth-error-banner">{error}</div>}

            <form onSubmit={handleSubmit} className="auth-form">
              {!tokenFromUrl && (
                <div className="auth-form-group">
                  <label>Reset Token / Code</label>
                  <input
                    type="text"
                    className="auth-input"
                    placeholder="Enter reset code"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    required
                  />
                </div>
              )}

              <div className="auth-form-group">
                <label>New Password</label>
                <div className="auth-input-wrapper">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="auth-input"
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="auth-eye-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label="Toggle password"
                  >
                    {showPassword ? <IoEyeOffOutline /> : <IoEyeOutline />}
                  </button>
                </div>
              </div>

              <div className="auth-form-group">
                <label>Confirm New Password</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="auth-input"
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="auth-primary-btn" disabled={loading}>
                {loading ? 'Updating password...' : 'Update Password'}
              </button>

              <div className="auth-links">
                <Link to="/" className="auth-link">Back to Home</Link>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
