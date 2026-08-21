import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import BrandLogo, { BrandWordmark } from '../../components/BrandLogo/BrandLogo';
import { setAccessToken } from '../../utils/apiClient';
import '../Auth/AuthPages.css';

const OAUTH_CALLBACK_KEY = 'bk_google_oauth_callback';
const inFlightCallbacks = new Set();

function callbackStorageKey(code, state) {
  return `${OAUTH_CALLBACK_KEY}:${code}:${state}`;
}

export default function OAuthGoogleCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { completeGoogleAuth, showToast, isLoggedIn, user } = useAuth();
  const [error, setError] = useState('');

  // Already signed in with a phone — leave the callback page.
  // Missing-phone users are sent to /complete-profile by the success path / PhoneRequiredGate.
  useEffect(() => {
    if (!isLoggedIn) return;
    const phoneDigits = String(user?.phone || '').replace(/\D/g, '');
    if (phoneDigits.length >= 10) {
      navigate('/', { replace: true });
    }
  }, [isLoggedIn, user?.phone, navigate]);

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const oauthError = searchParams.get('error');

    if (oauthError) {
      setError('Google sign-in was cancelled.');
      return;
    }

    if (!code || !state) {
      setError('Missing Google sign-in response.');
      return;
    }

    const storageKey = callbackStorageKey(code, state);
    if (sessionStorage.getItem(storageKey) === 'done') {
      navigate('/', { replace: true });
      return;
    }
    if (inFlightCallbacks.has(storageKey)) {
      return;
    }
    inFlightCallbacks.add(storageKey);
    sessionStorage.setItem(storageKey, 'pending');

    (async () => {
      try {
        const res = await fetch('/api/auth/google/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ code, state }),
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.success) {
          sessionStorage.removeItem(storageKey);
          setError(data.error || 'Google sign-in failed.');
          return;
        }

        sessionStorage.setItem(storageKey, 'done');

        if (data.accessToken) {
          setAccessToken(data.accessToken);
        }

        await completeGoogleAuth(data.user, { isNewUser: data.isNewUser });

        const needsPhone = !String(data.user?.phone || '').replace(/\D/g, '');
        showToast(
          data.isNewUser
            ? 'Welcome to OddsYra!'
            : `Welcome back, ${data.user?.displayName || 'player'}!`,
        );
        navigate(needsPhone ? '/complete-profile?welcome=1' : '/', { replace: true });
      } catch {
        sessionStorage.removeItem(storageKey);
        setError('Google sign-in failed. Please try again.');
      } finally {
        inFlightCallbacks.delete(storageKey);
      }
    })();
  }, [searchParams, completeGoogleAuth, navigate, showToast]);

  return (
    <div className="auth-page-container">
      <div className="auth-card">
        <div className="auth-logo">
          <BrandLogo size={56} />
          <BrandWordmark />
        </div>

        {error ? (
          <>
            <h1 className="auth-title">Sign-in failed</h1>
            <p className="auth-message auth-message--error">{error}</p>
            <button type="button" className="auth-submit-btn" onClick={() => navigate('/', { replace: true })}>
              Back to home
            </button>
          </>
        ) : (
          <>
            <h1 className="auth-title">Signing you in</h1>
            <p className="auth-message">Completing Google sign-in…</p>
          </>
        )}
      </div>
    </div>
  );
}
