import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IoEyeOutline, IoEyeOffOutline } from 'react-icons/io5';
import { useAuth } from '../../context/AuthContext';
import './Register.css';

export default function Register() {
  const navigate = useNavigate();
  const { openLoginModal } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(true);
  const [registered, setRegistered] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setRegistered(true);
  };

  const handleLoginClick = () => {
    openLoginModal();
  };

  if (registered) {
    return (
      <div className="register-page" id="register-page">
        <div className="register-form-section">
          <div className="register-success">
            <span className="success-icon">🎉</span>
            <h2>Registration Successful!</h2>
            <p>Welcome to BetKing. Your account has been created.</p>
            <button className="success-btn" onClick={() => { navigate('/'); openLoginModal(); }}>
              Log in now
            </button>
          </div>
        </div>
        <div className="register-hero-section">
          <div className="register-hero-shapes">
            <span /><span /><span />
          </div>
          <div className="register-hero-content">
            <span className="hero-emoji">🎊</span>
            <h2>Welcome aboard!</h2>
            <p>Start your winning journey today</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="register-page" id="register-page">
      <div className="register-form-section">
        <h1>Register in one easy step</h1>

        <form className="register-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="reg-email">Email</label>
            <input
              className="form-input"
              id="reg-email"
              type="email"
              placeholder="youremail@domain.com"
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
              <a href="#terms">Terms & Conditions</a>, <a href="#privacy">Privacy Policy</a>,{' '}
              <a href="#rules">Betting Rules</a>, and <a href="#responsible">Responsible Gaming Policy</a>.
            </label>
          </div>

          <button type="submit" className="register-submit-btn" disabled={!agreed} id="register-submit">
            Register
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
          <h2>Join BetKing</h2>
          <p>150% up to ₹20,000 Welcome Bonus</p>
        </div>
      </div>
    </div>
  );
}
