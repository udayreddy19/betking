import { useState, useMemo, useEffect } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getWalletBreakdown, formatInr } from '../../utils/walletBalance';
import { getLoyaltySummary, LOYALTY_MIN_REDEEM_POINTS } from '../../utils/loyaltyPoints';
import {
  BONUS_MIN_BET_ODDS,
} from '../../utils/wageringRules';
import {
  DEFAULT_DAILY_DEPOSIT_LIMIT,
  DEFAULT_DAILY_STAKE_LIMIT,
} from '../../utils/responsibleGaming';
import { FiDownload, FiShield, FiSliders, FiList, FiAlertTriangle, FiMessageSquare } from '../../icons';
import ProfileSupportTab from './ProfileSupportTab';
import ProfileKycCard from './ProfileKycCard';
import '../Legal/LegalPage.css';
import './Profile.css';

export default function Profile() {
  const {
    user,
    isLoggedIn,
    openDepositModal,
    openFinModal,
    redeemLoyaltyPoints,
    claimSignupPromoCode,
    transactions,
    updateRgLimits,
    selfExcludeAccount,
    showToast,
    changePassword,
  } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') || 'overview');
  const [txFilter, setTxFilter] = useState('all');
  const [txSearch, setTxSearch] = useState('');

  // RG Form States
  const [depositLimit, setDepositLimit] = useState(
    () => user?.dailyDepositLimit || DEFAULT_DAILY_DEPOSIT_LIMIT,
  );
  const [stakeLimit, setStakeLimit] = useState(
    () => user?.dailyStakeLimit || DEFAULT_DAILY_STAKE_LIMIT,
  );
  const [lossLimitDaily, setLossLimitDaily] = useState(() => user?.lossLimitDaily || 25000);
  const [lossLimitWeekly, setLossLimitWeekly] = useState(() => user?.lossLimitWeekly || 100000);
  const [realityMins, setRealityMins] = useState(() => user?.realityCheckIntervalMins || 60);
  const [selfExcludeDays, setSelfExcludeDays] = useState('7');
  const [promoCode, setPromoCode] = useState('');
  const [claimingPromo, setClaimingPromo] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab) setActiveTab(tab);
  }, [searchParams]);

  const selectTab = (tab) => {
    setActiveTab(tab);
    const next = new URLSearchParams(searchParams);
    if (tab === 'overview') next.delete('tab');
    else next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };

  // Filtered transactions (Hook call placed unconditionally before early return)
  const filteredTx = useMemo(() => {
    return (transactions || []).filter((tx) => {
      if (txFilter !== 'all' && tx.type !== txFilter) return false;
      if (txSearch.trim()) {
        const query = txSearch.toLowerCase();
        const label = (tx.label || '').toLowerCase();
        const method = (tx.method || '').toLowerCase();
        return label.includes(query) || method.includes(query) || String(tx.amount).includes(query);
      }
      return true;
    });
  }, [transactions, txFilter, txSearch]);

  // Compute wallet, loyalty and excluded before early return to satisfy Rules of Hooks
  const wallet = useMemo(() => user ? getWalletBreakdown(user) : null, [user]);
  const loyalty = useMemo(() => user ? getLoyaltySummary(user) : null, [user]);
  const excluded = user?.selfExcludedUntil && new Date(user.selfExcludedUntil) > new Date();

  if (!isLoggedIn) {
    return <Navigate to="/" replace />;
  }

  const handleSaveLimits = async (e) => {
    e.preventDefault();
    try {
      await updateRgLimits({
        dailyDepositLimit: Number(depositLimit),
        dailyStakeLimit: Number(stakeLimit),
        lossLimitDaily: Number(lossLimitDaily),
        lossLimitWeekly: Number(lossLimitWeekly),
        realityCheckIntervalMins: Number(realityMins),
      });
    } catch (err) {
      showToast(err.message || 'Could not save responsible gaming limits.', 'error');
    }
  };

  const handleSelfExclude = async () => {
    const days = Number(selfExcludeDays) || 7;
    if (window.confirm(`Are you sure you want to self-exclude your account for ${days} days? Betting and deposits will be blocked.`)) {
      await selfExcludeAccount(days);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      showToast('New passwords do not match.', 'error');
      return;
    }
    const result = await changePassword(currentPassword, newPassword);
    if (!result.ok) {
      showToast(result.error, 'error');
      return;
    }
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    showToast('Password updated.', 'success');
  };

  const exportCsv = () => {
    if (!transactions || transactions.length === 0) {
      showToast('No transactions available to export.', 'info');
      return;
    }

    const headers = ['Transaction ID', 'Date', 'Type', 'Description', 'Amount (INR)'];
    const rows = transactions.map((t) => [
      t.id,
      t.createdAt ? new Date(t.createdAt).toLocaleString() : '',
      t.type,
      `"${(t.label || '').replace(/"/g, '""')}"`,
      t.amount,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `oddsyra_statement_${user.email}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Transaction statement downloaded as CSV', 'success');
  };

  return (
    <div className="profile-page container" id="profile-page">
      <div className="profile-card">

        {/* Profile Top Bar */}
        <div className="profile-header">
          <div className="profile-avatar">👤</div>
          <div className="profile-user-info">
            <h1>{user.displayName}</h1>
            <p className="profile-email">{user.email}</p>
            {excluded && (
              <span className="profile-badge-excluded">
                <FiAlertTriangle /> Self-Excluded until {new Date(user.selfExcludedUntil).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>

        {/* Profile Tabs */}
        <div className="profile-tabs-nav">
          <button
            type="button"
            className={`profile-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => selectTab('overview')}
          >
            Overview
          </button>
          <button
            type="button"
            className={`profile-tab-btn ${activeTab === 'rg' ? 'active' : ''}`}
            onClick={() => selectTab('rg')}
          >
            <FiShield /> Responsible Gaming
          </button>
          <button
            type="button"
            className={`profile-tab-btn ${activeTab === 'security' ? 'active' : ''}`}
            onClick={() => selectTab('security')}
          >
            Security
          </button>
          <button
            type="button"
            className={`profile-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => selectTab('history')}
          >
            <FiList /> Transactions ({transactions.length})
          </button>
          <button
            type="button"
            className={`profile-tab-btn ${activeTab === 'support' ? 'active' : ''}`}
            onClick={() => selectTab('support')}
          >
            <FiMessageSquare /> Support
          </button>
        </div>

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <>
            <div className="profile-wallet-grid">
              <div className="profile-stat">
                <span className="label">Total balance</span>
                <span className="value">{formatInr(wallet.total)}</span>
              </div>
              <div className="profile-stat">
                <span className="label">Winnings</span>
                <span className="value profile-stat__winnings">{formatInr(wallet.winnings)}</span>
              </div>
              <div className="profile-stat">
                <span className="label">Bonus / Freebets</span>
                <span className="value profile-stat__bonus">{formatInr(wallet.bonusAndFreebets)}</span>
              </div>
              <div className="profile-stat">
                <span className="label">Deposited (locked)</span>
                <span className="value profile-stat__locked">{formatInr(wallet.lockedDeposit)}</span>
              </div>
            </div>

            <div className="profile-loyalty-box">
              <div className="profile-loyalty-head">
                <span>Loyalty · {loyalty.tierLabel} · {loyalty.pointsPer100} pts / ₹100</span>
                <strong>{loyalty.points} pts</strong>
              </div>
              <div className="profile-loyalty-bar">
                <div style={{ width: `${loyalty.progress}%` }} />
              </div>
              <p className="profile-loyalty-meta">
                {loyalty.canRedeem
                  ? `Ready to redeem for ${formatInr(loyalty.redeemValue)}`
                  : `${loyalty.pointsToUnlock} pts to unlock (min ${LOYALTY_MIN_REDEEM_POINTS})`}
              </p>
              <button
                type="button"
                className="profile-link-btn"
                disabled={!loyalty.canRedeem}
                onClick={() => redeemLoyaltyPoints()}
              >
                Redeem points
              </button>
            </div>

            <form
              className="profile-loyalty-box"
              onSubmit={async (e) => {
                e.preventDefault();
                setClaimingPromo(true);
                const result = await claimSignupPromoCode(promoCode);
                setClaimingPromo(false);
                if (result?.ok) setPromoCode('');
              }}
            >
              <div className="profile-loyalty-head">
                <span>Promo code</span>
              </div>
              <p className="profile-loyalty-meta">Enter a code to credit bonus, free bet, or cash. Limits are set per code.</p>
              <div className="profile-promo-row">
                <input
                  type="text"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                  placeholder="SPORTS500"
                  maxLength={32}
                  autoCapitalize="characters"
                  autoComplete="off"
                />
                <button type="submit" className="profile-link-btn" disabled={claimingPromo || !promoCode.trim()}>
                  {claimingPromo ? 'Claiming…' : 'Claim'}
                </button>
              </div>
            </form>

            <ProfileKycCard />

            <p className="profile-rules">
              Bonus bets need odds ≥ {BONUS_MIN_BET_ODDS.toFixed(2)} and must rotate 5 times. Withdrawing winnings while bonus is still in your wallet sets that bonus to ₹0.
              Free bets play like cash at any odds. Promo codes are once per Aadhaar/PAN. Verify identity to withdraw.
            </p>

            <div className="profile-actions">
              <button type="button" className="profile-link-btn" onClick={openDepositModal}>Deposit</button>
              <button type="button" className="profile-link-btn outline" onClick={() => openFinModal('withdraw')}>Withdraw</button>
              <Link to="/sports" className="profile-link-btn outline">Sports</Link>
            </div>
          </>
        )}

        {/* TAB 2: RESPONSIBLE GAMING */}
        {activeTab === 'rg' && (
          <div className="profile-rg-section">
            <div className="rg-card-box">
              <h3><FiSliders /> Daily Wagering, Loss & Deposit Limits</h3>
              <p>Server-enforced limits. Cash bets stop when net losses hit your daily or weekly cap. A reality check pauses play after the interval you set.</p>

              <form onSubmit={handleSaveLimits} className="rg-form">
                <div className="rg-form-group">
                  <label>Daily Deposit Limit (₹)</label>
                  <input
                    type="number"
                    min="500"
                    step="500"
                    value={depositLimit}
                    onChange={(e) => setDepositLimit(e.target.value)}
                  />
                  <small>Daily used: ₹{(user.dailyDepositUsed || 0).toLocaleString()} / ₹{Number(depositLimit).toLocaleString()}</small>
                </div>

                <div className="rg-form-group">
                  <label>Daily Stake Limit (₹)</label>
                  <input
                    type="number"
                    min="500"
                    step="500"
                    value={stakeLimit}
                    onChange={(e) => setStakeLimit(e.target.value)}
                  />
                  <small>Daily used: ₹{(user.dailyStakeUsed || 0).toLocaleString()} / ₹{Number(stakeLimit).toLocaleString()}</small>
                </div>

                <div className="rg-form-group">
                  <label>Daily loss limit (₹)</label>
                  <input
                    type="number"
                    min="500"
                    step="500"
                    value={lossLimitDaily}
                    onChange={(e) => setLossLimitDaily(e.target.value)}
                  />
                </div>

                <div className="rg-form-group">
                  <label>Weekly loss limit (₹)</label>
                  <input
                    type="number"
                    min="1000"
                    step="1000"
                    value={lossLimitWeekly}
                    onChange={(e) => setLossLimitWeekly(e.target.value)}
                  />
                </div>

                <div className="rg-form-group">
                  <label>Reality check interval (minutes)</label>
                  <input
                    type="number"
                    min="15"
                    step="15"
                    value={realityMins}
                    onChange={(e) => setRealityMins(e.target.value)}
                  />
                  <small>Minimum 15 minutes. Deposits and bets pause until you confirm.</small>
                </div>

                <button type="submit" className="profile-link-btn">Save Limits</button>
              </form>
            </div>

            <div className="rg-card-box warning">
              <h3><FiShield /> Self-Exclusion Tool</h3>
              <p>Take a break from betting. Self-exclusion immediately blocks all deposits and bet placement for the selected duration.</p>

              <div className="rg-exclude-controls">
                <select
                  value={selfExcludeDays}
                  onChange={(e) => setSelfExcludeDays(e.target.value)}
                  className="rg-select"
                >
                  <option value="7">7 Days Self-Exclusion</option>
                  <option value="30">30 Days Self-Exclusion</option>
                  <option value="90">90 Days Self-Exclusion</option>
                </select>

                <button
                  type="button"
                  className="profile-link-btn danger"
                  onClick={handleSelfExclude}
                  disabled={excluded}
                >
                  {excluded ? 'Currently Excluded' : 'Activate Self-Exclusion'}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'security' && (
          <div className="profile-rg-section">
            <div className="rg-card-box">
              <h3>Change password</h3>
              <p>Update the password for {user.email}. Use at least 6 characters.</p>
              <form onSubmit={handleChangePassword} className="rg-form">
                <div className="rg-form-group">
                  <label htmlFor="profile-current-password">Current password</label>
                  <input
                    id="profile-current-password"
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="rg-form-group">
                  <label htmlFor="profile-new-password">New password</label>
                  <input
                    id="profile-new-password"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    minLength={6}
                    required
                  />
                </div>
                <div className="rg-form-group">
                  <label htmlFor="profile-confirm-password">Confirm new password</label>
                  <input
                    id="profile-confirm-password"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    minLength={6}
                    required
                  />
                </div>
                <button type="submit" className="profile-link-btn">Update password</button>
              </form>
            </div>
          </div>
        )}

        {/* TAB 3: TRANSACTION HISTORY */}
        {activeTab === 'history' && (
          <div className="profile-history-section">
            <div className="history-toolbar">
              <div className="history-filters">
                {['all', 'deposit', 'withdraw', 'bet_win', 'bonus', 'loyalty_redeem'].map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className={`history-chip ${txFilter === cat ? 'active' : ''}`}
                    onClick={() => setTxFilter(cat)}
                  >
                    {cat === 'all' && 'All'}
                    {cat === 'deposit' && 'Deposits'}
                    {cat === 'withdraw' && 'Withdrawals'}
                    {cat === 'bet_win' && 'Wins'}
                    {cat === 'bonus' && 'Bonuses'}
                    {cat === 'loyalty_redeem' && 'Loyalty'}
                  </button>
                ))}
              </div>

              <div className="history-search-row">
                <input
                  type="search"
                  placeholder="Search transactions..."
                  value={txSearch}
                  onChange={(e) => setTxSearch(e.target.value)}
                  className="history-search-input"
                />
                <button type="button" className="profile-link-btn outline icon-btn" onClick={exportCsv}>
                  <FiDownload /> Export CSV
                </button>
              </div>
            </div>

            {filteredTx.length === 0 ? (
              <div className="history-empty">
                <p>No transactions found matching criteria.</p>
              </div>
            ) : (
              <div className="history-table-wrapper">
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Type</th>
                      <th>Description</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTx.map((tx) => {
                      const isPositive = ['deposit', 'bet_win', 'bonus', 'loyalty_redeem', 'cashout'].includes(tx.type);
                      return (
                        <tr key={tx.id}>
                          <td className="tx-time">
                            {tx.createdAt ? new Date(tx.createdAt).toLocaleDateString('en-IN', {
                              day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                            }) : '–'}
                          </td>
                          <td className="tx-type">
                            <span className={`tx-tag tx-tag--${tx.type}`}>
                              {tx.type.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="tx-desc">{tx.label}</td>
                          <td className={`tx-amount ${isPositive ? 'positive' : 'negative'}`}>
                            {isPositive ? '+' : ''}{formatInr(tx.amount)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'support' && (
          <ProfileSupportTab
            onOpenChat={() => window.dispatchEvent(new CustomEvent('oddsyra:open-support-chat'))}
          />
        )}

      </div>
    </div>
  );
}