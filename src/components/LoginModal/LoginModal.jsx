import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IoClose, IoEyeOutline, IoEyeOffOutline } from '../../icons';
import { useAuth } from '../../context/AuthContext';
import './LoginModal.css';

export default function LoginModal() {
  const { isLoginModalOpen, closeLoginModal, login, resetPassword, showToast } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  if (!isLoginModalOpen) return null;

  const resetForm = () => {
    setError('');
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
  };

  const handleClose = () => {
    resetForm();
    setMode('login');
    closeLoginModal();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (mode === 'reset') {
      if (!username || !password) {
        setError('Please enter your email and a new password');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }
      const result = resetPassword(username, password);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      showToast('Password updated. You can log in with your new password.', 'success');
      resetForm();
      setMode('login');
      return;
    }

    if (!username || !password) {
      setError('Please enter both username and password');
      return;
    }
    const success = login(username, password);
    if (!success) {
      setError('Invalid email or password. Please try again or create an account.');
    }
  };

  const handleRegister = () => {
    handleClose();
    navigate('/register');
  };

  return (
    <div className="modal-overlay" onClick={handleClose} id="login-modal">
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={handleClose}>
          <IoClose />
        </button>

        <div className="modal-logo">
          <span className="logo-icon">B</span>
          <span>BetKing</span>
        </div>

        <h2 className="modal-title">{mode === 'reset' ? 'Reset password' : 'Welcome back'}</h2>

        {error && <div className="modal-error">{error}</div>}

        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="login-username">Email</label>
            <input
              className="form-input"
              id="login-username"
              type="email"
              placeholder="Enter your email"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>
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
          {mode === 'reset' && (
            <div className="form-group">
              <label className="form-label" htmlFor="login-password-confirm">Confirm password</label>
              <input
                className="form-input"
                id="login-password-confirm"
                type={showPassword ? 'text' : 'password'}
                placeholder="Re-enter new password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          )}
          <button type="submit" className="modal-submit-btn" id="login-submit">
            {mode === 'reset' ? 'Update password' : 'Log in'}
          </button>
          <div className="modal-links">
            {mode === 'reset' ? (
              <button type="button" onClick={() => { resetForm(); setMode('login'); }}>Back to login</button>
            ) : (
              <button type="button" onClick={() => { resetForm(); setMode('reset'); }}>Forgot password?</button>
            )}
            <button type="button" onClick={handleRegister}>Create account</button>
          </div>
        </form>
      </div>
    </div>
  );
}
