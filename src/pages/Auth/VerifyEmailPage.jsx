import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './AuthPages.css';

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { verifyEmail, openLoginModal } = useAuth();

  const tokenFromUrl = searchParams.get('token') || '';
  const [tokenInput, setTokenInput] = useState(tokenFromUrl);
  const [status, setStatus] = useState(tokenFromUrl ? 'verifying' : 'input'); // 'input' | 'verifying' | 'success' | 'error'
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (tokenFromUrl) {
      handleAutoVerify(tokenFromUrl);
    }
  }, [tokenFromUrl]);

  const handleAutoVerify = async (token) => {
    setStatus('verifying');
    setErrorMsg('');
    const res = await verifyEmail(token);
    if (res.ok) {
      setStatus('success');
    } else {
      setStatus('error');
      setErrorMsg(res.error || 'Verification token is invalid or has expired.');
    }
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!tokenInput.trim()) {
      setErrorMsg('Please enter your verification token.');
      return;
    }
    handleAutoVerify(tokenInput.trim());
  };

  return (
    <div className="auth-page-container">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="logo-icon">👑</span>
          <span className="brand-name">BetKing</span>
        </div>

        {status === 'verifying' && (
          <div className="auth-state-box">
            <div className="spinner"></div>
            <h2>Verifying your email...</h2>
            <p>Please wait while we verify your BetKing account.</p>
          </div>
        )}

        {status === 'success' && (
          <div className="auth-state-box">
            <div className="auth-success-icon">✅</div>
            <h2>Email Verified Successfully!</h2>
            <p>Your BetKing account is now fully activated with verified security status.</p>
            <div className="auth-actions">
              <button
                type="button"
                className="auth-primary-btn"
                onClick={() => {
                  openLoginModal();
                  navigate('/sports');
                }}
              >
                Log In & Start Playing
              </button>
              <Link to="/sports" className="auth-secondary-btn">
                Browse Sportsbook
              </Link>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="auth-state-box">
            <div className="auth-error-icon">⚠️</div>
            <h2>Verification Failed</h2>
            <p className="auth-error-text">{errorMsg}</p>
            <div className="auth-actions">
              <button
                type="button"
                className="auth-primary-btn"
                onClick={() => setStatus('input')}
              >
                Enter Code Manually
              </button>
              <Link to="/" className="auth-secondary-btn">
                Back to Home
              </Link>
            </div>
          </div>
        )}

        {status === 'input' && (
          <div className="auth-state-box">
            <h2>Enter Verification Token</h2>
            <p>Paste the verification link or token from the email you received.</p>
            {errorMsg && <div className="auth-error-banner">{errorMsg}</div>}
            <form onSubmit={handleManualSubmit} className="auth-form">
              <input
                type="text"
                className="auth-input"
                placeholder="Paste verification token"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                required
              />
              <button type="submit" className="auth-primary-btn">
                Verify Account
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
