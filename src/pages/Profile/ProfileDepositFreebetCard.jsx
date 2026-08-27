import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAccessToken } from '../../utils/apiClient';
import { formatInr } from '../../utils/walletBalance';

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

export default function ProfileDepositFreebetCard() {
  const [grants, setGrants] = useState([]);
  const [campaign, setCampaign] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const token = getAccessToken();
      const res = await fetch('/api/v1/rewards/deposit-freebet/me', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load free bets');
      setGrants(Array.isArray(json.grants) ? json.grants : []);
      setCampaign(json.campaign || null);
      setError('');
    } catch (err) {
      setError(err.message || 'Unavailable');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error && !grants.length && !campaign) return null;
  if (!campaign?.enabled && (!grants || grants.length === 0)) return null;

  return (
    <div className="profile-loyalty-box">
      <div className="profile-loyalty-head">
        <span>Free bets</span>
        <strong>
          {formatInr(grants.filter((g) => g.status === 'AVAILABLE').reduce((s, g) => s + Number(g.remainingAmount || 0), 0))}
        </strong>
      </div>
      {campaign?.enabled && (
        <p className="profile-loyalty-meta">
          {campaign.name}: deposit at least {formatInr(campaign.minDeposit)} to unlock up to{' '}
          {formatInr(campaign.maxFreeBet)} free bet ({Number(campaign.matchPercent)}% match).
        </p>
      )}
      {grants.length === 0 ? (
        <p className="profile-loyalty-meta">No deposit free bets yet.</p>
      ) : (
        <ul className="profile-loyalty-meta" style={{ marginTop: 8, paddingLeft: 18 }}>
          {grants.slice(0, 6).map((g) => (
            <li key={g.id} style={{ marginBottom: 8 }}>
              <strong>{formatInr(g.remainingAmount ?? g.freebetAmount)}</strong>
              {' '}· {g.status}
              <br />
              {g.promotionName || 'Deposit Free Bet'}
              <br />
              Received {formatDate(g.createdAt)}
              {g.expiresAt ? ` · Expires ${formatDate(g.expiresAt)}` : ''}
              {g.status === 'AVAILABLE' && (
                <>
                  {' '}
                  <Link to="/sports" className="profile-link-btn" style={{ display: 'inline-block', marginTop: 4 }}>
                    Bet now
                  </Link>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
