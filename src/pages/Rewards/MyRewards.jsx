import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useBetSlip } from '../../context/BetSlipContext';
import { formatInr } from '../../utils/walletBalance';
import { apiFetch } from '../../utils/apiClient';
import './MyRewards.css';

export default function MyRewards() {
  const { user, isLoggedIn, openLoginModal } = useAuth();
  const { selectReward, setIsMobileOpen } = useBetSlip();
  const navigate = useNavigate();

  const [rewards, setRewards] = useState([]);
  const [available, setAvailable] = useState([]);
  const [history, setHistory] = useState([]);
  const [activeTab, setActiveTab] = useState('available');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchRewards = useCallback(async () => {
    if (!isLoggedIn) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/v1/rewards/my-rewards');
      const data = await res.json().catch(() => ({}));
      if (data?.success) {
        setRewards(data.rewards || []);
        setAvailable(data.available || []);
        setHistory(data.history || []);
      } else {
        setError(data.error || 'Failed to load rewards.');
      }
    } catch (err) {
      setError(err.message || 'Network error loading rewards.');
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    fetchRewards();
  }, [fetchRewards]);

  const handleUseReward = (reward) => {
    selectReward(reward);
    setIsMobileOpen(true);
    navigate('/sports');
  };

  if (!isLoggedIn) {
    return (
      <div className="my-rewards-page">
        <div className="my-rewards-container my-rewards-auth-prompt">
          <h2>🎁 My Promotional Rewards</h2>
          <p>Log in to view and use your available Free Bets, Bonus Credits, and promotional rewards.</p>
          <button className="my-rewards-btn my-rewards-btn--primary" onClick={openLoginModal}>
            Log In to View Rewards
          </button>
        </div>
      </div>
    );
  }

  const freeBetCount = available.filter((r) => r.rewardType === 'freebet').length;
  const bonusCount = available.filter((r) => r.rewardType === 'bonus').length;

  return (
    <div className="my-rewards-page">
      <div className="my-rewards-container">
        <div className="my-rewards-header">
          <div>
            <h1 className="my-rewards-title">My Promotional Rewards</h1>
            <p className="my-rewards-subtitle">
              Discrete reward instruments for sports betting. Each reward is placed as a single exact stake.
            </p>
          </div>
          <button className="my-rewards-refresh-btn" onClick={fetchRewards} disabled={loading}>
            {loading ? 'Refreshing…' : '↻ Refresh'}
          </button>
        </div>

        {/* Stats Summary Cards */}
        <div className="my-rewards-stats-grid">
          <div className="my-rewards-stat-card my-rewards-stat-card--freebet">
            <div className="my-rewards-stat-card__icon">🎁</div>
            <div className="my-rewards-stat-card__body">
              <span className="my-rewards-stat-card__label">Available Free Bets</span>
              <strong className="my-rewards-stat-card__value">{freeBetCount} Active</strong>
            </div>
          </div>
          <div className="my-rewards-stat-card my-rewards-stat-card--bonus">
            <div className="my-rewards-stat-card__icon">⭐</div>
            <div className="my-rewards-stat-card__body">
              <span className="my-rewards-stat-card__label">Available Bonus Credits</span>
              <strong className="my-rewards-stat-card__value">{bonusCount} Active</strong>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="my-rewards-tabs">
          <button
            className={`my-rewards-tab ${activeTab === 'available' ? 'active' : ''}`}
            onClick={() => setActiveTab('available')}
          >
            Available Rewards ({available.length})
          </button>
          <button
            className={`my-rewards-tab ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            Reward History ({history.length})
          </button>
        </div>

        {error && <div className="my-rewards-error">{error}</div>}

        {loading ? (
          <div className="my-rewards-loading">Loading your promotional rewards…</div>
        ) : activeTab === 'available' ? (
          available.length === 0 ? (
            <div className="my-rewards-empty">
              <div className="my-rewards-empty__icon">🎁</div>
              <h3>No Active Rewards</h3>
              <p>You currently do not have any active Free Bets or Bonus Credits. Check back during promotions or refer friends to earn Free Bets!</p>
              <button className="my-rewards-btn my-rewards-btn--outline" onClick={() => navigate('/promotions')}>
                View Promotions
              </button>
            </div>
          ) : (
            <div className="my-rewards-grid">
              {available.map((reward) => {
                const isFreeBet = reward.rewardType === 'freebet';
                const daysLeft = Math.max(0, Math.ceil((new Date(reward.expiresAt) - new Date()) / (1000 * 60 * 60 * 24)));
                return (
                  <div key={reward.rewardId} className={`my-reward-card my-reward-card--${reward.rewardType}`}>
                    <div className="my-reward-card__header">
                      <span className="my-reward-card__type-badge">
                        {isFreeBet ? '🎁 Free Bet' : '⭐ Bonus Credit'}
                      </span>
                      <span className="my-reward-card__status my-reward-card__status--available">
                        Available
                      </span>
                    </div>

                    <div className="my-reward-card__amount">
                      {formatInr(reward.amount)}
                    </div>

                    <h3 className="my-reward-card__title">{reward.title}</h3>

                    <div className="my-reward-card__rules">
                      <div className="my-reward-rule-pill">
                        🔒 Exact Stake: {formatInr(reward.amount)}
                      </div>
                      {reward.minOdds > 1.00 && (
                        <div className="my-reward-rule-pill">
                          ⚡ Min Odds: {reward.minOdds.toFixed(2)}
                        </div>
                      )}
                      {reward.singleOnly && (
                        <div className="my-reward-rule-pill">
                          🎯 Single Bets Only
                        </div>
                      )}
                      {isFreeBet && (
                        <div className="my-reward-rule-pill">
                          🏆 Net Profit Paid to Cash
                        </div>
                      )}
                    </div>

                    <div className="my-reward-card__footer">
                      <div className="my-reward-card__expiry">
                        ⏳ Expires in <strong>{daysLeft} day{daysLeft !== 1 ? 's' : ''}</strong>
                      </div>
                      <button
                        className="my-rewards-btn my-rewards-btn--use"
                        onClick={() => handleUseReward(reward)}
                      >
                        Use {isFreeBet ? 'Free Bet' : 'Bonus'} →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          history.length === 0 ? (
            <div className="my-rewards-empty">
              <p>No reward history found.</p>
            </div>
          ) : (
            <div className="my-rewards-history-table-wrap">
              <table className="my-rewards-history-table">
                <thead>
                  <tr>
                    <th>Reward</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Used In Bet</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((reward) => (
                    <tr key={reward.rewardId}>
                      <td>
                        <strong>{reward.title}</strong>
                        <div className="my-rewards-sub-id">{reward.rewardId}</div>
                      </td>
                      <td>
                        <span className={`my-reward-type-tag my-reward-type-tag--${reward.rewardType}`}>
                          {reward.rewardType.toUpperCase()}
                        </span>
                      </td>
                      <td><strong>{formatInr(reward.amount)}</strong></td>
                      <td>
                        <span className={`my-reward-status-pill my-reward-status-pill--${reward.status.toLowerCase()}`}>
                          {reward.status}
                        </span>
                      </td>
                      <td>
                        {reward.usedBetId ? (
                          <span className="my-rewards-bet-link">{reward.usedBetId}</span>
                        ) : '—'}
                      </td>
                      <td>{new Date(reward.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  );
}
