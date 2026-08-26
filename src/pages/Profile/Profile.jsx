import { useState, useMemo, useEffect } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getWalletBreakdown, formatInr } from '../../utils/walletBalance';
import { buildSpinGrantNotice } from '../../utils/spinGrantUi';
import { getLoyaltySummary, LOYALTY_MIN_REDEEM_POINTS } from '../../utils/loyaltyPoints';
import {
  BONUS_MIN_BET_ODDS,
} from '../../utils/wageringRules';
import {
  DEFAULT_DAILY_DEPOSIT_LIMIT,
  DEFAULT_DAILY_STAKE_LIMIT,
} from '../../utils/responsibleGaming';
import { FiDownload, FiShield, FiSliders, FiList, FiAlertTriangle, FiHome, FiLock } from '../../icons';
import SupportHeadsetIcon from '../../icons/SupportHeadsetIcon';
import ProfileSupportTab from './ProfileSupportTab';
import ProfileKycCard from './ProfileKycCard';
import ProfileReferralCard from './ProfileReferralCard';
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
    startCoolingOff,
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
  const [selfExcludeDays, setSelfExcludeDays] = useState('7');
  const [coolingOffHours, setCoolingOffHours] = useState('24');
  const [promoCode, setPromoCode] = useState('');
  const [claimingPromo, setClaimingPromo] = useState(false);
  const [joinedViaReferral, setJoinedViaReferral] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab) setActiveTab(tab);
  }, [searchParams]);

  useEffect(() => {
    if (window.location.hash !== '#kyc') return undefined;
    const timer = window.setTimeout(() => {
      document.getElementById('kyc')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [activeTab]);

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
  const spinGrantNotice = useMemo(
    () => (user?.spinGrants ? buildSpinGrantNotice(user.spinGrants) : null),
    [user?.spinGrants],
  );
  const loyalty = useMemo(() => user ? getLoyaltySummary(user) : null, [user]);
  const excluded = user?.selfExcludedUntil && new Date(user.selfExcludedUntil) > new Date();
  const initials = useMemo(() => {
    const name = String(user?.displayName || user?.email || 'U').trim();
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }, [user?.displayName, user?.email]);

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

  const handleCoolingOff = async () => {
    const hours = Number(coolingOffHours) || 24;
    if (window.confirm(`Start a ${hours}-hour cooling-off? Betting and deposits will be blocked until it ends.`)) {
      await startCoolingOff(hours);
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

  const tabItems = [
    { id: 'overview', label: 'Overview', short: 'Home', icon: FiHome },
    { id: 'rg', label: 'Responsible Gaming', short: 'Limits', icon: FiShield },
    { id: 'security', label: 'Security', short: 'Security', icon: FiLock },
    { id: 'history', label: `Transactions (${transactions.length})`, short: 'History', icon: FiList },
    { id: 'support', label: 'Support', short: 'Help', icon: SupportHeadsetIcon },
  ];

  return (
    <div className="profile-page container" id="profile-page">
      <div className="profile-card">

        {/* Profile Top Bar */}
        <div className="profile-header">
          <div className="profile-avatar" aria-hidden="true">{initials}</div>
          <div className="profile-user-info">
            <h1>{user.displayName}</h1>
            <p className="profile-email">{user.email}</p>
            {loyalty && (
              <span className="profile-tier-chip">{loyalty.tierLabel}</span>
            )}
            {excluded && (
              <span className="profile-badge-excluded">
                <FiAlertTriangle /> Self-Excluded until {new Date(user.selfExcludedUntil).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>

        {/* Profile Tabs */}
        <div className="profile-tabs-nav" role="tablist" aria-label="Profile sections">
          {tabItems.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`profile-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => selectTab(tab.id)}
            >
              {tab.icon ? (
                <span className="profile-tab-icon" aria-hidden="true">
                  <tab.icon size={18} />
                </span>
              ) : null}
              <span className="profile-tab-text profile-tab-text--full">{tab.label}</span>
              <span className="profile-tab-text profile-tab-text--short">{tab.short}</span>
            </button>
          ))}
        </div>

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <>
            <div className="profile-wallet-hero">
              <p className="profile-wallet-hero__label">Total balance</p>
              <p className="profile-wallet-hero__amount">{formatInr(wallet.total)}</p>
              <p className="profile-wallet-hero__meta">
                Available {formatInr(wallet.availableBalance)} · Withdrawable {formatInr(wallet.withdrawable)}
              </p>
              <div className="profile-wallet-hero__actions">
                <button type="button" className="profile-link-btn" onClick={openDepositModal}>Deposit</button>
                <button type="button" className="profile-link-btn outline" onClick={() => openFinModal('withdraw')}>Withdraw</button>
              </div>
            </div>

            <div className="profile-wallet-grid">
              <div className="profile-stat profile-stat--hide-mobile">
                <span className="label">Total balance</span>
                <span className="value">{formatInr(wallet.total)}</span>
              </div>
              <div className="profile-stat">
                <span className="label">Available</span>
                <span className="value">{formatInr(wallet.availableBalance)}</span>
              </div>
              <div className="profile-stat">
                <span className="label">Winnings</span>
                <span className="value profile-stat__winnings">{formatInr(wallet.winnings)}</span>
              </div>
              <div className="profile-stat">
                <span className="label">Withdrawable</span>
                <span className="value">{formatInr(wallet.withdrawable)}</span>
              </div>
              <div className="profile-stat">
                <span className="label">Locked deposit</span>
                <span className="value profile-stat__locked">{formatInr(wallet.lockedDeposit)}</span>
              </div>
              <div className="profile-stat">
                <span className="label">Reserved withdrawal</span>
                <span className="value profile-stat__locked">{formatInr(wallet.pendingWithdrawal)}</span>
              </div>
              <div className="profile-stat">
                <span className="label">Bonus</span>
                <span className="value profile-stat__bonus">{formatInr(wallet.bonus)}</span>
              </div>
              <div className="profile-stat">
                <span className="label">Free bet</span>
                <span className="value profile-stat__bonus">{formatInr(wallet.freebets)}</span>
              </div>
            </div>

            {spinGrantNotice && (
              <div className={`profile-spin-expiry${spinGrantNotice.urgent ? ' profile-spin-expiry--urgent' : ''}`} role="status">
                {spinGrantNotice.message}
              </div>
            )}

            <div className="profile-loyalty-box">
              <div className="profile-loyalty-head">
                <span>Loyalty · {loyalty.tierLabel} · {loyalty.pointsPer100} pts / ₹100</span>
                <strong>{loyalty.points} redeemable</strong>
              </div>
              <p className="profile-loyalty-meta">
                VIP progress: {loyalty.vipPoints} lifetime pts
                {loyalty.nextTier ? ` · ${loyalty.pointsToNext} to ${loyalty.nextLabel}` : ' · top tier'}
              </p>
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

            <ProfileReferralCard
              onLoaded={(data) => {
                if (data?.joinedViaReferral) setJoinedViaReferral(true);
              }}
            />

            <form
              className="profile-loyalty-box"
              onSubmit={async (e) => {
                e.preventDefault();
                if (joinedViaReferral) return;
                setClaimingPromo(true);
                const result = await claimSignupPromoCode(promoCode);
                setClaimingPromo(false);
                if (result?.ok) setPromoCode('');
              }}
            >
              <div className="profile-loyalty-head">
                <span>Promo code</span>
              </div>
              {joinedViaReferral ? (
                <p className="profile-loyalty-meta">
                  Signup promo unavailable. Your account joined through a referral.
                  Referral rewards are applied according to the referral program.
                </p>
              ) : (
                <p className="profile-loyalty-meta">
                  Enter a code to credit bonus, free bet, or cash. SPORTS500, VIP1000, and LIVE100 — only one of these three per account.
                  Accounts that joined via referral cannot claim initial signup promotions.
                </p>
              )}
              {!joinedViaReferral && (
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
              )}
            </form>

            <ProfileKycCard />

            <p className="profile-rules">
              Bonus bets need odds ≥ {BONUS_MIN_BET_ODDS.toFixed(2)} and must rotate 5 times. Withdrawing winnings while bonus is still in your wallet sets that bonus to ₹0.
              Free bets play like cash at any odds. Promo codes are once per Aadhaar/PAN. Welcome codes SPORTS500 / VIP1000 / LIVE100 are one per account. Verify identity to withdraw.
            </p>

            <div className="profile-actions profile-actions--overview">
              <Link to="/sports" className="profile-link-btn outline profile-link-btn--block">Back to Sports</Link>
            </div>
          </>
        )}

        {/* TAB 2: RESPONSIBLE GAMING */}
        {activeTab === 'rg' && (
          <div className="profile-rg-section">
            <div className="rg-card-box">
              <h3><FiSliders /> Daily Wagering, Loss & Deposit Limits</h3>
              <p>Server-enforced limits. Cash bets stop when net losses hit your daily or weekly cap. You are logged out after 30 minutes of inactivity.</p>

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

                <button type="submit" className="profile-link-btn">Save Limits</button>
              </form>
            </div>

            <div className="rg-card-box warning">
              <h3><FiShield /> Cooling-off</h3>
              <p>
                Take a short break. Cooling-off blocks deposits and bet placement until the period ends.
                {user?.coolingOffUntil && new Date(user.coolingOffUntil) > new Date()
                  ? ` Active until ${new Date(user.coolingOffUntil).toLocaleString('en-IN')}.`
                  : ''}
              </p>
              <div className="rg-exclude-controls">
                <select
                  value={coolingOffHours}
                  onChange={(e) => setCoolingOffHours(e.target.value)}
                  className="rg-select"
                >
                  <option value="24">24 Hours</option>
                  <option value="48">48 Hours</option>
                  <option value="72">72 Hours</option>
                  <option value="168">7 Days</option>
                </select>
                <button
                  type="button"
                  className="profile-link-btn outline"
                  onClick={handleCoolingOff}
                  disabled={Boolean(user?.coolingOffUntil && new Date(user.coolingOffUntil) > new Date())}
                >
                  Start cooling-off
                </button>
              </div>
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
              <>
                <div className="history-mobile-list" aria-label="Transaction list">
                  {filteredTx.map((tx) => {
                    const isPositive = ['deposit', 'bet_win', 'bonus', 'loyalty_redeem', 'cashout'].includes(tx.type);
                    return (
                      <article key={tx.id} className="history-mobile-card">
                        <div className="history-mobile-card__top">
                          <span className={`tx-tag tx-tag--${tx.type}`}>
                            {tx.type.replace('_', ' ')}
                          </span>
                          <time className="history-mobile-card__time">
                            {tx.createdAt ? new Date(tx.createdAt).toLocaleDateString('en-IN', {
                              day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                            }) : '–'}
                          </time>
                        </div>
                        <p className="history-mobile-card__desc">{tx.label}</p>
                        <p className={`history-mobile-card__amount ${isPositive ? 'positive' : 'negative'}`}>
                          {isPositive ? '+' : ''}{formatInr(tx.amount)}
                        </p>
                        <p className="history-mobile-card__refs">
                          Tx {tx.id}
                          {tx.ledgerEntryId ? ` · Ledger ${tx.ledgerEntryId}` : ''}
                          {tx.relatedBetId ? ` · Bet ${tx.relatedBetId}` : ''}
                          {tx.providerPaymentId ? ` · Pay ${tx.providerPaymentId}` : ''}
                          {tx.utr ? ` · UTR ${tx.utr}` : ''}
                        </p>
                      </article>
                    );
                  })}
                </div>

                <div className="history-table-wrapper">
                  <table className="history-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Type</th>
                        <th>Description</th>
                        <th>References</th>
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
                            <td className="tx-desc" style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                              {tx.id}
                              {tx.ledgerEntryId ? ` · ${tx.ledgerEntryId}` : ''}
                              {tx.relatedBetId ? ` · ${tx.relatedBetId}` : ''}
                            </td>
                            <td className={`tx-amount ${isPositive ? 'positive' : 'negative'}`}>
                              {isPositive ? '+' : ''}{formatInr(tx.amount)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
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