import { useState, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useBetSlip } from '../../context/BetSlipContext';
import { useLiveSports } from '../../context/LiveSportsContext';
import { formatInr } from '../../utils/walletBalance';
import {
  FiUsers,
  FiDollarSign,
  FiActivity,
  FiShield,
  FiCheckCircle,
  FiXCircle,
  FiEdit,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiLock,
  FiUnlock,
  FiGift,
  FiSliders,
  FiCpu,
  FiTrendingUp,
} from '../../icons';
import './Admin.css';

export default function Admin() {
  const { user, updateUser, showToast, addFunds } = useAuth();
  const { placedBets, adminSettleBet } = useBetSlip();
  const liveMatches = useLiveMatchesSafe();

  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(() => {
    return localStorage.getItem('betking_admin_auth') === 'true';
  });
  const [inputEmail, setInputEmail] = useState('admin@betking.com');
  const [inputPassword, setInputPassword] = useState('admin123');
  const [inputPin, setInputPin] = useState('8888');
  const [authError, setAuthError] = useState('');

  const [activeTab, setActiveTab] = useState('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [betFilter, setBetFilter] = useState('all');

  // Form states for user editing
  const [editingBalance, setEditingBalance] = useState('');
  const [editingBonus, setEditingBonus] = useState('');
  const [editingFreebet, setEditingFreebet] = useState('');

  // Promo code generator state
  const [newCodeName, setNewCodeName] = useState('');
  const [newCodeAmount, setNewCodeAmount] = useState('1000');
  const [newCodeType, setNewCodeType] = useState('bonus'); // 'bonus' | 'cash' | 'freebet'
  const [promoCodes, setPromoCodes] = useState([
    { code: 'WELCOME1000', amount: 1000, type: 'bonus', claims: 142, active: true },
    { code: 'CRICKET500', amount: 500, type: 'freebet', claims: 89, active: true },
    { code: 'VIP2000', amount: 2000, type: 'cash', claims: 24, active: true },
  ]);

  // Odds multiplier override state
  const [globalOddsMargin, setGlobalOddsMargin] = useState(1.0);

  // Score override state
  const [overrideMatchId, setOverrideMatchId] = useState(null);
  const [overrideScore1, setOverrideScore1] = useState('');
  const [overrideScore2, setOverrideScore2] = useState('');
  const [overrideOvers, setOverrideOvers] = useState('');

  // Withdrawal requests queue
  const [withdrawals, setWithdrawals] = useState([
    { id: 'WD-8821', userEmail: 'demo@betking.com', userName: 'Demo User', amount: 2500, method: 'UPI', upiId: 'demo@upi', requestedAt: '2 mins ago', status: 'pending' },
    { id: 'WD-8820', userEmail: 'alex@betking.com', userName: 'Alex R.', amount: 5000, method: 'Paytm', upiId: '9876543210@paytm', requestedAt: '15 mins ago', status: 'pending' },
    { id: 'WD-8819', userEmail: 'rahul@betking.com', userName: 'Rahul M.', amount: 1200, method: 'GPay', upiId: 'rahul@okicici', requestedAt: '1 hour ago', status: 'approved' },
  ]);

  // Audit Logs
  const [auditLogs, setAuditLogs] = useState([
    { id: 1, action: 'System Initialization', detail: 'Admin portal initialized cleanly', time: 'Just now' },
    { id: 2, action: 'Live Polling Accelerated', detail: 'Live score refresh frequency set to 2.0s', time: '5 mins ago' },
  ]);

  const logAction = (action, detail) => {
    setAuditLogs((prev) => [
      { id: Date.now(), action, detail, time: new Date().toLocaleTimeString('en-IN') },
      ...prev,
    ]);
  };

  // Metrics calculations
  const totalUserBalance = (user?.balance || 0) + (user?.bonusBalance || 0) + (user?.freebetBalance || 0);
  const totalPlacedStakes = placedBets.reduce((acc, b) => acc + (b.stake || 0), 0);
  const pendingBets = placedBets.filter((b) => b.status === 'pending');
  const wonBets = placedBets.filter((b) => b.status === 'won');
  const totalPayouts = wonBets.reduce((acc, b) => acc + (b.payout || 0), 0);
  const grossGamingRevenue = totalPlacedStakes - totalPayouts;

  const handleUpdateUserBalance = (e) => {
    e.preventDefault();
    const newCash = parseFloat(editingBalance);
    const newBonus = parseFloat(editingBonus);
    const newFreebet = parseFloat(editingFreebet);

    updateUser({
      ...(Number.isFinite(newCash) ? { balance: newCash } : {}),
      ...(Number.isFinite(newBonus) ? { bonusBalance: newBonus } : {}),
      ...(Number.isFinite(newFreebet) ? { freebetBalance: newFreebet } : {}),
    });

    showToast('User balance updated successfully!', 'success');
    logAction('Balance Updated', `Cash: ₹${newCash || user.balance}, Bonus: ₹${newBonus || user.bonusBalance}`);
  };

  const handleQuickAddBalance = (amount) => {
    addFunds(amount, 'Admin Credit');
    showToast(`Added ₹${amount} credit to user account!`, 'success');
    logAction('Admin Credit', `Credited ₹${amount} to ${user?.displayName || 'User'}`);
  };

  const handleSettleBet = (betId, outcome) => {
    const settled = adminSettleBet(betId, outcome);
    if (settled) {
      showToast(`Bet ${betId.slice(-6)} set to ${outcome.toUpperCase()}!`, 'success');
      logAction('Bet Settled', `Bet ${betId} set to ${outcome}`);
    }
  };

  const handleApproveWithdrawal = (id) => {
    setWithdrawals((prev) => prev.map((w) => (w.id === id ? { ...w, status: 'approved' } : w)));
    showToast(`Withdrawal ${id} approved & paid out!`, 'success');
    logAction('Withdrawal Approved', `Approved request ${id}`);
  };

  const handleRejectWithdrawal = (id) => {
    setWithdrawals((prev) => prev.map((w) => (w.id === id ? { ...w, status: 'rejected' } : w)));
    showToast(`Withdrawal ${id} rejected & refunded`, 'info');
    logAction('Withdrawal Rejected', `Rejected request ${id}`);
  };

  const handleCreatePromoCode = (e) => {
    e.preventDefault();
    if (!newCodeName.trim()) return;
    const codeObj = {
      code: newCodeName.trim().toUpperCase(),
      amount: parseFloat(newCodeAmount) || 500,
      type: newCodeType,
      claims: 0,
      active: true,
    };
    setPromoCodes((prev) => [codeObj, ...prev]);
    setNewCodeName('');
    showToast(`Created promo code ${codeObj.code}!`, 'success');
    logAction('Promo Created', `Code ${codeObj.code} (${codeObj.type} ₹${codeObj.amount})`);
  };

  const handleAdminLogin = (e) => {
    if (e) e.preventDefault();
    if (
      (inputEmail.toLowerCase() === 'admin@betking.com' || inputEmail.toLowerCase() === 'demo@betking.com') &&
      (inputPassword === 'admin123' || inputPassword === 'demo1234') &&
      (inputPin === '8888' || inputPin === '1234' || !inputPin)
    ) {
      setIsAdminAuthenticated(true);
      localStorage.setItem('betking_admin_auth', 'true');
      setAuthError('');
      showToast('Admin Superuser Authenticated!', 'success');
      logAction('Admin Login', `Authenticated as ${inputEmail}`);
    } else {
      setAuthError('Invalid admin credentials or security PIN.');
      showToast('Invalid admin credentials!', 'error');
    }
  };

  const handleAdminLogout = () => {
    setIsAdminAuthenticated(false);
    localStorage.removeItem('betking_admin_auth');
    showToast('Logged out of Admin Portal.', 'info');
  };

  if (!isAdminAuthenticated) {
    return (
      <div className="admin-portal admin-portal--gate">
        <div className="admin-auth-card">
          <div className="admin-logo-icon admin-logo-icon--large"><FiShield /></div>
          <h2>BetKing Admin Login Gate</h2>
          <p className="admin-auth-sub">Restricted Access · Enter Superuser Credentials to Continue</p>

          {authError && <div className="admin-auth-error">{authError}</div>}

          {/* Credentials Display Card */}
          <div className="admin-credentials-box">
            <h4>🔑 Default Admin Credentials:</h4>
            <div className="cred-row">
              <span className="cred-label">Admin Email:</span>
              <code className="cred-val">admin@betking.com</code>
            </div>
            <div className="cred-row">
              <span className="cred-label">Admin Password:</span>
              <code className="cred-val">admin123</code>
            </div>
            <div className="cred-row">
              <span className="cred-label">Security PIN:</span>
              <code className="cred-val">8888</code>
            </div>
          </div>

          <form onSubmit={handleAdminLogin} className="admin-auth-form">
            <div className="form-group">
              <label>Admin Email</label>
              <input
                type="email"
                value={inputEmail}
                onChange={(e) => setInputEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                value={inputPassword}
                onChange={(e) => setInputPassword(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Security PIN (4-digit)</label>
              <input
                type="text"
                value={inputPin}
                onChange={(e) => setInputPin(e.target.value)}
                maxLength={4}
              />
            </div>

            <button type="submit" className="admin-btn admin-btn--primary admin-btn--full">
              <FiLock /> Unlock Admin Portal
            </button>

            <button
              type="button"
              className="admin-btn admin-btn--success admin-btn--full"
              onClick={() => {
                setInputEmail('admin@betking.com');
                setInputPassword('admin123');
                setInputPin('8888');
                setTimeout(() => handleAdminLogin(), 50);
              }}
            >
              ⚡ 1-Click Auto Login as Super Admin
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-portal">
      <div className="admin-inner">
        {/* Header Bar */}
        <div className="admin-header">
          <div className="admin-brand">
            <div className="admin-logo-icon"><FiShield /></div>
            <div>
              <h2>BetKing Admin Command Center</h2>
              <p>Platform Management, Risk Control & Real-time Operations</p>
            </div>
          </div>
          <div className="admin-header-actions">
            <span className="admin-badge admin-badge--live">
              <span className="live-dot" /> SYSTEM ONLINE
            </span>
            <button className="admin-btn admin-btn--danger admin-btn--sm" onClick={handleAdminLogout}>
              <FiLock /> Logout
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="admin-nav-tabs">
          <button className={`admin-tab ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
            <FiActivity /> Dashboard
          </button>
          <button className={`admin-tab ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
            <FiUsers /> Users & Wallets
          </button>
          <button className={`admin-tab ${activeTab === 'bets' ? 'active' : ''}`} onClick={() => setActiveTab('bets')}>
            <FiTrendingUp /> Bets & Settlements ({pendingBets.length})
          </button>
          <button className={`admin-tab ${activeTab === 'sports' ? 'active' : ''}`} onClick={() => setActiveTab('sports')}>
            <FiSliders /> Live Match Overrides
          </button>
          <button className={`admin-tab ${activeTab === 'payments' ? 'active' : ''}`} onClick={() => setActiveTab('payments')}>
            <FiDollarSign /> Payments & Withdrawals ({withdrawals.filter((w) => w.status === 'pending').length})
          </button>
          <button className={`admin-tab ${activeTab === 'promos' ? 'active' : ''}`} onClick={() => setActiveTab('promos')}>
            <FiGift /> Promos & Codes
          </button>
          <button className={`admin-tab ${activeTab === 'logs' ? 'active' : ''}`} onClick={() => setActiveTab('logs')}>
            <FiCpu /> Audit Logs
          </button>
        </div>

        {/* TAB 1: DASHBOARD OVERVIEW */}
        {activeTab === 'dashboard' && (
          <div className="admin-tab-content">
            <div className="admin-metrics-grid">
              <div className="admin-card metric-card">
                <div className="metric-icon" style={{ background: '#3b82f620', color: '#3b82f6' }}><FiUsers /></div>
                <div className="metric-info">
                  <span className="metric-label">Total Users</span>
                  <span className="metric-value">1,482</span>
                  <span className="metric-sub">+18 today</span>
                </div>
              </div>

              <div className="admin-card metric-card">
                <div className="metric-icon" style={{ background: '#10b98120', color: '#10b981' }}><FiDollarSign /></div>
                <div className="metric-info">
                  <span className="metric-label">Active User Balances</span>
                  <span className="metric-value">{formatInr(totalUserBalance)}</span>
                  <span className="metric-sub">Cash: {formatInr(user?.balance || 0)}</span>
                </div>
              </div>

              <div className="admin-card metric-card">
                <div className="metric-icon" style={{ background: '#f59e0b20', color: '#f59e0b' }}><FiActivity /></div>
                <div className="metric-info">
                  <span className="metric-label">Total Bets Placed</span>
                  <span className="metric-value">{placedBets.length}</span>
                  <span className="metric-sub">{pendingBets.length} Pending Resolution</span>
                </div>
              </div>

              <div className="admin-card metric-card">
                <div className="metric-icon" style={{ background: '#8b5cf620', color: '#8b5cf6' }}><FiTrendingUp /></div>
                <div className="metric-info">
                  <span className="metric-label">Gross Revenue (GGR)</span>
                  <span className="metric-value">{formatInr(grossGamingRevenue)}</span>
                  <span className="metric-sub">House Margin ~8.5%</span>
                </div>
              </div>
            </div>

            {/* Provider Health Grid */}
            <div className="admin-card">
              <div className="card-header">
                <h3>Live API Services & Provider Status</h3>
                <span className="admin-badge admin-badge--ok">All Systems Operational</span>
              </div>
              <div className="provider-status-grid">
                <div className="provider-box">
                  <span className="p-name">Cricbuzz Scores API</span>
                  <span className="p-status p-status--ok"><FiCheckCircle /> 2.0s Polling · OK</span>
                </div>
                <div className="provider-box">
                  <span className="p-name">ESPN Scoreboard API</span>
                  <span className="p-status p-status--ok"><FiCheckCircle /> Connected · OK</span>
                </div>
                <div className="provider-box">
                  <span className="p-name">FanCode Live Engine</span>
                  <span className="p-status p-status--ok"><FiCheckCircle /> Operational · OK</span>
                </div>
                <div className="provider-box">
                  <span className="p-name">Razorpay Gateway</span>
                  <span className="p-status p-status--ok"><FiCheckCircle /> Test/Live Ready</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: USER MANAGEMENT */}
        {activeTab === 'users' && (
          <div className="admin-tab-content">
            <div className="admin-card">
              <div className="card-header">
                <h3>Active User Account & Wallet Control</h3>
                <div className="admin-search-box">
                  <FiSearch />
                  <input
                    type="text"
                    placeholder="Search users..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>

              <div className="admin-user-profile-view">
                <div className="user-profile-card">
                  <div className="user-avatar-large">
                    {user?.displayName ? user.displayName.slice(0, 2).toUpperCase() : 'US'}
                  </div>
                  <div>
                    <h4>{user?.displayName || 'Demo User'}</h4>
                    <p>{user?.email || 'demo@betking.com'} · <span className="vip-tag">{user?.loyaltyRank || 'Rookie'} (Lvl {user?.loyaltyLevel || 1})</span></p>
                  </div>
                </div>

                <div className="quick-credit-bar">
                  <span className="label">Quick Balance Credit:</span>
                  <button className="admin-btn admin-btn--sm" onClick={() => handleQuickAddBalance(500)}>+ ₹500</button>
                  <button className="admin-btn admin-btn--sm" onClick={() => handleQuickAddBalance(1000)}>+ ₹1,000</button>
                  <button className="admin-btn admin-btn--sm" onClick={() => handleQuickAddBalance(5000)}>+ ₹5,000</button>
                  <button className="admin-btn admin-btn--sm admin-btn--primary" onClick={() => handleQuickAddBalance(10000)}>+ ₹10,000</button>
                </div>
              </div>

              {/* Edit Balance Form */}
              <form onSubmit={handleUpdateUserBalance} className="admin-form-grid">
                <div className="form-group">
                  <label>Cash Balance (₹)</label>
                  <input
                    type="number"
                    placeholder={user?.balance || 0}
                    value={editingBalance}
                    onChange={(e) => setEditingBalance(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Bonus Balance (₹)</label>
                  <input
                    type="number"
                    placeholder={user?.bonusBalance || 0}
                    value={editingBonus}
                    onChange={(e) => setEditingBonus(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Freebet Balance (₹)</label>
                  <input
                    type="number"
                    placeholder={user?.freebetBalance || 0}
                    value={editingFreebet}
                    onChange={(e) => setEditingFreebet(e.target.value)}
                  />
                </div>
                <div className="form-group form-group--btn">
                  <button type="submit" className="admin-btn admin-btn--primary">
                    <FiEdit /> Save Wallet Overrides
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* TAB 3: BETS MANAGEMENT */}
        {activeTab === 'bets' && (
          <div className="admin-tab-content">
            <div className="admin-card">
              <div className="card-header">
                <h3>Platform Placed Bets & Settlement Override</h3>
                <div className="filter-pills">
                  {['all', 'pending', 'won', 'lost', 'cashed_out'].map((st) => (
                    <button
                      key={st}
                      className={`filter-pill ${betFilter === st ? 'active' : ''}`}
                      onClick={() => setBetFilter(st)}
                    >
                      {st.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {filteredBets.length === 0 ? (
                <div className="admin-empty">No placed bets found under "{betFilter}" filter.</div>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Bet ID</th>
                        <th>Type / Source</th>
                        <th>Selections</th>
                        <th>Stake</th>
                        <th>Potential Return</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBets.map((bet) => (
                        <tr key={bet.id}>
                          <td className="font-mono">{bet.id?.slice(-8)}</td>
                          <td>
                            <span className="badge-pill">{bet.type?.toUpperCase()}</span>
                            <span className="badge-pill badge-pill--source">{bet.fundSource?.toUpperCase()}</span>
                          </td>
                          <td>
                            {bet.legs?.map((l) => (
                              <div key={l.id} className="leg-preview">
                                <strong>{l.selectionName}</strong> @ {l.odds} ({l.matchName})
                              </div>
                            ))}
                          </td>
                          <td className="font-bold">{formatInr(bet.stake)}</td>
                          <td className="font-bold text-green">{formatInr(bet.potentialReturn)}</td>
                          <td>
                            <span className={`status-tag status-tag--${bet.status}`}>
                              {bet.status?.toUpperCase()}
                            </span>
                          </td>
                          <td>
                            {bet.status === 'pending' ? (
                              <div className="table-actions">
                                <button className="admin-btn admin-btn--xs admin-btn--success" onClick={() => handleSettleBet(bet.id, 'won')}>
                                  Force Win
                                </button>
                                <button className="admin-btn admin-btn--xs admin-btn--danger" onClick={() => handleSettleBet(bet.id, 'lost')}>
                                  Force Loss
                                </button>
                                <button className="admin-btn admin-btn--xs" onClick={() => handleSettleBet(bet.id, 'cashed_out')}>
                                  Force Cashout
                                </button>
                              </div>
                            ) : (
                              <span className="text-muted">Settled</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: LIVE SPORTS OVERRIDES */}
        {activeTab === 'sports' && (
          <div className="admin-tab-content">
            <div className="admin-card">
              <div className="card-header">
                <h3>Global Odds Margin Multiplier Override</h3>
                <span className="font-bold">Current Boost: {globalOddsMargin.toFixed(2)}x</span>
              </div>
              <div className="slider-row">
                <input
                  type="range"
                  min="0.8"
                  max="2.5"
                  step="0.05"
                  value={globalOddsMargin}
                  onChange={(e) => {
                    setGlobalOddsMargin(parseFloat(e.target.value));
                    showToast(`Global Odds Multiplier set to ${e.target.value}x`, 'info');
                  }}
                />
                <button className="admin-btn admin-btn--sm" onClick={() => setGlobalOddsMargin(1.0)}>Reset to 1.0x</button>
              </div>
            </div>

            <div className="admin-card">
              <div className="card-header">
                <h3>Live Matches Control & Score Overrides</h3>
              </div>
              <div className="live-matches-grid">
                {liveMatches.length === 0 ? (
                  <div className="admin-empty">No active live matches found.</div>
                ) : (
                  liveMatches.map((m) => (
                    <div key={m.id} className="live-match-admin-card">
                      <div className="m-head">
                        <span className="m-league">{m.league || m.sport?.toUpperCase()}</span>
                        <span className="m-live-tag">LIVE</span>
                      </div>
                      <h4>{m.team1?.name} vs {m.team2?.name}</h4>
                      <p className="m-scores">
                        Score: <strong>{m.liveDetails?.runs ?? 0}/{m.liveDetails?.wickets ?? 0}</strong> ({m.liveDetails?.overs ?? '0.0'} ov)
                      </p>
                      <div className="m-actions">
                        <button className="admin-btn admin-btn--xs admin-btn--primary" onClick={() => {
                          const newRuns = prompt('Enter override Runs:', m.liveDetails?.runs || 0);
                          if (newRuns !== null) {
                            showToast(`Updated score for ${m.team1?.name}!`, 'success');
                            logAction('Score Override', `${m.team1?.name} set to ${newRuns} runs`);
                          }
                        }}>
                          Override Score
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: PAYMENTS & WITHDRAWALS */}
        {activeTab === 'payments' && (
          <div className="admin-tab-content">
            <div className="admin-card">
              <div className="card-header">
                <h3>Pending Withdrawal Requests</h3>
              </div>

              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Request ID</th>
                      <th>User</th>
                      <th>Amount</th>
                      <th>Method & Details</th>
                      <th>Requested At</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {withdrawals.map((w) => (
                      <tr key={w.id}>
                        <td className="font-mono">{w.id}</td>
                        <td>{w.userName} ({w.userEmail})</td>
                        <td className="font-bold text-green">{formatInr(w.amount)}</td>
                        <td>{w.method} · <span className="font-mono">{w.upiId}</span></td>
                        <td>{w.requestedAt}</td>
                        <td>
                          <span className={`status-tag status-tag--${w.status}`}>
                            {w.status.toUpperCase()}
                          </span>
                        </td>
                        <td>
                          {w.status === 'pending' ? (
                            <div className="table-actions">
                              <button className="admin-btn admin-btn--xs admin-btn--success" onClick={() => handleApproveWithdrawal(w.id)}>
                                <FiCheckCircle /> Approve Payout
                              </button>
                              <button className="admin-btn admin-btn--xs admin-btn--danger" onClick={() => handleRejectWithdrawal(w.id)}>
                                <FiXCircle /> Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-muted">Processed</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: PROMOS & CODES */}
        {activeTab === 'promos' && (
          <div className="admin-tab-content">
            <div className="admin-card">
              <div className="card-header">
                <h3>Create New Promo Code / Gift Voucher</h3>
              </div>

              <form onSubmit={handleCreatePromoCode} className="admin-form-grid">
                <div className="form-group">
                  <label>Code Name</label>
                  <input
                    type="text"
                    placeholder="e.g. MEGA2026"
                    value={newCodeName}
                    onChange={(e) => setNewCodeName(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Amount (₹)</label>
                  <input
                    type="number"
                    placeholder="1000"
                    value={newCodeAmount}
                    onChange={(e) => setNewCodeAmount(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Reward Type</label>
                  <select value={newCodeType} onChange={(e) => setNewCodeType(e.target.value)}>
                    <option value="bonus">Bonus Balance</option>
                    <option value="cash">Direct Cash Credit</option>
                    <option value="freebet">Freebet Voucher</option>
                  </select>
                </div>
                <div className="form-group form-group--btn">
                  <button type="submit" className="admin-btn admin-btn--primary">
                    <FiPlus /> Create Code
                  </button>
                </div>
              </form>
            </div>

            <div className="admin-card">
              <div className="card-header">
                <h3>Active Promo Codes & Vouchers</h3>
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Type</th>
                      <th>Reward Amount</th>
                      <th>Total Claims</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {promoCodes.map((p) => (
                      <tr key={p.code}>
                        <td className="font-mono font-bold">{p.code}</td>
                        <td><span className="badge-pill">{p.type.toUpperCase()}</span></td>
                        <td className="font-bold">{formatInr(p.amount)}</td>
                        <td>{p.claims} claims</td>
                        <td><span className="status-tag status-tag--won">ACTIVE</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 7: AUDIT LOGS */}
        {activeTab === 'logs' && (
          <div className="admin-tab-content">
            <div className="admin-card">
              <div className="card-header">
                <h3>System Admin Audit Log</h3>
              </div>
              <div className="audit-log-list">
                {auditLogs.map((log) => (
                  <div key={log.id} className="audit-item">
                    <span className="audit-time">{log.time}</span>
                    <span className="audit-action">{log.action}</span>
                    <span className="audit-detail">{log.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function useLiveMatchesSafe() {
  try {
    const { useLiveMatches } = require('../../context/LiveSportsContext');
    return useLiveMatches() || [];
  } catch {
    return [];
  }
}
