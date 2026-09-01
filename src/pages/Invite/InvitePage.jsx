import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import ProfileReferralCard from '../Profile/ProfileReferralCard';
import './InvitePage.css';

export default function InvitePage() {
  const { isLoggedIn, openLoginModal } = useAuth();
  const [shareError, setShareError] = useState('');

  useEffect(() => {
    if (!isLoggedIn) openLoginModal?.();
  }, [isLoggedIn, openLoginModal]);

  const share = useCallback(async (url) => {
    setShareError('');
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Join OddsYra', url, text: 'Use my referral link on OddsYra.' });
        return;
      }
      await navigator.clipboard.writeText(url);
    } catch (err) {
      setShareError(err.message || 'Share cancelled');
    }
  }, []);

  if (!isLoggedIn) {
    return <Navigate to="/register" replace />;
  }

  return (
    <div className="invite-page">
      <h1>Invite friends</h1>
      <p>Share your code. Rewards only credit after the referred user qualifies — the same abuse rules as Profile apply.</p>
      <ProfileReferralCard />
      {shareError && <p className="invite-error">{shareError}</p>}
      <button
        type="button"
        className="invite-share"
        onClick={() => share(window.location.origin + '/register')}
      >
        Open share sheet
      </button>
    </div>
  );
}
