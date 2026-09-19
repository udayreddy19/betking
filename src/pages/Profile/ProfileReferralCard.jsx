import { useCallback, useEffect, useRef, useState } from 'react';
import { getAccessToken } from '../../utils/apiClient';
import { formatInr } from '../../utils/walletBalance';

export default function ProfileReferralCard({ onLoaded } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [showAll, setShowAll] = useState(false);
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
  const rewardLabel = data.rewardLabel || (data.rewardKind === 'bonus' ? 'Bonus' : 'Free Bet');
  const historyList = Array.isArray(data.history) ? data.history : [];
  const totalEarned = Number(data.stats?.rewardsEarned || 0);

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
          text: `Use my referral code ${data.code} and get a ₹${referredReward} ${rewardLabel.toLowerCase()} on OddsYra.`,
          url: data.link,
        });
      } catch { /* cancelled */ }
    } else {
      copy();
    }
  };

  const getStatusBadge = (status, rewardedAt) => {
    const s = String(status || '').toUpperCase();
    if (s === 'REWARDED' || rewardedAt) {
      return <span className="profile-referral-badge profile-referral-badge--rewarded">✓ Rewarded</span>;
    }
    if (s === 'QUALIFIED') {
      return <span className="profile-referral-badge profile-referral-badge--qualified">Qualified</span>;
    }
    return <span className="profile-referral-badge profile-referral-badge--pending">Pending</span>;
  };

  return (
    <div className="profile-loyalty-box profile-referral-card">
      <div className="profile-loyalty-head">
        <span style={{ fontWeight: 800 }}>🎁 Refer &amp; Earn</span>
        <strong style={{ color: 'var(--color-primary-dark, #16a34a)', fontSize: '1rem' }}>
          {formatInr(totalEarned)}
        </strong>
      </div>

      <p className="profile-loyalty-meta" style={{ margin: '4px 0 12px', lineHeight: 1.45 }}>
        Invite friends with your link. They get <strong>₹{referredReward} {rewardLabel}</strong>
        {data.minDeposit > 0 ? <> after depositing ₹{data.minDeposit}+</> : ' on signup'}
        {data.requireFirstBet ? <> and a first bet</> : null}
        {data.requireKyc ? <> and KYC</> : null}
        {' — '}you get <strong>₹{referrerReward} {rewardLabel}</strong>
        {data.playCommissionEnabled !== false && (
          <> plus <strong>{data.playCommissionRatePct ?? 5}% of their cash stakes</strong> when they play</>
        )}
        {Number(data.campaignMultiplier) > 1 && data.campaignLabel ? (
          <> · <strong>{data.campaignLabel}</strong> ({data.campaignMultiplier}×)</>
        ) : null}
        .
      </p>

      {/* Referral Link / Code Box */}
      <div className="profile-referral-link-box">
        <span className="profile-referral-link-text">
          {data.link || `Code: ${data.code}`}
        </span>
        <button type="button" className="profile-link-btn" onClick={copy} style={{ margin: 0, padding: '6px 14px', fontSize: '0.8rem' }}>
          {copied ? '✓ Copied' : 'Copy link'}
        </button>
        <button type="button" className="profile-link-btn outline" onClick={share} style={{ margin: 0, padding: '6px 14px', fontSize: '0.8rem' }}>
          Share
        </button>
      </div>

      {/* 3-Column Summary Stats Grid */}
      <div className="profile-referral-stats-grid">
        <div className="profile-referral-stat-card">
          <span className="profile-referral-stat-val">{data.stats?.invited || 0}</span>
          <span className="profile-referral-stat-lbl">Invited</span>
        </div>
        <div className="profile-referral-stat-card">
          <span className="profile-referral-stat-val" style={{ color: '#2563eb' }}>{data.stats?.qualified || 0}</span>
          <span className="profile-referral-stat-lbl">Qualified</span>
        </div>
        <div className="profile-referral-stat-card">
          <span className="profile-referral-stat-val" style={{ color: '#d97706' }}>{data.stats?.pending || 0}</span>
          <span className="profile-referral-stat-lbl">Pending</span>
        </div>
      </div>

      <div className="profile-loyalty-meta" style={{ margin: '8px 0 10px', fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
        Total earned: <strong style={{ color: 'var(--color-text)' }}>{formatInr(totalEarned)}</strong>
        {Number(data.stats?.playEarnings || 0) > 0 && (
          <> · From play: <strong>{formatInr(data.stats.playEarnings)}</strong></>
        )}
        {' · '}Signup bonus: <strong>₹{referrerReward} {rewardLabel}</strong>
        {data.playCommissionEnabled !== false && (
          <> · Play share: <strong>{data.playCommissionRatePct ?? 5}%</strong></>
        )}
      </div>

      {/* Referred Friends History (Fixed-Height Scrollable Container) */}
      {historyList.length > 0 && (
        <div className="profile-referral-history-section">
          <div className="profile-referral-history-header">
            <span>Referred Friends ({historyList.length})</span>
            {historyList.length > 4 && (
              <button
                type="button"
                className="profile-referral-toggle-btn"
                onClick={() => setShowAll((prev) => !prev)}
              >
                {showAll ? 'Collapse' : `View All (${historyList.length})`}
              </button>
            )}
          </div>

          <div
            className={`profile-referral-scroll-list ${showAll ? 'profile-referral-scroll-list--expanded' : ''}`}
            tabIndex={0}
            role="region"
            aria-label="Referred friends list"
          >
            {historyList.map((row) => (
              <div key={row.id || row.referred_user_id || row.created_at} className="profile-referral-item">
                <div className="profile-referral-user">
                  <span className="profile-referral-avatar-icon">👤</span>
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--color-text)' }}>{row.referred_mask || 'Friend'}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>
                      {row.rewarded_at
                        ? `₹${referrerReward} signup · ${formatInr(Number(row.play_commission_total || 0))} from play`
                        : (row.status === 'QUALIFIED' ? 'Pending reward credit' : 'Awaiting signup reward')}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {getStatusBadge(row.status, row.rewarded_at)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
