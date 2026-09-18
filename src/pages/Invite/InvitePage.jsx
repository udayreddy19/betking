import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import ProfileReferralCard from '../Profile/ProfileReferralCard';
import './InvitePage.css';

function GuestInviteLander({ referralCode }) {
  const registerTo = `/register?ref=${encodeURIComponent(referralCode)}`;

  useEffect(() => {
    try {
      sessionStorage.setItem('bk_pending_referral', referralCode);
    } catch { /* ignore */ }
    fetch('/api/v1/rewards/referrals/click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: referralCode, path: '/invite' }),
    }).catch(() => null);
  }, [referralCode]);

  return (
    <div className="invite-page invite-page--guest">
      <p className="invite-eyebrow">Friend invite</p>
      <h1>Claim your welcome Free Bet</h1>
      <p className="invite-guest-lead">
        Your friend invited you to OddsYra — live cricket betting with UPI deposits.
        Sign up with their code and unlock your reward after you join.
      </p>
      <div className="invite-guest-code" aria-label="Referral code">
        Code <strong>{referralCode}</strong>
      </div>
      <Link className="invite-guest-cta" to={registerTo}>
        Create account &amp; claim
      </Link>
      <p className="invite-guest-fine">
        18+ only. Terms apply. Already have an account?{' '}
        <Link to="/sports">Browse sports</Link>
      </p>
    </div>
  );
}

export default function InvitePage() {
  const { isLoggedIn, openLoginModal } = useAuth();
  const [searchParams] = useSearchParams();
  const [shareError, setShareError] = useState('');
  const [dash, setDash] = useState(null);

  const inboundRef = useMemo(
    () => String(searchParams.get('ref') || '').trim().toUpperCase(),
    [searchParams],
  );

  useEffect(() => {
    if (!isLoggedIn && !inboundRef) openLoginModal?.();
  }, [isLoggedIn, inboundRef, openLoginModal]);

  const onLoaded = useCallback((json) => {
    setDash(json);
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
          title: dash?.share?.ogTitle || 'Join OddsYra',
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

  if (!isLoggedIn && inboundRef) {
    return <GuestInviteLander referralCode={inboundRef} />;
  }

  if (!isLoggedIn) {
    return (
      <div className="invite-page invite-page--guest">
        <h1>Invite friends</h1>
        <p>Sign in to get your personal invite link and earn when friends play.</p>
        <button type="button" className="invite-guest-cta" onClick={() => openLoginModal?.()}>
          Sign in to invite
        </button>
        <p className="invite-guest-fine">
          New here? <Link to="/register">Create an account</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="invite-page">
      <h1>Invite friends</h1>
      <p>
        Friends get a signup reward after deposit{dash?.requireKyc ? ' + KYC' : ''}.
        You earn when they join — and {dash?.playCommissionRatePct ?? 5}% of their cash stakes when they play.
      </p>
      {dash?.campaignMultiplier > 1 && (
        <p className="invite-campaign">
          {dash.campaignLabel || 'Limited boost'}: rewards are {dash.campaignMultiplier}× right now
          {dash.campaignEndsAt ? ` until ${new Date(dash.campaignEndsAt).toLocaleDateString('en-IN')}` : ''}.
        </p>
      )}
      <ProfileReferralCard onLoaded={onLoaded} />
      {dash?.share && (
        <div className="invite-share-row">
          <button type="button" className="invite-share" onClick={() => share('whatsapp')}>WhatsApp</button>
          <button type="button" className="invite-share" onClick={() => share('telegram')}>Telegram</button>
          <button type="button" className="invite-share" onClick={() => share('native')}>Share / copy</button>
          {dash.share.qrUrl && (
            <img src={dash.share.qrUrl} alt="Referral QR" width={110} height={110} />
          )}
        </div>
      )}
      {dash?.milestones?.next && (
        <p className="invite-milestone">
          Next milestone: {dash.milestones.next.count} successful invites → ₹{dash.milestones.next.amount}
          {' '}({dash.milestones.successful || 0} so far)
        </p>
      )}
      {shareError && <p className="invite-error">{shareError}</p>}
    </div>
  );
}
