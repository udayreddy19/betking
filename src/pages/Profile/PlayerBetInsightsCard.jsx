import { useEffect, useState } from 'react';
import { apiFetch } from '../../utils/apiClient';
import { formatInr } from '../../utils/walletBalance';

export default function PlayerBetInsightsCard() {
  const [insights, setInsights] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/api/bets/insights?days=7');
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || 'Unavailable');
        setInsights(data);
        setError('');
      } catch (err) {
        if (!cancelled) setError(err.message || 'Unavailable');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (error && !insights) {
    return (
      <div className="profile-loyalty-box" style={{ marginBottom: 16 }}>
        <div className="profile-loyalty-head"><span>This week&apos;s betting</span></div>
        <p className="profile-loyalty-meta">{error}</p>
      </div>
    );
  }

  if (!insights) {
    return (
      <div className="profile-loyalty-box" style={{ marginBottom: 16 }}>
        <div className="profile-loyalty-head"><span>This week&apos;s betting</span></div>
        <p className="profile-loyalty-meta">Loading insights…</p>
      </div>
    );
  }

  const pnlPositive = Number(insights.pnl) >= 0;

  return (
    <div className="profile-loyalty-box" style={{ marginBottom: 16 }}>
      <div className="profile-loyalty-head">
        <span>This week&apos;s betting</span>
        <strong style={{ color: pnlPositive ? '#16a34a' : '#dc2626' }}>
          {pnlPositive ? '+' : ''}{formatInr(insights.pnl)}
        </strong>
      </div>
      <div className="profile-referral-stats-grid" style={{ marginTop: 8 }}>
        <div className="profile-referral-stat-card">
          <span className="profile-referral-stat-val">{insights.hitRate}%</span>
          <span className="profile-referral-stat-lbl">Hit rate</span>
        </div>
        <div className="profile-referral-stat-card">
          <span className="profile-referral-stat-val" style={{ color: '#16a34a' }}>{formatInr(insights.biggestWin)}</span>
          <span className="profile-referral-stat-lbl">Biggest win</span>
        </div>
        <div className="profile-referral-stat-card">
          <span className="profile-referral-stat-val">{insights.won}/{insights.won + insights.lost}</span>
          <span className="profile-referral-stat-lbl">W / L</span>
        </div>
      </div>
      <p className="profile-loyalty-meta" style={{ marginTop: 8 }}>
        Staked {formatInr(insights.stakeTotal)} · Returned {formatInr(insights.returnsTotal)}
        {insights.pending ? ` · ${insights.pending} open` : ''}
      </p>
    </div>
  );
}
