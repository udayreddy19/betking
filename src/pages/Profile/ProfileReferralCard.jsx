import { useCallback, useEffect, useRef, useState } from 'react';
import { getAccessToken } from '../../utils/apiClient';
import { formatInr } from '../../utils/walletBalance';

export default function ProfileReferralCard({ onLoaded } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;

  const load = useCallback(async () => {
    try {
      const token = getAccessToken();
      const res = await fetch('/api/v1/rewards/referrals/me', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load referral');
      setData(json);
      setError('');
      onLoadedRef.current?.(json);
    } catch (err) {
      setError(err.message || 'Referral unavailable');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error && !data) {
    return (
      <div className="profile-loyalty-box">
        <div className="profile-loyalty-head"><span>Refer &amp; Earn</span></div>
        <p className="profile-loyalty-meta">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="profile-loyalty-box">
        <div className="profile-loyalty-head"><span>Refer &amp; Earn</span></div>
        <p className="profile-loyalty-meta">Loading your referral link…</p>
      </div>
    );
  }

  if (!data.enabled) return null;

  const referredReward = Number(data.referredReward || 500);
  const referrerReward = Number(data.referrerReward || 500);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(data.link || data.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const share = async () => {
    if (navigator.share && data.link) {
      try {
        await navigator.share({
          title: 'Join OddsYra',
          text: `Use my referral code ${data.code} and get a ₹${referredReward} free bet on OddsYra.`,
          url: data.link,
        });
      } catch { /* cancelled */ }
    } else {
      copy();
    }
  };

  return (
    <div className="profile-loyalty-box">
      <div className="profile-loyalty-head">
        <span>Refer &amp; Earn</span>
        <strong>{formatInr(data.stats?.rewardsEarned || 0)}</strong>
      </div>
      <p className="profile-loyalty-meta">
        Invite friends with your link. They get ₹{referredReward} free bet when they sign up —
        and so do you (₹{referrerReward}). Signup promos cannot be combined with referral.
      </p>
      <p className="profile-loyalty-meta" style={{ fontWeight: 700 }}>
        Code: {data.code || '—'}
      </p>
      <p className="profile-loyalty-meta" style={{ wordBreak: 'break-all' }}>
        {data.link || '—'}
      </p>
      <div className="profile-actions profile-referral-actions" style={{ marginTop: 8 }}>
        <button type="button" className="profile-link-btn" onClick={copy}>
          {copied ? 'Copied' : 'Copy link'}
        </button>
        <button type="button" className="profile-link-btn outline" onClick={share}>
          Share
        </button>
      </div>
      <p className="profile-loyalty-meta" style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <span><strong>{data.stats?.invited || 0}</strong><br />Invited</span>
        <span><strong>{data.stats?.qualified || 0}</strong><br />Qualified</span>
        <span><strong>{data.stats?.pending || 0}</strong><br />Pending</span>
      </p>
      <p className="profile-loyalty-meta">
        Rewards earned: <strong>{formatInr(data.stats?.rewardsEarned || 0)}</strong>
        {' '}· Free bet reward: ₹{referredReward}
      </p>
      {Array.isArray(data.history) && data.history.length > 0 && (
        <ul className="profile-loyalty-meta" style={{ marginTop: 8, paddingLeft: 18 }}>
          {data.history.slice(0, 8).map((row) => (
            <li key={row.id}>
              {row.referred_mask || 'Friend'} — {row.status}
              {row.rewarded_at ? ` · rewarded` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
