import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../../context/AuthContext';
import { useBetSlip } from '../../context/BetSlipContext';
import { useLiveMatches } from '../../context/LiveSportsContext';
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
  FiGift,
  FiSliders,
  FiCpu,
  FiTrendingUp,
} from '../../icons';
import './Admin.css';

export default function Admin() {
  const { user, updateUser, showToast, addFunds } = useAuth();
  const { placedBets, adminSettleBet } = useBetSlip();
  const liveMatches = useLiveMatches() || [];

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

  // Emergency & Risk Controls
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
  const [isLiveBettingFrozen, setIsLiveBettingFrozen] = useState(false);
  const [settlementSpeed, setSettlementSpeed] = useState('instant');

  // Master Global Financial & Bet Limits
  const [minDeposit, setMinDeposit] = useState('500');
  const [minWithdrawal, setMinWithdrawal] = useState('1000');
  const [depositBonusPct, setDepositBonusPct] = useState('100');
  const [minStake, setMinStake] = useState('10');
  const [maxStake, setMaxStake] = useState('50000');
  const [autoApproveWithdrawalLimit, setAutoApproveWithdrawalLimit] = useState('2000');

  // VIP & Loyalty Manager
  const [loyaltyRate, setLoyaltyRate] = useState('100'); // 100 points = ₹10
  const [vipXpBoost, setVipXpBoost] = useState('1.5');

  // Payment Gateway & Direct UPI Manager
  const [gatewayMode, setGatewayMode] = useState('test'); // 'test' | 'live'
  const [adminUpiId, setAdminUpiId] = useState('betking.pay@icici');
  const [adminPaytmNumber, setAdminPaytmNumber] = useState('9876543210');

  // Anti-Fraud & Risk Flagged Accounts
  const [flaggedAccounts, setFlaggedAccounts] = useState([
    { id: 1, email: 'user992@tempmail.com', ip: '49.37.142.12', risk: 'HIGH', reason: 'Multiple account creations from same IP', status: 'flagged' },
    { id: 2, email: 'bonus_hunter@mail.com', ip: '103.22.10.88', risk: 'MEDIUM', reason: 'Rapid deposit/withdrawal requests without wagering', status: 'flagged' },
  ]);

  // Wheel of Fortune Outcome Rigging
  const [wheelOutcome, setWheelOutcome] = useState('random'); // 'random' | 'cash_500' | 'bonus_1000' | 'freebet_200' | 'no_win'

  // Casino Rigging & Game Engine Controls
  const [globalCasinoRtp, setGlobalCasinoRtp] = useState(96.5);
  const [forcedCasinoOutcome, setForcedCasinoOutcome] = useState('random');
  const [forcedAviatorCrashPoint, setForcedAviatorCrashPoint] = useState('');

  // Sportsbook Odds Margins per Sport
  const [sportMargins, setSportMargins] = useState({
    cricket: 5.0,
    soccer: 4.0,
    tennis: 3.5,
    basketball: 4.5,
  });

  // Live Toast Notification Dispatcher
  const [dispatchToastText, setDispatchToastText] = useState('');
  const [dispatchToastType, setDispatchToastType] = useState('success');

  // Announcement Ticker Broadcast
  const [activeBroadcasts, setActiveBroadcasts] = useState([
    { id: 1, text: '🟢 IPL SRL Live Betting is ON — Instant Settlement Active', active: true },
    { id: 2, text: '⚡ Instant UPI & Paytm Withdrawals Enabled', active: true },
  ]);
  const [newBroadcastText, setNewBroadcastText] = useState('');

  // User Editing state
  const [editingBalance, setEditingBalance] = useState('');
  const [editingBonus, setEditingBonus] = useState('');
  const [editingFreebet, setEditingFreebet] = useState('');

  // Promo code generator state
  const [newCodeName, setNewCodeName] = useState('');
  const [newCodeAmount, setNewCodeAmount] = useState('1000');
  const [newCodeType, setNewCodeType] = useState('bonus');
  const [promoCodes, setPromoCodes] = useState([
    { code: 'WELCOME1000', amount: 1000, type: 'bonus', claims: 142, active: true },
    { code: 'CRICKET500', amount: 500, type: 'freebet', claims: 89, active: true },
    { code: 'VIP2000', amount: 2000, type: 'cash', claims: 24, active: true },
  ]);

  // Odds multiplier override state
  const [globalOddsMargin, setGlobalOddsMargin] = useState(1.0);

  // Withdrawal requests queue
  const [withdrawals, setWithdrawals] = useState([
    { id: 'WD-8821', userEmail: 'demo@betking.com', userName: 'Demo User', amount: 2500, method: 'UPI', upiId: 'demo@upi', requestedAt: '2 mins ago', status: 'pending' },
    { id: 'WD-8820', userEmail: 'alex@betking.com', userName: 'Alex R.', amount: 5000, method: 'Paytm', upiId: '9876543210@paytm', requestedAt: '15 mins ago', status: 'pending' },
    { id: 'WD-8819', userEmail: 'rahul@betking.com', userName: 'Rahul M.', amount: 1200, method: 'GPay', upiId: 'rahul@okicici', requestedAt: '1 hour ago', status: 'approved' },
  ]);

  // Audit Logs
  const [auditLogs, setAuditLogs] = useState([
    { id: 1, action: 'System Initialization', detail: 'Admin master control suite loaded', time: 'Just now' },
    { id: 2, action: 'Live Polling Accelerated', detail: 'Live score refresh frequency set to 2.0s', time: '5 mins ago' },
  ]);

  // Chart Data
  const chartData = [
    { day: 'Mon', revenue: 42000, bets: 120, payout: 28000 },
    { day: 'Tue', revenue: 58000, bets: 165, payout: 39000 },
    { day: 'Wed', revenue: 74000, bets: 210, payout: 48000 },
    { day: 'Thu', revenue: 63000, bets: 190, payout: 41000 },
    { day: 'Fri', revenue: 89000, bets: 280, payout: 56000 },
    { day: 'Sat', revenue: 112000, bets: 340, payout: 72000 },
    { day: 'Sun', revenue: 135000, bets: 410, payout: 88000 },
  ];

  const logAction = (action, detail) => {
    setAuditLogs((prev) => [
      { id: Date.now(), action, detail, time: new Date().toLocaleTimeString('en-IN') },
      ...prev,
    ]);
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

  const handleSaveGlobalLimits = (e) => {
    e.preventDefault();
    showToast('Master Limits & Controls saved successfully!', 'success');
    logAction('Global Limits Saved', `Min Deposit: ₹${minDeposit}, Min W/D: ₹${minWithdrawal}, Max Stake: ₹${maxStake}`);
  };

  const handleSavePaymentGateways = (e) => {
    e.preventDefault();
    showToast(`Payment Gateways updated (Mode: ${gatewayMode.toUpperCase()})!`, 'success');
    logAction('Payment Config Updated', `Gateway: ${gatewayMode}, UPI: ${adminUpiId}`);
  };

  const handleDispatchNotification = (e) => {
    e.preventDefault();
    if (!dispatchToastText.trim()) return;
    showToast(dispatchToastText.trim(), dispatchToastType);
    logAction('Broadcast Toast Sent', `[${dispatchToastType.toUpperCase()}] ${dispatchToastText.trim()}`);
    setDispatchToastText('');
  };

  const handleBanAccount = (id, email) => {
    setFlaggedAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, status: 'banned' } : a)));
    showToast(`Account ${email} banned and locked!`, 'error');
    logAction('Account Banned', `Banned suspicious user ${email}`);
  };

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

  const handleAddBroadcast = (e) => {
    e.preventDefault();
    if (!newBroadcastText.trim()) return;
    const item = { id: Date.now(), text: newBroadcastText.trim(), active: true };
    setActiveBroadcasts((prev) => [item, ...prev]);
    setNewBroadcastText('');
    showToast('Broadcast banner launched live!', 'success');
    logAction('Broadcast Launched', item.text);
  };

  const filteredBets = useMemo(() => {
    if (betFilter === 'all') return placedBets;
    return placedBets.filter((b) => b.status === betFilter);
  }, [placedBets, betFilter]);

  // Metrics calculations
  const totalUserBalance = (user?.balance || 0) + (user?.bonusBalance || 0) + (user?.freebetBalance || 0);
  const totalPlacedStakes = placedBets.reduce((acc, b) => acc + (b.stake || 0), 0);
  const pendingBets = placedBets.filter((b) => b.status === 'pending');
  const wonBets = placedBets.filter((b) => b.status === 'won');
  const totalPayouts = wonBets.reduce((acc, b) => acc + (b.payout || 0), 0);
  const grossGamingRevenue = totalPlacedStakes - totalPayouts;

  // Unauthenticated Gate Screen
  if (!isAdminAuthenticated) {
    return (
      <div className="admin-portal admin-portal--gate">
        <motion.div
          className="admin-auth-card"
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <motion.div
            className="admin-logo-icon admin-logo-icon--large"
            animate={{ rotate: [0, 5, -5, 0] }}
            transition={{ duration: 4, repeat: Infinity }}
          >
            <FiShield />
          </motion.div>
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

            <motion.button
              type="submit"
              className="admin-btn admin-btn--primary admin-btn--full"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              <FiLock /> Unlock Admin Portal
            </motion.button>

            <motion.button
              type="button"
              className="admin-btn admin-btn--success admin-btn--full"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                setInputEmail('admin@betking.com');
                setInputPassword('admin123');
                setInputPin('8888');
                setTimeout(() => handleAdminLogin(), 50);
              }}
            >
              ⚡ 1-Click Auto Login as Super Admin
            </motion.button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="admin-portal">
      <div className="admin-inner">
        {/* Top Header Bar */}
        <motion.div
          className="admin-header"
          initial={{ opacity: 0, y: -15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="admin-brand">
            <motion.div
              className="admin-logo-icon"
              whileHover={{ rotate: 15, scale: 1.1 }}
            >
              <FiShield />
            </motion.div>
            <div>
              <h2>BetKing Admin Master Command Center</h2>
              <p>Total Platform Governance, Anti-Fraud & Game Rigging Suite</p>
            </div>
          </div>
          <div className="admin-header-actions">
            <span className={`admin-badge ${isMaintenanceMode ? 'admin-badge--warn' : 'admin-badge--live'}`}>
              <span className="live-dot" /> {isMaintenanceMode ? 'MAINTENANCE MODE' : 'SYSTEM ONLINE'}
            </span>
            {isLiveBettingFrozen && (
              <span className="admin-badge admin-badge--danger">⚡ BETTING FROZEN</span>
            )}
            <motion.button
              className="admin-btn admin-btn--danger admin-btn--sm"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleAdminLogout}
            >
              <FiLock /> Logout
            </motion.button>
          </div>
        </motion.div>

        {/* Emergency Risk Control Bar */}
        <motion.div
          className="admin-emergency-bar"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
        >
          <div className="emergency-title font-bold">
            <FiShield style={{ color: '#ef4444' }} /> Master Risk Controls:
          </div>
          <div className="emergency-actions">
            <motion.button
              className={`admin-btn admin-btn--sm ${isLiveBettingFrozen ? 'admin-btn--danger' : ''}`}
              whileHover={{ scale: 1.05 }}
              onClick={() => {
                const next = !isLiveBettingFrozen;
                setIsLiveBettingFrozen(next);
                showToast(next ? '⚡ All Live Betting FROZEN!' : '🟢 Live Betting Resumed', next ? 'error' : 'success');
                logAction('Emergency Freeze', `Live betting set to ${next ? 'FROZEN' : 'ACTIVE'}`);
              }}
            >
              {isLiveBettingFrozen ? 'Unfreeze Live Betting' : '🔒 Freeze Live Betting'}
            </motion.button>

            <motion.button
              className={`admin-btn admin-btn--sm ${isMaintenanceMode ? 'admin-btn--danger' : ''}`}
              whileHover={{ scale: 1.05 }}
              onClick={() => {
                const next = !isMaintenanceMode;
                setIsMaintenanceMode(next);
                showToast(next ? '⚠️ Maintenance Mode Activated!' : '🟢 Maintenance Mode Disabled', next ? 'info' : 'success');
                logAction('Maintenance Mode', `State set to ${next}`);
              }}
            >
              {isMaintenanceMode ? 'Exit Maintenance Mode' : '🛠️ Toggle Maintenance Mode'}
            </motion.button>
          </div>
        </motion.div>

        {/* Navigation Tabs */}
        <div className="admin-nav-tabs">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: <FiActivity /> },
            { id: 'analytics', label: 'GGR Analytics', icon: <FiTrendingUp /> },
            { id: 'master_limits', label: 'Limits & Config', icon: <FiSliders /> },
            { id: 'gateways', label: 'Payment Gateways & UPI', icon: <FiDollarSign /> },
            { id: 'antifraud', label: 'Anti-Fraud & Risk', icon: <FiShield /> },
            { id: 'users', label: 'Users & Wallets', icon: <FiUsers /> },
            { id: 'bets', label: `Bets (${pendingBets.length})`, icon: <FiTrendingUp /> },
            { id: 'sports', label: 'Live Overrides', icon: <FiSliders /> },
            { id: 'casino', label: 'Casino & Wheel Rigging', icon: <FiCpu /> },
            { id: 'payments', label: `Withdrawals (${withdrawals.filter((w) => w.status === 'pending').length})`, icon: <FiDollarSign /> },
            { id: 'push_alerts', label: 'Live Alerts', icon: <FiGift /> },
            { id: 'broadcast', label: 'Broadcasts', icon: <FiGift /> },
            { id: 'promos', label: 'Promos', icon: <FiGift /> },
            { id: 'logs', label: 'Audit Logs', icon: <FiCpu /> },
          ].map((tab) => (
            <motion.button
              key={tab.id}
              className={`admin-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
            >
              {tab.icon} {tab.label}
            </motion.button>
          ))}
        </div>

        {/* TAB CONTENTS WITH ANIMATE PRESENCE */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.25 }}
          >
            {/* TAB 1: DASHBOARD */}
            {activeTab === 'dashboard' && (
              <div className="admin-tab-content">
                <div className="admin-metrics-grid">
                  <motion.div className="admin-card metric-card" whileHover={{ scale: 1.03, y: -2 }}>
                    <div className="metric-icon" style={{ background: '#3b82f620', color: '#3b82f6' }}><FiUsers /></div>
                    <div className="metric-info">
                      <span className="metric-label">Total Registered Users</span>
                      <span className="metric-value">1,482</span>
                      <span className="metric-sub">+18 today</span>
                    </div>
                  </motion.div>

                  <motion.div className="admin-card metric-card" whileHover={{ scale: 1.03, y: -2 }}>
                    <div className="metric-icon" style={{ background: '#10b98120', color: '#10b981' }}><FiDollarSign /></div>
                    <div className="metric-info">
                      <span className="metric-label">Active User Balances</span>
                      <span className="metric-value">{formatInr(totalUserBalance)}</span>
                      <span className="metric-sub">Cash: {formatInr(user?.balance || 0)}</span>
                    </div>
                  </motion.div>

                  <motion.div className="admin-card metric-card" whileHover={{ scale: 1.03, y: -2 }}>
                    <div className="metric-icon" style={{ background: '#f59e0b20', color: '#f59e0b' }}><FiActivity /></div>
                    <div className="metric-info">
                      <span className="metric-label">Total Placed Bets</span>
                      <span className="metric-value">{placedBets.length}</span>
                      <span className="metric-sub">{pendingBets.length} Pending Resolution</span>
                    </div>
                  </motion.div>

                  <motion.div className="admin-card metric-card" whileHover={{ scale: 1.03, y: -2 }}>
                    <div className="metric-icon" style={{ background: '#8b5cf620', color: '#8b5cf6' }}><FiTrendingUp /></div>
                    <div className="metric-info">
                      <span className="metric-label">Gross Revenue (GGR)</span>
                      <span className="metric-value">{formatInr(grossGamingRevenue)}</span>
                      <span className="metric-sub">House Margin ~8.5%</span>
                    </div>
                  </motion.div>
                </div>

                {/* Provider Health */}
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
                      <span className="p-status p-status--ok"><FiCheckCircle /> Mode: {gatewayMode.toUpperCase()}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: GGR & ANALYTICS VISUALIZER */}
            {activeTab === 'analytics' && (
              <div className="admin-tab-content">
                <div className="admin-card">
                  <div className="card-header">
                    <h3>📈 7-Day Revenue & Payout Visualizer</h3>
                    <span className="font-bold text-green">GGR Total: {formatInr(grossGamingRevenue)}</span>
                  </div>

                  <div className="chart-bar-container">
                    {chartData.map((d, index) => (
                      <div key={d.day} className="chart-col">
                        <div className="col-bars">
                          <motion.div
                            className="bar-fill bar-fill--revenue"
                            initial={{ height: 0 }}
                            animate={{ height: `${(d.revenue / 140000) * 100}%` }}
                            transition={{ duration: 0.6, delay: index * 0.08 }}
                            title={`Revenue: ₹${d.revenue}`}
                          />
                          <motion.div
                            className="bar-fill bar-fill--payout"
                            initial={{ height: 0 }}
                            animate={{ height: `${(d.payout / 140000) * 100}%` }}
                            transition={{ duration: 0.6, delay: index * 0.08 + 0.1 }}
                            title={`Payouts: ₹${d.payout}`}
                          />
                        </div>
                        <span className="chart-label">{d.day}</span>
                      </div>
                    ))}
                  </div>

                  <div className="chart-legend">
                    <span className="legend-item"><span className="legend-dot legend-dot--revenue" /> Total Handle / Volume</span>
                    <span className="legend-item"><span className="legend-dot legend-dot--payout" /> User Winnings Paid</span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: MASTER LIMITS & CONFIG */}
            {activeTab === 'master_limits' && (
              <div className="admin-tab-content">
                <div className="admin-card">
                  <div className="card-header">
                    <h3>⚙️ Global Financial & Betting Limits Controller</h3>
                  </div>

                  <form onSubmit={handleSaveGlobalLimits} className="admin-form-grid">
                    <div className="form-group">
                      <label>Min Deposit Amount (₹)</label>
                      <input
                        type="number"
                        value={minDeposit}
                        onChange={(e) => setMinDeposit(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Min Withdrawal Amount (₹)</label>
                      <input
                        type="number"
                        value={minWithdrawal}
                        onChange={(e) => setMinWithdrawal(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Deposit Match Bonus (%)</label>
                      <input
                        type="number"
                        value={depositBonusPct}
                        onChange={(e) => setDepositBonusPct(e.target.value)}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label>Min Single/Multi Stake (₹)</label>
                      <input
                        type="number"
                        value={minStake}
                        onChange={(e) => setMinStake(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Max Single/Multi Stake (₹)</label>
                      <input
                        type="number"
                        value={maxStake}
                        onChange={(e) => setMaxStake(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Auto-Approve Payout Limit (₹)</label>
                      <input
                        type="number"
                        value={autoApproveWithdrawalLimit}
                        onChange={(e) => setAutoApproveWithdrawalLimit(e.target.value)}
                        required
                      />
                    </div>

                    <div className="form-group form-group--btn" style={{ gridColumn: 'span 4' }}>
                      <motion.button
                        type="submit"
                        className="admin-btn admin-btn--primary admin-btn--full"
                        whileHover={{ scale: 1.01 }}
                      >
                        <FiEdit /> Save Master Limits & Global Controls
                      </motion.button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* TAB 4: PAYMENT GATEWAYS & DIRECT UPI */}
            {activeTab === 'gateways' && (
              <div className="admin-tab-content">
                <div className="admin-card">
                  <div className="card-header">
                    <h3>💳 Payment Gateways & Custom UPI Configuration</h3>
                  </div>

                  <form onSubmit={handleSavePaymentGateways} className="admin-form-grid">
                    <div className="form-group">
                      <label>Gateway Execution Mode</label>
                      <select value={gatewayMode} onChange={(e) => setGatewayMode(e.target.value)}>
                        <option value="test">🧪 Test Sandbox Mode</option>
                        <option value="live">🔴 Live Production Gateway</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Direct Deposit UPI ID</label>
                      <input
                        type="text"
                        value={adminUpiId}
                        onChange={(e) => setAdminUpiId(e.target.value)}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label>Paytm Merchant / QR Phone</label>
                      <input
                        type="text"
                        value={adminPaytmNumber}
                        onChange={(e) => setAdminPaytmNumber(e.target.value)}
                        required
                      />
                    </div>

                    <div className="form-group form-group--btn">
                      <motion.button
                        type="submit"
                        className="admin-btn admin-btn--primary"
                        whileHover={{ scale: 1.02 }}
                      >
                        <FiEdit /> Save Gateway Settings
                      </motion.button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* TAB 5: ANTI-FRAUD & RISK */}
            {activeTab === 'antifraud' && (
              <div className="admin-tab-content">
                <div className="admin-card">
                  <div className="card-header">
                    <h3>🛡️ Anti-Fraud & Risk Flagged Accounts</h3>
                    <span className="admin-badge admin-badge--warn">{flaggedAccounts.filter((a) => a.status === 'flagged').length} Flagged</span>
                  </div>

                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>User Email</th>
                          <th>IP Address</th>
                          <th>Risk Tier</th>
                          <th>Flag Reason</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {flaggedAccounts.map((acc) => (
                          <tr key={acc.id}>
                            <td>{acc.email}</td>
                            <td className="font-mono">{acc.ip}</td>
                            <td><span className={`status-tag ${acc.risk === 'HIGH' ? 'status-tag--lost' : 'status-tag--pending'}`}>{acc.risk}</span></td>
                            <td>{acc.reason}</td>
                            <td><span className="status-tag status-tag--pending">{acc.status.toUpperCase()}</span></td>
                            <td>
                              {acc.status !== 'banned' ? (
                                <button className="admin-btn admin-btn--xs admin-btn--danger" onClick={() => handleBanAccount(acc.id, acc.email)}>
                                  Ban Account
                                </button>
                              ) : (
                                <span className="text-muted">Banned</span>
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

            {/* TAB 6: USERS & WALLETS */}
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
                      <motion.button className="admin-btn admin-btn--sm" whileHover={{ scale: 1.06 }} onClick={() => handleQuickAddBalance(500)}>+ ₹500</motion.button>
                      <motion.button className="admin-btn admin-btn--sm" whileHover={{ scale: 1.06 }} onClick={() => handleQuickAddBalance(1000)}>+ ₹1,000</motion.button>
                      <motion.button className="admin-btn admin-btn--sm" whileHover={{ scale: 1.06 }} onClick={() => handleQuickAddBalance(5000)}>+ ₹5,000</motion.button>
                      <motion.button className="admin-btn admin-btn--sm admin-btn--primary" whileHover={{ scale: 1.06 }} onClick={() => handleQuickAddBalance(10000)}>+ ₹10,000</motion.button>
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

            {/* TAB 7: BETS & SETTLEMENTS */}
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

            {/* TAB 8: LIVE OVERRIDES */}
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
                        <motion.div key={m.id} className="live-match-admin-card" whileHover={{ scale: 1.02 }}>
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
                        </motion.div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 9: CASINO RIGGING & WHEEL OF FORTUNE */}
            {activeTab === 'casino' && (
              <div className="admin-tab-content">
                <div className="admin-card">
                  <div className="card-header">
                    <h3>🎰 Casino RTP & Forced Outcome Rigging Controls</h3>
                    <span className="font-bold text-green">Global RTP: {globalCasinoRtp}%</span>
                  </div>

                  <div className="slider-row" style={{ marginBottom: 'var(--space-6)' }}>
                    <input
                      type="range"
                      min="85.0"
                      max="99.5"
                      step="0.5"
                      value={globalCasinoRtp}
                      onChange={(e) => {
                        setGlobalCasinoRtp(parseFloat(e.target.value));
                        showToast(`Casino RTP updated to ${e.target.value}%`, 'success');
                        logAction('RTP Override', `Set global casino RTP to ${e.target.value}%`);
                      }}
                    />
                    <button className="admin-btn admin-btn--sm" onClick={() => setGlobalCasinoRtp(96.5)}>Reset to 96.5%</button>
                  </div>

                  {/* Outcome Rigging Selector */}
                  <div className="admin-form-grid" style={{ marginBottom: 'var(--space-6)' }}>
                    <div className="form-group">
                      <label>Force Next Round Outcome Mode</label>
                      <select
                        value={forcedCasinoOutcome}
                        onChange={(e) => {
                          setForcedCasinoOutcome(e.target.value);
                          showToast(`Casino outcome mode set to ${e.target.value.toUpperCase()}`, 'warning');
                          logAction('Game Rigging', `Set next round outcome mode to ${e.target.value}`);
                        }}
                      >
                        <option value="random">🎲 Normal Random (RNG)</option>
                        <option value="force_win">🎉 Force User Big Win (10x+)</option>
                        <option value="force_loss">🔒 Force House Win (User Loss)</option>
                        <option value="jackpot">💎 Force Mega Jackpot (100x+)</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Aviator Crash Multiplier Override</label>
                      <input
                        type="text"
                        placeholder="e.g. 2.50 or 50.00"
                        value={forcedAviatorCrashPoint}
                        onChange={(e) => setForcedAviatorCrashPoint(e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <label>Wheel of Fortune Forced Outcome</label>
                      <select
                        value={wheelOutcome}
                        onChange={(e) => {
                          setWheelOutcome(e.target.value);
                          showToast(`Wheel of fortune forced result: ${e.target.value.toUpperCase()}`, 'info');
                          logAction('Wheel Rigging', `Wheel result set to ${e.target.value}`);
                        }}
                      >
                        <option value="random">🎲 Random Wheel Spin</option>
                        <option value="cash_500">💰 Force ₹500 Cash Prize</option>
                        <option value="bonus_1000">🎁 Force ₹1,000 Bonus</option>
                        <option value="freebet_200">⚡ Force ₹200 Freebet</option>
                        <option value="no_win">❌ Force Next Spin No Win</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 10: PAYMENTS & WITHDRAWALS */}
            {activeTab === 'payments' && (
              <div className="admin-tab-content">
                <div className="admin-card">
                  <div className="card-header">
                    <h3>Pending Withdrawal Requests Queue</h3>
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
                                    Approve Payout
                                  </button>
                                  <button className="admin-btn admin-btn--xs admin-btn--danger" onClick={() => handleRejectWithdrawal(w.id)}>
                                    Reject
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

            {/* TAB 11: LIVE TOAST NOTIFICATION DISPATCHER */}
            {activeTab === 'push_alerts' && (
              <div className="admin-tab-content">
                <div className="admin-card">
                  <div className="card-header">
                    <h3>🔔 Live Site Notification Dispatcher</h3>
                  </div>

                  <form onSubmit={handleDispatchNotification} className="admin-form-grid">
                    <div className="form-group" style={{ gridColumn: 'span 2' }}>
                      <label>Notification Message</label>
                      <input
                        type="text"
                        placeholder="e.g. 🎁 Claim ₹500 Free Bet Now!"
                        value={dispatchToastText}
                        onChange={(e) => setDispatchToastText(e.target.value)}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label>Notification Style</label>
                      <select value={dispatchToastType} onChange={(e) => setDispatchToastType(e.target.value)}>
                        <option value="success">Success (Green)</option>
                        <option value="info">Info (Blue)</option>
                        <option value="error">Alert (Red)</option>
                        <option value="warning">Warning (Amber)</option>
                      </select>
                    </div>

                    <div className="form-group form-group--btn">
                      <motion.button
                        type="submit"
                        className="admin-btn admin-btn--primary"
                        whileHover={{ scale: 1.04 }}
                      >
                        <FiPlus /> Dispatch Alert
                      </motion.button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* TAB 12: BROADCAST ANNOUNCEMENTS */}
            {activeTab === 'broadcast' && (
              <div className="admin-tab-content">
                <div className="admin-card">
                  <div className="card-header">
                    <h3>📢 Live Announcement Banner Launcher</h3>
                  </div>
                  <form onSubmit={handleAddBroadcast} className="admin-form-grid">
                    <div className="form-group" style={{ gridColumn: 'span 3' }}>
                      <label>Broadcast Message Text</label>
                      <input
                        type="text"
                        placeholder="e.g. ⚡ Extra 20% Cashback on IPL Matches today!"
                        value={newBroadcastText}
                        onChange={(e) => setNewBroadcastText(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group form-group--btn">
                      <button type="submit" className="admin-btn admin-btn--primary">
                        <FiPlus /> Launch Banner
                      </button>
                    </div>
                  </form>
                </div>

                <div className="admin-card">
                  <div className="card-header">
                    <h3>Active Live Banners</h3>
                  </div>
                  <div className="audit-log-list">
                    {activeBroadcasts.map((b) => (
                      <div key={b.id} className="audit-item">
                        <span className="status-tag status-tag--won">LIVE</span>
                        <span className="audit-detail">{b.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 13: PROMOS */}
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

            {/* TAB 14: AUDIT LOGS */}
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
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
