import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IoClose, IoEyeOutline, IoEyeOffOutline } from 'react-icons/io5';
import { useAuth } from '../../context/AuthContext';
import './LoginModal.css';

export default function LoginModal() {
  const { isLoginModalOpen, closeLoginModal, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  if (!isLoginModalOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
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
    closeLoginModal();
    navigate('/register');
  };

  return (
    <div className="modal-overlay" onClick={closeLoginModal} id="login-modal">
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={closeLoginModal}>
          <IoClose />
        </button>

        <div className="modal-logo">
          <span className="logo-icon">B</span>
          <span>BetKing</span>
        </div>

        <h2 className="modal-title">Welcome back</h2>

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
            <label className="form-label" htmlFor="login-password">Password</label>
            <div className="form-input-wrapper">
              <input
                className="form-input"
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
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
          <button type="submit" className="modal-submit-btn" id="login-submit">
            Log in
          </button>
          <div className="modal-links">
            <button type="button" onClick={() => {}}>Forgot password?</button>
            <button type="button" onClick={handleRegister}>Create account</button>
          </div>
        </form>
      </div>
    </div>
  );
}
