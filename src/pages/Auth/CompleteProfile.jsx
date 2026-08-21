import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import BrandLogo, { BrandWordmark } from '../../components/BrandLogo/BrandLogo';
import '../Register/Register.css';
import './AuthPages.css';

const PROMO_CHIPS = [
  { code: 'VIP1000', kind: 'Bonus' },
  { code: 'SPORTS500', kind: 'Free bet' },
  { code: 'LIVE100', kind: 'Free bet' },
];

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 10);
}

function hasPhone(user) {
  return Boolean(String(user?.phone || '').replace(/\D/g, '').length >= 10);
}

export default function CompleteProfile() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, isLoggedIn, completeAccountProfile, showToast } = useAuth();
  const [phone, setPhone] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const isWelcome = searchParams.get('welcome') === '1';

  useEffect(() => {
    if (user?.phone) {
      setPhone(digitsOnly(user.phone));
    }
  }, [user?.phone]);

  if (!isLoggedIn) {
    return <Navigate to="/register" replace />;
  }

  if (hasPhone(user)) {
    return <Navigate to="/sports" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (digitsOnly(phone).length !== 10) {
      setError('Enter a valid 10-digit Indian mobile number.');
      return;
    }

    setLoading(true);
    try {
      const result = await completeAccountProfile({
        phone: digitsOnly(phone),
        promoCode: promoCode.trim() || undefined,
      });
      if (!result.ok) {
        setError(result.error || 'Could not save your details.');
        return;
      }

      if (result.promoReward) {
        const typeLabel = {
          bonus: 'bonus',
          freebet: 'free bet',
          cash: 'real money',
        }[result.promoReward.rewardType] || 'credit';
        showToast(
          `₹${Number(result.promoReward.amount).toLocaleString('en-IN')} ${typeLabel} credited with ${result.promoReward.code}.`,
          'success',
        );
      } else {
        showToast('Mobile number saved. You are all set!', 'success');
      }
      navigate('/sports', { replace: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-page" id="complete-profile-page">
      <div className="register-form-section">
        <div className="register-form-card">
          <div className="register-logo-wrap">
            <BrandLogo size={44} />
            <BrandWordmark />
          </div>
          <h1>{isWelcome ? 'Welcome to OddsYra' : 'Complete your account'}</h1>
          <p className="register-lead">
            Google sign-in does not share your mobile number. Add it to secure your account
            {isWelcome ? ' and optionally claim a signup promo' : ''}.
          </p>

          {error && <div className="register-error" role="alert">{error}</div>}

          <form className="register-form" onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label className="form-label" htmlFor="cp-phone">Mobile number</label>
              <div className="phone-input-group">
                <div className="phone-country" aria-hidden="true">
                  <span className="flag">🇮🇳</span>
                  <span>+91</span>
                </div>
                <input
                  className="form-input"
                  id="cp-phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  placeholder="10-digit number"
                  value={phone}
                  onChange={(e) => setPhone(digitsOnly(e.target.value))}
                  required
                  autoFocus
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="cp-promo">Promo code (optional)</label>
              <input
                className="form-input"
                id="cp-promo"
                type="text"
                autoComplete="off"
                placeholder="e.g. SPORTS500"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                maxLength={32}
              />
              <div className="register-promo-chips">
                {PROMO_CHIPS.map(({ code, kind }) => (
                  <button
                    key={code}
                    type="button"
                    className={`register-promo-chip ${promoCode === code ? 'active' : ''}`}
                    onClick={() => setPromoCode((prev) => (prev === code ? '' : code))}
                  >
                    {code}
                    <span>{kind}</span>
                  </button>
                ))}
              </div>
              <p className="register-lead" style={{ marginTop: 8, fontSize: '0.82rem' }}>
                Skip the promo for now if you prefer — you can still claim one later on Profile.
              </p>
            </div>

            <button type="submit" className="register-submit" disabled={loading}>
              {loading ? 'Saving…' : 'Continue'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
