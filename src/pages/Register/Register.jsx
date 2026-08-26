import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { IoEyeOutline, IoEyeOffOutline } from '../../icons';
import { useAuth } from '../../context/AuthContext';
import { DEMO_MODE } from '../../utils/featureFlags';
import BrandLogo, { BrandWordmark } from '../../components/BrandLogo/BrandLogo';
import { SocialAuthBlock } from '../../components/SocialAuthButtons/SocialAuthButtons';
import '../../components/SocialAuthButtons/SocialAuthButtons.css';
import './Register.css';

const PROMO_CHIPS = [
  { code: 'VIP1000', kind: 'Bonus' },
  { code: 'SPORTS500', kind: 'Free bet' },
  { code: 'LIVE100', kind: 'Free bet' },
];
const MIN_PASSWORD_LENGTH = 8;

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 10);
}

export default function Register() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { openLoginModal, closeLoginModal, register, showToast, isLoggedIn } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [referralCode, setReferralCode] = useState(() => String(searchParams.get('ref') || '').trim().toUpperCase());
  const [loading, setLoading] = useState(false);
  const errorRef = useRef(null);

  useEffect(() => {
    closeLoginModal?.();
  }, [closeLoginModal]);

  useEffect(() => {
    const ref = String(searchParams.get('ref') || '').trim().toUpperCase();
    if (ref) {
      setReferralCode(ref);
      try {
        sessionStorage.setItem('bk_pending_referral', ref);
      } catch {
        /* ignore */
      }
    }
  }, [searchParams]);

  useEffect(() => {
    if (referralCode.trim()) {
      try {
        sessionStorage.setItem('bk_pending_referral', referralCode.trim().toUpperCase());
      } catch {
        /* ignore */
      }
    }
  }, [referralCode]);

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  if (isLoggedIn) {
    return <Navigate to="/sports" replace />;
  }

  const referralActive = Boolean(referralCode.trim());

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !email.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }
    if (displayName.trim().length < 2) {
      setError('Enter your full name as it appears on Aadhaar.');
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (digitsOnly(phone).length !== 10) {
      setError('Enter a valid 10-digit Indian mobile number.');
      return;
    }
    if (!agreed) {
      setError('Please confirm you are 18+ and accept the terms.');
      return;
    }
    if (referralActive && promoCode.trim()) {
      setError('Referral and initial signup promotions cannot be combined. Clear the promo code or remove the referral.');
      return;
    }

    setLoading(true);
    try {
      const result = await register({
        email,
        password,
        displayName,
        phone: digitsOnly(phone),
        promoCode: referralActive ? '' : promoCode,
        referralCode: referralCode.trim() || undefined,
      });
      if (!result.ok) {
        setError(result.error || 'Could not create your account. Try again.');
        return;
      }
      if (result.referral?.success) {
        showToast('Joined via referral. Free bet unlocks after your qualifying first deposit.', 'success');
      } else if (result.promoReward?.error) {
        showToast(result.promoReward.error, 'info');
      } else if (result.promoReward?.deferred) {
        showToast(
          `${result.promoReward.code} is a deposit bonus. Claim it on Promotions after your first deposit.`,
          'info',
        );
      } else if (result.promoReward) {
        const typeLabel = {
          bonus: 'bonus',
          freebet: 'free bet',
          cash: 'real money',
        }[result.promoReward.rewardType] || 'credit';
        showToast(
          `₹${Number(result.promoReward.amount).toLocaleString('en-IN')} ${typeLabel} credited with ${result.promoReward.code}.`,
          'success',
        );
      } else if (result.welcomeCredit) {
        showToast(`Welcome bonus of ₹${result.welcomeCredit.toLocaleString('en-IN')} credited!`, 'success');
      } else {
        showToast('Account created. You can start betting on Sports.', 'success');
      }
      navigate('/sports');
    } catch (err) {
      setError(err?.message || 'Could not create your account. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-page" id="register-page">
      <div className="register-form-section">
        <div className="register-form-card">
          <div className="register-logo-wrap">
            <BrandLogo size={44} />
            <BrandWordmark />
          </div>
          <h1>Create your account</h1>
          <p className="register-lead">
            {DEMO_MODE
              ? 'Join in one step and start placing demo bets.'
              : 'Join OddsYra to bet on live cricket, football, and more. 18+ only.'}
          </p>

          {error && <div className="register-error" role="alert" ref={errorRef}>{error}</div>}

          <SocialAuthBlock disabled={loading} />

          <form className="register-form" onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label className="form-label" htmlFor="reg-email">Email</label>
              <input
                className="form-input"
                id="reg-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="reg-password">Password</label>
              <div className="form-input-wrapper">
                <input
                  className="form-input form-input--password"
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={MIN_PASSWORD_LENGTH}
                  required
                />
                <button
                  type="button"
                  className="register-eye-btn"
                  onClick={() => setShowPassword((open) => !open)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <IoEyeOffOutline /> : <IoEyeOutline />}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="reg-name">Full name</label>
              <input
                className="form-input"
                id="reg-name"
                type="text"
                autoComplete="name"
                placeholder="As on your Aadhaar card"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="reg-phone">Mobile number</label>
              <div className="phone-input-group">
                <div className="phone-country" aria-hidden="true">
                  <span className="flag">🇮🇳</span>
                  <span>+91</span>
                </div>
                <input
                  className="form-input"
                  id="reg-phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  placeholder="10-digit number"
                  value={phone}
                  onChange={(e) => setPhone(digitsOnly(e.target.value))}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="reg-ref">Referral code (optional)</label>
              <input
                className="form-input"
                id="reg-ref"
                type="text"
                autoComplete="off"
                placeholder="e.g. UDAY123"
                value={referralCode}
                onChange={(e) => {
                  setReferralCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
                  if (e.target.value.trim()) setPromoCode('');
                }}
                maxLength={24}
              />
              {referralActive && (
                <p className="register-promo-hint" style={{ marginTop: 8 }}>
                  You&apos;re joining through referral code <strong>{referralCode}</strong>.
                  Referral reward applies after your first qualifying deposit.
                  Initial signup promotions cannot be combined with this referral.
                </p>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="reg-promo">
                {referralActive ? 'Promo code (unavailable with referral)' : 'Promo code (optional)'}
              </label>
              <input
                className="form-input"
                id="reg-promo"
                type="text"
                autoComplete="off"
                placeholder={referralActive ? 'Disabled — referral active' : 'e.g. SPORTS500'}
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                maxLength={32}
                disabled={referralActive}
              />
              {!referralActive && (
              <div className="register-promo-chips">
                {PROMO_CHIPS.map(({ code, kind }) => (
                  <button
                    key={code}
                    type="button"
                    className={`register-promo-chip ${promoCode === code ? 'active' : ''}`}
                    onClick={() => { setPromoCode(code); setReferralCode(''); }}
                  >
                    {code}
                    <span>{kind}</span>
                  </button>
                ))}
              </div>
              )}
              <div className="register-credit-explain">
                <div>
                  <strong>Bonus</strong>
                  <p>
                    Extra wallet credit (e.g. VIP1000). Bet only at 1.75+ odds and rotate 5×.
                    Profit goes to cash. The bonus itself cannot be withdrawn. Withdrawing cash
                    while bonus remains sets that bonus to ₹0. WELCOME150 is a 150% first-deposit
                    match — claim it on Promotions after you pay in.
                  </p>
                </div>
                <div>
                  <strong>Free bet</strong>
                  <p>
                    Stake we give you (e.g. SPORTS500, LIVE100). Use it like cash at any odds.
                    You keep profit only — the free-bet stake is not returned. It does not count
                    toward 5× playthrough.
                  </p>
                </div>
              </div>
              <p className="form-hint">
                Pick only one of SPORTS500, VIP1000, or LIVE100. Each code is once per Aadhaar/PAN. Verify KYC to withdraw cash winnings.
              </p>
            </div>

            <div className="register-checkbox">
              <input
                type="checkbox"
                id="reg-agree"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              <label htmlFor="reg-agree">
                I am 18 or older and accept the{' '}
                <Link to="/terms">Terms</Link>, <Link to="/privacy">Privacy Policy</Link>, and{' '}
                <Link to="/responsible-gaming">Responsible Gaming</Link> rules.
              </label>
            </div>

            <button
              type="submit"
              className="register-submit-btn"
              disabled={loading || !agreed}
              id="register-submit"
            >
              {loading ? 'Creating account…' : 'Create account'}
            </button>

            <div className="register-login-link">
              Already have an account?{' '}
              <button type="button" onClick={openLoginModal}>Log in</button>
            </div>
          </form>
        </div>
      </div>

      <aside className="register-hero-section" aria-label="Why join OddsYra">
        <div className="register-hero-shapes" aria-hidden="true">
          <span /><span /><span />
        </div>
        <div className="register-hero-content">
          <p className="register-hero-kicker">Live sportsbook</p>
          <h2>Bet on cricket, football & more</h2>
          <ul className="register-hero-points">
            <li>Live odds on Indian and world sport</li>
            <li>Signup codes like VIP1000 and SPORTS500, plus WELCOME150 after your first deposit</li>
            <li>Withdraw winnings after Aadhaar &amp; PAN verification</li>
            <li>18+ only. Play responsibly.</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
