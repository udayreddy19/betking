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

const PENDING_REF_KEY = 'bk_pending_referral';
const PENDING_MODAL_KEY = 'bk_open_modal';

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 10);
}

function hasPhone(user) {
  return Boolean(String(user?.phone || '').replace(/\D/g, '').length >= 10);
}

function hasDob(user) {
  return Boolean(String(user?.dateOfBirth || '').slice(0, 10).match(/^\d{4}-\d{2}-\d{2}$/));
}

function readPendingReferral(searchParams) {
  const fromUrl = String(searchParams.get('ref') || '').trim().toUpperCase();
  if (fromUrl) return fromUrl;
  try {
    return String(sessionStorage.getItem(PENDING_REF_KEY) || '').trim().toUpperCase();
  } catch {
    return '';
  }
}

function resolveAfterComplete(nextRaw) {
  const next = String(nextRaw || '').trim();
  if (next === 'deposit' || next === 'withdraw') {
    try {
      sessionStorage.setItem(PENDING_MODAL_KEY, next);
    } catch { /* ignore */ }
    return '/sports';
  }
  if (next.startsWith('/')) {
    try {
      return decodeURIComponent(next);
    } catch {
      return next;
    }
  }
  return '/sports';
}

export default function CompleteProfile() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, isLoggedIn, completeAccountProfile, showToast } = useAuth();
  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [referralCode, setReferralCode] = useState(() => readPendingReferral(searchParams));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const isWelcome = searchParams.get('welcome') === '1';
  const referralActive = Boolean(referralCode.trim());
  const needPhone = !hasPhone(user);
  const needDob = !hasDob(user);

  useEffect(() => {
    if (user?.phone) {
      setPhone(digitsOnly(user.phone));
    }
  }, [user?.phone]);

  useEffect(() => {
    if (user?.dateOfBirth) {
      setDateOfBirth(String(user.dateOfBirth).slice(0, 10));
    }
  }, [user?.dateOfBirth]);

  useEffect(() => {
    const ref = readPendingReferral(searchParams);
    if (ref) setReferralCode(ref);
  }, [searchParams]);

  if (!isLoggedIn) {
    return <Navigate to="/register" replace />;
  }

  if (!needPhone && !needDob) {
    return <Navigate to={resolveAfterComplete(searchParams.get('next'))} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (needPhone && digitsOnly(phone).length !== 10) {
      setError('Enter a valid 10-digit Indian mobile number.');
      return;
    }

    if (needDob) {
      if (!dateOfBirth) {
        setError('Enter your date of birth.');
        return;
      }
      const born = new Date(`${dateOfBirth}T00:00:00`);
      if (Number.isNaN(born.getTime())) {
        setError('Enter a valid date of birth.');
        return;
      }
      const now = new Date();
      let age = now.getFullYear() - born.getFullYear();
      const m = now.getMonth() - born.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < born.getDate())) age -= 1;
      if (age < 18) {
        setError('You must be 18 or older to join OddsYra.');
        return;
      }
    }

    if (referralActive && promoCode.trim()) {
      setError('Referral and initial signup promotions cannot be combined. Clear the promo code or remove the referral.');
      return;
    }

    setLoading(true);
    try {
      const result = await completeAccountProfile({
        phone: needPhone ? digitsOnly(phone) : undefined,
        dateOfBirth: needDob ? dateOfBirth : undefined,
        promoCode: referralActive ? undefined : (promoCode.trim() || undefined),
        referralCode: referralCode.trim() || undefined,
      });
      if (!result.ok) {
        setError(result.error || 'Could not save your details.');
        return;
      }

      try {
        sessionStorage.removeItem(PENDING_REF_KEY);
      } catch {
        /* ignore */
      }

      if (result.referral?.reward?.success || result.referral?.reward?.qualified || result.referral?.status === 'REWARDED') {
        showToast('Joined via referral. Your referral reward has been credited.', 'success');
      } else if (result.referral?.success || result.referral?.referralId) {
        showToast('Joined via referral. Your Free Bet unlocks after your first qualifying deposit.', 'success');
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
      } else {
        showToast('Profile saved. You are all set!', 'success');
      }
      navigate(resolveAfterComplete(searchParams.get('next')), { replace: true });
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
            {needPhone
              ? 'Google sign-in does not share your mobile number. Add it to secure your account'
              : 'Confirm your date of birth to continue'}
            {isWelcome && !referralActive && needPhone ? ' and optionally claim a signup promo' : ''}.
          </p>

          {error && <div className="register-error" role="alert">{error}</div>}

          <form className="register-form" onSubmit={handleSubmit} noValidate>
            {needPhone && (
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
            )}

            {needDob && (
              <div className="form-group">
                <label className="form-label" htmlFor="cp-dob">Date of birth</label>
                <input
                  className="form-input"
                  id="cp-dob"
                  type="date"
                  autoComplete="bday"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  required
                  max={new Date().toISOString().slice(0, 10)}
                  autoFocus={!needPhone}
                />
                <p className="register-lead" style={{ marginTop: 8, fontSize: '0.82rem' }}>
                  You must be 18 or older. Used for responsible gaming checks.
                </p>
              </div>
            )}

            <div className="form-group">
              <label className="form-label" htmlFor="cp-referral">Referral code (optional)</label>
              <input
                className="form-input"
                id="cp-referral"
                type="text"
                autoComplete="off"
                placeholder="e.g. UDAY123"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                maxLength={32}
              />
              {referralActive && (
                <p className="register-lead" style={{ marginTop: 8, fontSize: '0.82rem' }}>
                  You&apos;re joining through referral code <strong>{referralCode}</strong>.
                  Your Free Bet unlocks after your first qualifying deposit.
                  Initial signup promotions cannot be combined with this referral.
                </p>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="cp-promo">
                {referralActive ? 'Promo code (unavailable with referral)' : 'Promo code (optional)'}
              </label>
              <input
                className="form-input"
                id="cp-promo"
                type="text"
                autoComplete="off"
                placeholder={referralActive ? 'Disabled — referral active' : 'e.g. SPORTS500'}
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                maxLength={32}
                disabled={referralActive}
              />
              {!referralActive && (
                <>
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
                    Skip the promo for now if you prefer — you can still claim one later on Profile. Only one of SPORTS500, VIP1000, or LIVE100.
                  </p>
                </>
              )}
              {referralActive && (
                <p className="register-lead" style={{ marginTop: 8, fontSize: '0.82rem' }}>
                  Signup promo unavailable. Your account is joining through a referral.
                </p>
              )}
            </div>

            <button type="submit" className="register-submit-btn" disabled={loading}>
              {loading ? 'Saving…' : 'Continue'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
