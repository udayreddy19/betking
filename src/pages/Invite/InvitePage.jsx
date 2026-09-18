import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import ProfileReferralCard from '../Profile/ProfileReferralCard';
import './InvitePage.css';

export default function InvitePage() {
  const { isLoggedIn, openLoginModal } = useAuth();
  const [shareError, setShareError] = useState('');
  const [dash, setDash] = useState(null);

  useEffect(() => {
    if (!isLoggedIn) openLoginModal?.();
  }, [isLoggedIn, openLoginModal]);

  const onLoaded = useCallback((json) => {
    setDash(json);
    // Record click when landing with ?ref= for analytics
    try {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get('ref');
      if (ref) {
        fetch('/api/v1/rewards/referrals/click', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: ref, path: '/invite' }),
        }).catch(() => null);
      }
    } catch { /* ignore */ }
  }, []);

  const shareLink = dash?.share?.link || dash?.link;
  const share = useCallback(async (target) => {
    setShareError('');
    try {
      if (target === 'whatsapp' && dash?.share?.whatsapp) {
        window.open(dash.share.whatsapp, '_blank', 'noopener,noreferrer');
        return;
      }
      if (target === 'telegram' && dash?.share?.telegram) {
        window.open(dash.share.telegram, '_blank', 'noopener,noreferrer');
        return;
      }
      if (navigator.share && shareLink) {
        await navigator.share({
          title: 'Join OddsYra',
          url: shareLink,
          text: dash?.share?.message || 'Use my referral link on OddsYra.',
        });
        return;
      }
      await navigator.clipboard.writeText(shareLink || window.location.href);
    } catch (err) {
      setShareError(err.message || 'Share cancelled');
    }
  }, [dash, shareLink]);

  if (!isLoggedIn) {
    return <Navigate to="/register" replace />;
  }

  return (
    <div className="invite-page">
      <h1>Invite friends</h1>
      <p>
        Friends get a signup reward after deposit{dash?.requireKyc ? ' + KYC' : ''}.
        You earn when they join — and {dash?.playCommissionRatePct ?? 5}% of their cash stakes when they play.
      </p>
      <ProfileReferralCard onLoaded={onLoaded} />
      {dash?.share && (
        <div className="invite-share-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 16, alignItems: 'center' }}>
          <button type="button" className="invite-share" onClick={() => share('whatsapp')}>WhatsApp</button>
          <button type="button" className="invite-share" onClick={() => share('telegram')}>Telegram</button>
          <button type="button" className="invite-share" onClick={() => share('native')}>Share / copy</button>
          {dash.share.qrUrl && (
            <img src={dash.share.qrUrl} alt="Referral QR" width={110} height={110} style={{ borderRadius: 8 }} />
          )}
        </div>
      )}
      {dash?.milestones?.next && (
        <p style={{ marginTop: 12, opacity: 0.85 }}>
          Next milestone: {dash.milestones.next.count} successful invites → ₹{dash.milestones.next.amount}
          {' '}({dash.milestones.successful || 0} so far)
        </p>
      )}
      {shareError && <p className="invite-error">{shareError}</p>}
    </div>
  );
}
