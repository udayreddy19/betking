import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IoEyeOutline, IoEyeOffOutline } from '../../icons';
import { useAuth } from '../../context/AuthContext';
import { WELCOME_BONUS } from '../../data/mockData';
import './Register.css';

export default function Register() {
  const navigate = useNavigate();
  const { openLoginModal, register, login, showToast } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(true);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');

  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await register({ email, password, displayName, phone });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await login(email, password);
      if (result.welcomeCredit) {
        showToast(`Welcome bonus of ₹${result.welcomeCredit.toLocaleString('en-IN')} credited!`, 'success');
      }
      navigate('/sports');
    } finally {
      setLoading(false);
    }
  };

  const handleLoginClick = () => {
    openLoginModal();
  };

  return (
    <div className="register-page" id="register-page">
      <div className="register-form-section">
        <img src="/oddsyra-logo.png" alt="OddsYra" className="register-logo" />
        <h1>Register in one easy step</h1>

        {error && <div className="register-error">{error}</div>}

        <form className="register-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="reg-email">Email</label>
            <input
              className="form-input"
              id="reg-email"
              type="email"
              placeholder="youremail@domain.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="reg-password">Password</label>
            <div className="form-input-wrapper" style={{ position: 'relative' }}>
              <input
                className="form-input"
                id="reg-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                style={{ paddingRight: '3rem' }}
              />
              <button
                type="button"
                style={{
                  position: 'absolute', right: '12px', top: '50%',
                  transform: 'translateY(-50%)', color: 'var(--color-text-muted)',
                  fontSize: '1.1rem'
                }}
                onClick={() => setShowPassword(!showPassword)}
                aria-label="Toggle password"
              >
                {showPassword ? <IoEyeOffOutline /> : <IoEyeOutline />}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="reg-name">First and last name</label>
            <input
              className="form-input"
              id="reg-name"
              type="text"
              placeholder="As per your Aadhaar card"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Mobile number</label>
            <div className="phone-input-group">
              <div className="phone-country">
                <span className="flag">🇮🇳</span>
                <select defaultValue="+91">
                  <option value="+91">+91</option>
                  <option value="+1">+1</option>
                  <option value="+44">+44</option>
                </select>
              </div>
              <input
                className="form-input"
                id="reg-phone"
                type="tel"
                placeholder="1234-567890"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="register-checkbox">
            <input
              type="checkbox"
              id="reg-agree"
              checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
            />
            <label htmlFor="reg-agree">
              By ticking this box, in order to register for this website, I confirm that
              I am over 18 years old and have read, understood and accepted the{' '}
              <Link to="/terms">Terms & Conditions</Link>, <Link to="/privacy">Privacy Policy</Link>,{' '}
              <Link to="/help">Betting Rules</Link>, and <Link to="/responsible-gaming">Responsible Gaming Policy</Link>.
            </label>
          </div>

          <button type="submit" className="register-submit-btn" disabled={!agreed || loading} id="register-submit">
            {loading ? 'Creating account...' : 'Register'}
          </button>

          <div className="register-login-link">
            Already have an account?{' '}
            <button type="button" onClick={handleLoginClick}>Log in</button>
          </div>
        </form>
      </div>

      <div className="register-hero-section">
        <div className="register-hero-shapes">
          <span /><span /><span />
        </div>
        <div className="register-hero-content">
          <span className="hero-emoji">👌</span>
          <h2>Join OddsYra</h2>
          <p>{WELCOME_BONUS.displayShort} Welcome Bonus</p>
        </div>
      </div>
    </div>
  );
}
