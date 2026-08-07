import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../../context/AuthContext';
import { useBetSlip } from '../../context/BetSlipContext';
import { useLiveMatches } from '../../context/LiveSportsContext';
import { formatInr } from '../../utils/walletBalance';
import { loadAllSystemTransactions, updateTransactionStatus } from '../../utils/transactions';
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
import AnimatedMotionGiftIcon from '../../components/AnimatedMotionGiftIcon/AnimatedMotionGiftIcon';
import './Admin.css';

export default function Admin() {
  const { user, updateUser, showToast, addFunds, adminApproveWithdrawal, adminRejectWithdrawal } = useAuth();
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

  // Dynamic Odds Engine State
  const [marginOverround, setMarginOverround] = useState(5.0);
  const [isAutoRebalanceActive, setIsAutoRebalanceActive] = useState(true);
  const [sharpProtectionSensitivity, setSharpProtectionSensitivity] = useState('0.0001');

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

  // Profit & Loss (P&L) and Leaderboards Timeframe state
  const [pnlTimeframe, setPnlTimeframe] = useState('week'); // 'day', 'week', 'month', 'year'
  const [leaderboardTimeframe, setLeaderboardTimeframe] = useState('week'); // 'day', 'week', 'month', 'year'

  // Financial Ledger Transactions State
  const [systemTxList, setSystemTxList] = useState(loadAllSystemTransactions);
  const [txFilterType, setTxFilterType] = useState('ALL');
  const [txFilterStatus, setTxFilterStatus] = useState('ALL');
  const [txSearchQuery, setTxSearchQuery] = useState('');
  const [selectedUserEmail, setSelectedUserEmail] = useState('demo@betking.com');
  const [selectedUserTxFilter, setSelectedUserTxFilter] = useState('ALL');

  // Timeframe P&L Data Map
  const pnlDataByTimeframe = {
    day: {
      period: 'Today (24 Hours)',
      turnover: 184500,
      payouts: 112000,
      ggr: 72500,
      margin: '39.3%',
      tax: 14500,
      netProfit: 58000,
      chart: [
        { label: '00:00-06:00', revenue: 24000, payout: 12000 },
        { label: '06:00-12:00', revenue: 42000, payout: 26000 },
        { label: '12:00-18:00', revenue: 68000, payout: 41000 },
        { label: '18:00-24:00', revenue: 50500, payout: 33000 },
      ],
    },
    week: {
      period: 'This Week (7 Days)',
      turnover: 948000,
      payouts: 612000,
      ggr: 336000,
      margin: '35.4%',
      tax: 67200,
      netProfit: 268800,
      chart: [
        { label: 'Mon', revenue: 110000, payout: 68000 },
        { label: 'Tue', revenue: 125000, payout: 79000 },
        { label: 'Wed', revenue: 142000, payout: 88000 },
        { label: 'Thu', revenue: 138000, payout: 86000 },
        { label: 'Fri', revenue: 165000, payout: 104000 },
        { label: 'Sat', revenue: 182000, payout: 115000 },
        { label: 'Sun', revenue: 86000, payout: 72000 },
      ],
    },
    month: {
      period: 'This Month (30 Days)',
      turnover: 4250000,
      payouts: 2720000,
      ggr: 1530000,
      margin: '36.0%',
      tax: 306000,
      netProfit: 1224000,
      chart: [
        { label: 'Week 1', revenue: 980000, payout: 620000 },
        { label: 'Week 2', revenue: 1120000, payout: 710000 },
        { label: 'Week 3', revenue: 1050000, payout: 680000 },
        { label: 'Week 4', revenue: 1100000, payout: 710000 },
      ],
    },
    year: {
      period: 'This Year (2026 YTD)',
      turnover: 48500000,
      payouts: 30800000,
      ggr: 17700000,
      margin: '36.5%',
      tax: 3540000,
      netProfit: 14160000,
      chart: [
        { label: 'Q1', revenue: 11200000, payout: 7100000 },
        { label: 'Q2', revenue: 12400000, payout: 7800000 },
        { label: 'Q3', revenue: 13100000, payout: 8300000 },
        { label: 'Q4 (Est)', revenue: 11800000, payout: 7600000 },
      ],
    },
  };

  // Top Profiters Data by Timeframe
  const topProfitersData = {
    day: [
      { id: 1, name: 'Vikram S.', email: 'vikram.s@gmail.com', bets: 12, stake: 25000, payout: 88000, netProfit: 63000, rank: 'VIP Platinum' },
      { id: 2, name: 'Ananya P.', email: 'ananya.p@yahoo.com', bets: 8, stake: 15000, payout: 52000, netProfit: 37000, rank: 'VIP Gold' },
      { id: 3, name: 'Rohan Verma', email: 'rohan.v@outlook.com', bets: 15, stake: 30000, payout: 64000, netProfit: 34000, rank: 'VIP Silver' },
      { id: 4, name: 'Karan Joshi', email: 'karan.j@gmail.com', bets: 6, stake: 10000, payout: 38000, netProfit: 28000, rank: 'VIP Bronze' },
      { id: 5, name: 'Priya Sharma', email: 'priya.s@gmail.com', bets: 9, stake: 18000, payout: 42000, netProfit: 24000, rank: 'VIP Gold' },
    ],
    week: [
      { id: 1, name: 'Rohan Verma', email: 'rohan.v@outlook.com', bets: 48, stake: 120000, payout: 310000, netProfit: 190000, rank: 'VIP Platinum' },
      { id: 2, name: 'Vikram S.', email: 'vikram.s@gmail.com', bets: 35, stake: 95000, payout: 240000, netProfit: 145000, rank: 'VIP Platinum' },
      { id: 3, name: 'Siddharth R.', email: 'sid.r@gmail.com', bets: 29, stake: 70000, payout: 185000, netProfit: 115000, rank: 'VIP Gold' },
      { id: 4, name: 'Ananya P.', email: 'ananya.p@yahoo.com', bets: 22, stake: 60000, payout: 158000, netProfit: 98000, rank: 'VIP Gold' },
      { id: 5, name: 'Deepak Patel', email: 'deepak.p@gmail.com', bets: 41, stake: 110000, payout: 192000, netProfit: 82000, rank: 'VIP Silver' },
    ],
    month: [
      { id: 1, name: 'Rohan Verma', email: 'rohan.v@outlook.com', bets: 185, stake: 450000, payout: 1180000, netProfit: 730000, rank: 'VIP Diamond' },
      { id: 2, name: 'Amitabh K.', email: 'amitabh.k@gmail.com', bets: 142, stake: 380000, payout: 920000, netProfit: 540000, rank: 'VIP Platinum' },
      { id: 3, name: 'Vikram S.', email: 'vikram.s@gmail.com', bets: 120, stake: 310000, payout: 780000, netProfit: 470000, rank: 'VIP Platinum' },
      { id: 4, name: 'Siddharth R.', email: 'sid.r@gmail.com', bets: 98, stake: 260000, payout: 640000, netProfit: 380000, rank: 'VIP Gold' },
      { id: 5, name: 'Neha Gupta', email: 'neha.g@gmail.com', bets: 115, stake: 290000, payout: 610000, netProfit: 320000, rank: 'VIP Gold' },
    ],
    year: [
      { id: 1, name: 'Rohan Verma', email: 'rohan.v@outlook.com', bets: 1420, stake: 3800000, payout: 9400000, netProfit: 5600000, rank: 'VIP Diamond' },
      { id: 2, name: 'Amitabh K.', email: 'amitabh.k@gmail.com', bets: 1100, stake: 3100000, payout: 7300000, netProfit: 4200000, rank: 'VIP Diamond' },
      { id: 3, name: 'Vikram S.', email: 'vikram.s@gmail.com', bets: 950, stake: 2600000, payout: 5800000, netProfit: 3200000, rank: 'VIP Platinum' },
      { id: 4, name: 'Rajesh Nair', email: 'rajesh.n@gmail.com', bets: 820, stake: 2200000, payout: 4900000, netProfit: 2700000, rank: 'VIP Platinum' },
      { id: 5, name: 'Siddharth R.', email: 'sid.r@gmail.com', bets: 760, stake: 1950000, payout: 4200000, netProfit: 2250000, rank: 'VIP Gold' },
    ],
  };

  // Top Losers Data by Timeframe (GGR Contributors)
  const topLosersData = {
    day: [
      { id: 1, name: 'Manish Kumar', email: 'manish.k@gmail.com', bets: 28, stake: 85000, payout: 18000, netLoss: 67000, rank: 'VIP Silver' },
      { id: 2, name: 'Arjun Reddy', email: 'arjun.r@yahoo.com', bets: 19, stake: 54000, payout: 12000, netLoss: 42000, rank: 'VIP Bronze' },
      { id: 3, name: 'Suresh Raina', email: 'suresh.r@outlook.com', bets: 22, stake: 48000, payout: 11000, netLoss: 37000, rank: 'VIP Silver' },
      { id: 4, name: 'Kavita Roy', email: 'kavita.r@gmail.com', bets: 14, stake: 39000, payout: 8000, netLoss: 31000, rank: 'VIP Bronze' },
      { id: 5, name: 'Aakash Singh', email: 'aakash.s@gmail.com', bets: 16, stake: 35000, payout: 9000, netLoss: 26000, rank: 'VIP Bronze' },
    ],
    week: [
      { id: 1, name: 'Manish Kumar', email: 'manish.k@gmail.com', bets: 112, stake: 380000, payout: 95000, netLoss: 285000, rank: 'VIP Gold' },
      { id: 2, name: 'Arjun Reddy', email: 'arjun.r@yahoo.com', bets: 85, stake: 260000, payout: 72000, netLoss: 188000, rank: 'VIP Silver' },
      { id: 3, name: 'Tarun Shah', email: 'tarun.s@gmail.com', bets: 72, stake: 210000, payout: 62000, netLoss: 148000, rank: 'VIP Silver' },
      { id: 4, name: 'Suresh Raina', email: 'suresh.r@outlook.com', bets: 68, stake: 190000, payout: 55000, netLoss: 135000, rank: 'VIP Silver' },
      { id: 5, name: 'Gaurav Gill', email: 'gaurav.g@gmail.com', bets: 54, stake: 165000, payout: 48000, netLoss: 117000, rank: 'VIP Bronze' },
    ],
    month: [
      { id: 1, name: 'Manish Kumar', email: 'manish.k@gmail.com', bets: 420, stake: 1450000, payout: 380000, netLoss: 1070000, rank: 'VIP Platinum' },
      { id: 2, name: 'Arjun Reddy', email: 'arjun.r@yahoo.com', bets: 310, stake: 980000, payout: 260000, netLoss: 720000, rank: 'VIP Gold' },
      { id: 3, name: 'Tarun Shah', email: 'tarun.s@gmail.com', bets: 260, stake: 820000, payout: 230000, netLoss: 590000, rank: 'VIP Gold' },
      { id: 4, name: 'Vivek Oberoi', email: 'vivek.o@gmail.com', bets: 210, stake: 690000, payout: 180000, netLoss: 510000, rank: 'VIP Silver' },
      { id: 5, name: 'Suresh Raina', email: 'suresh.r@outlook.com', bets: 240, stake: 720000, payout: 220000, netLoss: 500000, rank: 'VIP Silver' },
    ],
    year: [
      { id: 1, name: 'Manish Kumar', email: 'manish.k@gmail.com', bets: 3800, stake: 12800000, payout: 3400000, netLoss: 9400000, rank: 'VIP Diamond' },
      { id: 2, name: 'Arjun Reddy', email: 'arjun.r@yahoo.com', bets: 2900, stake: 9100000, payout: 2500000, netLoss: 6600000, rank: 'VIP Platinum' },
      { id: 3, name: 'Tarun Shah', email: 'tarun.s@gmail.com', bets: 2400, stake: 7800000, payout: 2200000, netLoss: 5600000, rank: 'VIP Platinum' },
      { id: 4, name: 'Suresh Raina', email: 'suresh.r@outlook.com', bets: 2100, stake: 6900000, payout: 2000000, netLoss: 4900000, rank: 'VIP Gold' },
      { id: 5, name: 'Gaurav Gill', email: 'gaurav.g@gmail.com', bets: 1850, stake: 5800000, payout: 1700000, netLoss: 4100000, rank: 'VIP Gold' },
    ],
  };

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

  const handleApproveWithdrawal = (id, targetEmail, amount) => {
    setWithdrawals((prev) => prev.map((w) => (w.id === id ? { ...w, status: 'approved' } : w)));
    if (adminApproveWithdrawal) {
      adminApproveWithdrawal(id, targetEmail, amount);
    } else {
      updateTransactionStatus(id, 'COMPLETED', `UTR${Date.now()}`);
      showToast(`Withdrawal ${id} APPROVED and paid out!`, 'success');
    }
    setSystemTxList(loadAllSystemTransactions());
    logAction('Withdrawal Approved', `Approved request ${id} for ₹${amount || 0}`);
  };

  const handleRejectWithdrawal = (id, targetEmail, amount) => {
    setWithdrawals((prev) => prev.map((w) => (w.id === id ? { ...w, status: 'rejected' } : w)));
    if (adminRejectWithdrawal) {
      adminRejectWithdrawal(id, targetEmail, amount);
    } else {
      updateTransactionStatus(id, 'REJECTED');
      showToast(`Withdrawal ${id} REJECTED and refunded!`, 'info');
    }
    setSystemTxList(loadAllSystemTransactions());
    logAction('Withdrawal Rejected', `Rejected request ${id} for ₹${amount || 0}`);
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

  const filteredTxList = useMemo(() => {
    return systemTxList.filter((tx) => {
      if (txFilterType !== 'ALL' && tx.type !== txFilterType) return false;
      if (txFilterStatus !== 'ALL' && tx.status !== txFilterStatus) return false;
      if (txSearchQuery.trim()) {
        const q = txSearchQuery.toLowerCase();
        const matchId = (tx.id || '').toLowerCase().includes(q);
        const matchUser = (tx.userEmail || '').toLowerCase().includes(q) || (tx.userName || '').toLowerCase().includes(q);
        const matchUtr = (tx.utr || '').toLowerCase().includes(q);
        const matchMethod = (tx.method || '').toLowerCase().includes(q);
        return matchId || matchUser || matchUtr || matchMethod;
      }
      return true;
    });
  }, [systemTxList, txFilterType, txFilterStatus, txSearchQuery]);

  const selectedUserTransactions = useMemo(() => {
    const allForUser = systemTxList.filter((tx) => tx.userEmail === selectedUserEmail);
    if (selectedUserTxFilter === 'ALL') return allForUser;
    return allForUser.filter((tx) => tx.type === selectedUserTxFilter);
  }, [systemTxList, selectedUserEmail, selectedUserTxFilter]);

  const selectedUserStats = useMemo(() => {
    const allForUser = systemTxList.filter((tx) => tx.userEmail === selectedUserEmail);
    const deposits = allForUser.filter((t) => t.type === 'DEPOSIT').reduce((s, t) => s + (t.amount || 0), 0);
    const withdrawals = allForUser.filter((t) => t.type === 'WITHDRAWAL').reduce((s, t) => s + (t.amount || 0), 0);
    const totalWon = allForUser.filter((t) => t.type === 'BET_WIN').reduce((s, t) => s + (t.amount || 0), 0);
    const totalStaked = allForUser.filter((t) => t.type === 'BET_STAKE').reduce((s, t) => s + (t.amount || 0), 0);
    return { deposits, withdrawals, totalWon, totalStaked, netPnl: totalWon - totalStaked };
  }, [systemTxList, selectedUserEmail]);

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
            { id: 'odds_engine', label: '⚡ Dynamic Odds & Risk Engine', icon: <FiSliders /> },
            { id: 'pnl', label: 'Profit & Loss (P&L)', icon: <FiDollarSign /> },
            { id: 'leaderboards', label: 'Top Profiters & Losers', icon: <FiTrendingUp /> },
            { id: 'financial_ledger', label: `Financial Ledger (${systemTxList.length})`, icon: <FiDollarSign /> },
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

            {/* TAB: PROFIT & LOSS (P&L) MASTER CENTER */}
            {activeTab === 'pnl' && (
              <div className="admin-tab-content">
                <div className="admin-card">
                  <div className="card-header flex-between">
                    <div>
                      <h3>📊 Platform Profit & Loss (P&L) Statement</h3>
                      <p className="card-sub text-muted">Real-time GGR, NGR, payouts, and margin breakdown for {pnlDataByTimeframe[pnlTimeframe].period}</p>
                    </div>
                    <div className="admin-timeframe-selector">
                      {['day', 'week', 'month', 'year'].map((tf) => (
                        <button
                          key={tf}
                          type="button"
                          className={`timeframe-btn ${pnlTimeframe === tf ? 'active' : ''}`}
                          onClick={() => setPnlTimeframe(tf)}
                        >
                          {tf === 'day' ? 'Day (24H)' : tf === 'week' ? 'Week (7D)' : tf === 'month' ? 'Month (30D)' : 'Year (365D)'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="admin-metrics-grid pnl-metrics-grid">
                    <div className="admin-card metric-card">
                      <div className="metric-icon" style={{ background: '#10b98120', color: '#10b981' }}><FiDollarSign /></div>
                      <div className="metric-info">
                        <span className="metric-label">Gross TurnOver (Volume)</span>
                        <span className="metric-value">{formatInr(pnlDataByTimeframe[pnlTimeframe].turnover)}</span>
                        <span className="metric-sub">Total Player Stakes</span>
                      </div>
                    </div>

                    <div className="admin-card metric-card">
                      <div className="metric-icon" style={{ background: '#ef444420', color: '#ef4444' }}><FiActivity /></div>
                      <div className="metric-info">
                        <span className="metric-label">User Payouts (Winnings)</span>
                        <span className="metric-value">{formatInr(pnlDataByTimeframe[pnlTimeframe].payouts)}</span>
                        <span className="metric-sub">Disbursed Winnings</span>
                      </div>
                    </div>

                    <div className="admin-card metric-card">
                      <div className="metric-icon" style={{ background: '#8b5cf620', color: '#8b5cf6' }}><FiTrendingUp /></div>
                      <div className="metric-info">
                        <span className="metric-label">Gross Gaming Revenue (GGR)</span>
                        <span className="metric-value" style={{ color: '#8b5cf6' }}>{formatInr(pnlDataByTimeframe[pnlTimeframe].ggr)}</span>
                        <span className="metric-sub">Margin: {pnlDataByTimeframe[pnlTimeframe].margin}</span>
                      </div>
                    </div>

                    <div className="admin-card metric-card">
                      <div className="metric-icon" style={{ background: '#22c55e20', color: '#22c55e' }}><FiCheckCircle /></div>
                      <div className="metric-info">
                        <span className="metric-label">Net Operating Profit</span>
                        <span className="metric-value text-green">{formatInr(pnlDataByTimeframe[pnlTimeframe].netProfit)}</span>
                        <span className="metric-sub">Tax: {formatInr(pnlDataByTimeframe[pnlTimeframe].tax)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="pnl-chart-box">
                    <h4 className="pnl-chart-title">Revenue vs. Payout Performance ({pnlDataByTimeframe[pnlTimeframe].period})</h4>
                    <div className="chart-bar-container">
                      {pnlDataByTimeframe[pnlTimeframe].chart.map((d, index) => (
                        <div key={d.label} className="chart-col">
                          <div className="col-bars">
                            <motion.div
                              className="bar-fill bar-fill--revenue"
                              initial={{ height: 0 }}
                              animate={{ height: `${(d.revenue / (pnlDataByTimeframe[pnlTimeframe].chart[0].revenue * 2 || 100000)) * 100}%` }}
                              transition={{ duration: 0.5, delay: index * 0.08 }}
                              title={`Turnover: ₹${d.revenue}`}
                            />
                            <motion.div
                              className="bar-fill bar-fill--payout"
                              initial={{ height: 0 }}
                              animate={{ height: `${(d.payout / (pnlDataByTimeframe[pnlTimeframe].chart[0].revenue * 2 || 100000)) * 100}%` }}
                              transition={{ duration: 0.5, delay: index * 0.08 + 0.1 }}
                              title={`Payouts: ₹${d.payout}`}
                            />
                          </div>
                          <span className="chart-label">{d.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: TOP PROFITERS & TOP LOSERS LEADERBOARD */}
            {activeTab === 'leaderboards' && (
              <div className="admin-tab-content">
                <div className="admin-card mb-6">
                  <div className="card-header flex-between">
                    <div>
                      <h3>🏆 Top Profiters & Losers Rankings</h3>
                      <p className="card-sub text-muted">Filter player profitability & platform GGR contributors by timeframe</p>
                    </div>
                    <div className="admin-timeframe-selector">
                      {['day', 'week', 'month', 'year'].map((tf) => (
                        <button
                          key={tf}
                          type="button"
                          className={`timeframe-btn ${leaderboardTimeframe === tf ? 'active' : ''}`}
                          onClick={() => setLeaderboardTimeframe(tf)}
                        >
                          {tf === 'day' ? 'Day (24H)' : tf === 'week' ? 'Week (7D)' : tf === 'month' ? 'Month (30D)' : 'Year (365D)'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="leaderboards-grid">
                  {/* TOP PROFITERS TABLE */}
                  <div className="admin-card">
                    <div className="card-header">
                      <h4 className="text-green font-bold flex-center gap-2">
                        🏆 Top Profiters ({leaderboardTimeframe.toUpperCase()})
                      </h4>
                      <span className="text-xs text-muted">Players with highest net winnings</span>
                    </div>

                    <div className="admin-table-wrap">
                      <table className="admin-table leaderboard-table">
                        <thead>
                          <tr>
                            <th className="th-center">Rank</th>
                            <th className="th-left">Player</th>
                            <th className="th-center">Bets</th>
                            <th className="th-right">Stakes</th>
                            <th className="th-right">Payouts</th>
                            <th className="th-right">Net Profit</th>
                            <th className="th-center">VIP Tier</th>
                          </tr>
                        </thead>
                        <tbody>
                          {topProfitersData[leaderboardTimeframe].map((p, idx) => (
                            <tr key={p.id}>
                              <td className="td-center">
                                <span className={`rank-badge rank-badge--${idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : 'normal'}`}>
                                  #{idx + 1}
                                </span>
                              </td>
                              <td className="td-left">
                                <div className="user-cell-name">{p.name}</div>
                                <div className="user-cell-email">{p.email}</div>
                              </td>
                              <td className="td-center">{p.bets}</td>
                              <td className="td-right">{formatInr(p.stake)}</td>
                              <td className="td-right">{formatInr(p.payout)}</td>
                              <td className="td-right">
                                <span className="net-profit-pill">
                                  +{formatInr(p.netProfit)}
                                </span>
                              </td>
                              <td className="td-center"><span className="vip-badge">{p.rank}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* TOP LOSERS TABLE */}
                  <div className="admin-card">
                    <div className="card-header">
                      <h4 className="text-danger font-bold flex-center gap-2">
                        🔻 Top Losers ({leaderboardTimeframe.toUpperCase()})
                      </h4>
                      <span className="text-xs text-muted">Top platform GGR contributors</span>
                    </div>

                    <div className="admin-table-wrap">
                      <table className="admin-table leaderboard-table">
                        <thead>
                          <tr>
                            <th className="th-center">Rank</th>
                            <th className="th-left">Player</th>
                            <th className="th-center">Bets</th>
                            <th className="th-right">Stakes</th>
                            <th className="th-right">Payouts</th>
                            <th className="th-right">Net Loss</th>
                            <th className="th-center">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {topLosersData[leaderboardTimeframe].map((p, idx) => (
                            <tr key={p.id}>
                              <td className="td-center">
                                <span className="rank-badge rank-badge--normal">
                                  #{idx + 1}
                                </span>
                              </td>
                              <td className="td-left">
                                <div className="user-cell-name">{p.name}</div>
                                <div className="user-cell-email">{p.email}</div>
                              </td>
                              <td className="td-center">{p.bets}</td>
                              <td className="td-right">{formatInr(p.stake)}</td>
                              <td className="td-right">{formatInr(p.payout)}</td>
                              <td className="td-right">
                                <span className="net-loss-pill">
                                  -{formatInr(p.netLoss)}
                                </span>
                              </td>
                              <td className="td-center">
                                <button
                                  type="button"
                                  className="admin-btn admin-btn--sm admin-btn--success btn-reward-vip"
                                  onClick={() => {
                                    showToast(`VIP Retain Voucher sent to ${p.name}!`, 'success');
                                    logAction('VIP Voucher Sent', `Sent retention freebet to ${p.email}`);
                                  }}
                                >
                                  <AnimatedMotionGiftIcon size={14} color="#ffffff" /> Reward VIP
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: DYNAMIC ODDS & RISK ENGINE */}
            {activeTab === 'odds_engine' && (
              <div className="admin-tab-content">
                <div className="admin-card mb-6">
                  <div className="card-header flex-between">
                    <div>
                      <h3>⚡ Dynamic Odds Engine & Liability Rebalancing</h3>
                      <p className="card-sub text-muted">Configure live bookmaker margin overround, auto liability rebalancing, and sharp bettor protection algorithms</p>
                    </div>
                    <span className="admin-badge admin-badge--live">
                      <span className="live-dot" /> ENGINE ACTIVE
                    </span>
                  </div>

                  <div className="admin-metrics-grid mt-4">
                    <div className="admin-card metric-card">
                      <div className="metric-icon" style={{ background: '#7c3aed20', color: '#7c3aed' }}><FiSliders /></div>
                      <div className="metric-info">
                        <span className="metric-label">Bookmaker Margin Overround</span>
                        <span className="metric-value text-purple">{marginOverround}%</span>
                        <span className="metric-sub">Expected House Edge: {marginOverround}%</span>
                      </div>
                    </div>

                    <div className="admin-card metric-card">
                      <div className="metric-icon" style={{ background: '#22c55e20', color: '#22c55e' }}><FiActivity /></div>
                      <div className="metric-info">
                        <span className="metric-label">Liability Auto-Rebalancing</span>
                        <span className="metric-value text-green">{isAutoRebalanceActive ? 'ENABLED' : 'MANUAL'}</span>
                        <span className="metric-sub">Sub-100ms calculation cycle</span>
                      </div>
                    </div>

                    <div className="admin-card metric-card">
                      <div className="metric-icon" style={{ background: '#0284c720', color: '#0284c7' }}><FiShield /></div>
                      <div className="metric-info">
                        <span className="metric-label">Sharp Money Sensitivity</span>
                        <span className="metric-value text-blue">{sharpProtectionSensitivity}</span>
                        <span className="metric-sub">Dynamic stake limit active</span>
                      </div>
                    </div>
                  </div>

                  <div className="admin-controls-grid mt-6">
                    <div className="control-group">
                      <label className="font-bold text-xs text-muted mb-2 block">Set Bookmaker Margin Overround (%):</label>
                      <input
                        type="range"
                        min="2"
                        max="15"
                        step="0.5"
                        value={marginOverround}
                        onChange={(e) => {
                          setMarginOverround(parseFloat(e.target.value));
                          showToast(`Margin Overround set to ${e.target.value}%`, 'info');
                        }}
                        className="w-full accent-purple-600"
                      />
                      <div className="flex-between text-xs text-muted mt-1">
                        <span>Pinnacle Standard (2%)</span>
                        <span>Standard (5%)</span>
                        <span>High Volatility (15%)</span>
                      </div>
                    </div>

                    <div className="control-group mt-4 flex-between">
                      <div>
                        <div className="font-bold text-sm">Auto-Rebalance Exposure on Heavy Bets</div>
                        <div className="text-xs text-muted">Dynamically adjust team odds down when liability spikes</div>
                      </div>
                      <button
                        type="button"
                        className={`admin-btn ${isAutoRebalanceActive ? 'admin-btn--success' : 'admin-btn--secondary'}`}
                        onClick={() => {
                          setIsAutoRebalanceActive(!isAutoRebalanceActive);
                          showToast(`Liability Rebalancing ${!isAutoRebalanceActive ? 'Activated' : 'Paused'}`, 'success');
                        }}
                      >
                        {isAutoRebalanceActive ? '✓ Auto-Rebalance ON' : 'Paused'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Live Match Liability Grid */}
                <div className="admin-card">
                  <div className="card-header">
                    <h4>🏏 Real-Time Match Liability & Dynamic Odds Grid</h4>
                    <p className="card-sub text-muted">Live exposure breakdown per match across all active markets</p>
                  </div>

                  <div className="admin-table-wrap mt-4">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Match Fixture</th>
                          <th>Sport / League</th>
                          <th>Home Liability</th>
                          <th>Away Liability</th>
                          <th>Draw Liability</th>
                          <th>Dynamic Margin</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {liveMatches.slice(0, 10).map((m) => (
                          <tr key={m.id}>
                            <td>
                              <strong>{m.team1?.name || m.homeTeam?.name || 'Team 1'} vs {m.team2?.name || m.awayTeam?.name || 'Team 2'}</strong>
                            </td>
                            <td><span className="admin-badge admin-badge--neutral">{m.sport || 'Cricket'}</span></td>
                            <td><span className="text-green font-bold">₹{(Math.random() * 45000 + 5000).toFixed(0)}</span></td>
                            <td><span className="text-purple font-bold">₹{(Math.random() * 35000 + 2000).toFixed(0)}</span></td>
                            <td><span className="text-muted">₹{(Math.random() * 12000 + 1000).toFixed(0)}</span></td>
                            <td><span className="admin-badge admin-badge--live">{marginOverround}%</span></td>
                            <td><span className="status-tag status-tag--pending">PRICING LIVE</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: FINANCIAL LEDGER & ALL TRANSACTIONS */}
            {activeTab === 'financial_ledger' && (
              <div className="admin-tab-content">
                {/* Pending Withdrawal Approvals Banner */}
                {systemTxList.some((tx) => (tx.type === 'WITHDRAWAL' || tx.type === 'withdraw') && (tx.status === 'PENDING' || tx.status === 'PENDING_APPROVAL')) && (
                  <div className="admin-card mb-4" style={{ border: '2px solid #ef4444', background: 'rgba(239, 68, 68, 0.1)' }}>
                    <div className="card-header flex-between">
                      <h4 style={{ color: '#dc2626', margin: 0 }}>
                        🚨 Pending Withdrawal Requests Requiring Approval ({systemTxList.filter((tx) => (tx.type === 'WITHDRAWAL' || tx.type === 'withdraw') && (tx.status === 'PENDING' || tx.status === 'PENDING_APPROVAL')).length})
                      </h4>
                      <span className="admin-badge admin-badge--danger">FINANCE APPROVAL REQUIRED</span>
                    </div>
                    <div className="admin-table-wrap mt-3">
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th>Tx ID</th>
                            <th>User Email</th>
                            <th>Target Bank / UPI ID</th>
                            <th>Requested Amount</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {systemTxList.filter((tx) => (tx.type === 'WITHDRAWAL' || tx.type === 'withdraw') && (tx.status === 'PENDING' || tx.status === 'PENDING_APPROVAL')).map((tx) => (
                            <tr key={tx.id}>
                              <td><code className="tx-id-code">{tx.id}</code></td>
                              <td><div className="user-cell-email font-bold">{tx.userEmail}</div></td>
                              <td>
                                <span className="font-bold text-xs" style={{ color: '#0284c7' }}>
                                  {tx.details || tx.method || 'UPI Transfer'}
                                </span>
                              </td>
                              <td><span className="font-bold text-danger">{formatInr(Math.abs(tx.amount))}</span></td>
                              <td>
                                <div className="table-actions" style={{ display: 'flex', gap: '6px' }}>
                                  <button
                                    className="admin-btn admin-btn--xs admin-btn--success"
                                    onClick={() => handleApproveWithdrawal(tx.id, tx.userEmail, Math.abs(tx.amount))}
                                  >
                                    ✓ Approve & Transfer to Bank/UPI
                                  </button>
                                  <button
                                    className="admin-btn admin-btn--xs admin-btn--danger"
                                    onClick={() => handleRejectWithdrawal(tx.id, tx.userEmail, Math.abs(tx.amount))}
                                  >
                                    ✕ Reject & Refund
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="admin-card mb-6">
                  <div className="card-header flex-between">
                    <div>
                      <h3>📜 Master System Financial Ledger</h3>
                      <p className="card-sub text-muted">Capturing every single deposit, withdrawal, bet payout, and bonus across the system</p>
                    </div>
                    <button
                      type="button"
                      className="admin-btn admin-btn--sm"
                      onClick={() => setSystemTxList(loadAllSystemTransactions())}
                    >
                      <FiRefreshCw /> Refresh Ledger
                    </button>
                  </div>

                  {/* Filter controls */}
                  <div className="admin-filters-row mt-4">
                    <div className="search-box">
                      <FiSearch className="search-icon" />
                      <input
                        type="text"
                        placeholder="Search Tx ID, User Email, Name, or UTR..."
                        value={txSearchQuery}
                        onChange={(e) => setTxSearchQuery(e.target.value)}
                      />
                    </div>

                    <div className="filter-group">
                      <label>Type:</label>
                      <select value={txFilterType} onChange={(e) => setTxFilterType(e.target.value)}>
                        <option value="ALL">All Types</option>
                        <option value="DEPOSIT">Deposits</option>
                        <option value="WITHDRAWAL">Withdrawals</option>
                        <option value="BET_WIN">Bet Wins</option>
                        <option value="BET_STAKE">Bet Stakes</option>
                        <option value="BONUS_CLAIM">Bonus Claims</option>
                      </select>
                    </div>

                    <div className="filter-group">
                      <label>Status:</label>
                      <select value={txFilterStatus} onChange={(e) => setTxFilterStatus(e.target.value)}>
                        <option value="ALL">All Statuses</option>
                        <option value="COMPLETED">Completed</option>
                        <option value="PENDING">Pending Approval</option>
                        <option value="REJECTED">Rejected</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="admin-card">
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Transaction ID</th>
                          <th>User / Email</th>
                          <th>Date & Time</th>
                          <th>Type</th>
                          <th>Method / Gateway</th>
                          <th>UTR / Ref Code</th>
                          <th>Amount</th>
                          <th>Status</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTxList.length === 0 ? (
                          <tr>
                            <td colSpan="9" className="text-center py-6 text-muted">
                              No matching transactions found in the financial ledger.
                            </td>
                          </tr>
                        ) : (
                          filteredTxList.map((tx) => (
                            <tr key={tx.id}>
                              <td><code className="tx-id-code">{tx.id}</code></td>
                              <td>
                                <div className="user-cell-name">{tx.userName || 'User'}</div>
                                <div className="user-cell-email">{tx.userEmail}</div>
                              </td>
                              <td className="text-xs text-muted">
                                {new Date(tx.createdAt).toLocaleString('en-IN', {
                                  dateStyle: 'medium',
                                  timeStyle: 'short',
                                })}
                              </td>
                              <td>
                                <span className={`tx-type-pill tx-type-pill--${(tx.type || 'other').toLowerCase()}`}>
                                  {tx.type}
                                </span>
                              </td>
                              <td><span className="font-bold text-xs">{tx.method || 'Online'}</span></td>
                              <td><code className="utr-code">{tx.utr || 'N/A'}</code></td>
                              <td>
                                <span className={`font-bold ${['DEPOSIT', 'BET_WIN', 'BONUS_CLAIM'].includes(tx.type) ? 'text-green' : 'text-danger'}`}>
                                  {['DEPOSIT', 'BET_WIN', 'BONUS_CLAIM'].includes(tx.type) ? '+' : '-'}{formatInr(Math.abs(tx.amount || 0))}
                                </span>
                              </td>
                              <td>
                                <span className={`status-tag status-tag--${(tx.status || 'completed').toLowerCase()}`}>
                                  {tx.status}
                                </span>
                              </td>
                              <td>
                                {(tx.type === 'WITHDRAWAL' || tx.type === 'withdraw') && (tx.status === 'PENDING' || tx.status === 'PENDING_APPROVAL') ? (
                                  <div className="table-actions" style={{ display: 'flex', gap: '4px' }}>
                                    <button
                                      type="button"
                                      className="admin-btn admin-btn--xs admin-btn--success"
                                      onClick={() => handleApproveWithdrawal(tx.id, tx.userEmail, Math.abs(tx.amount))}
                                    >
                                      ✓ Approve
                                    </button>
                                    <button
                                      type="button"
                                      className="admin-btn admin-btn--xs admin-btn--danger"
                                      onClick={() => handleRejectWithdrawal(tx.id, tx.userEmail, Math.abs(tx.amount))}
                                    >
                                      ✕ Reject
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    className="admin-btn admin-btn--sm"
                                    onClick={() => {
                                      navigator.clipboard.writeText(tx.utr || tx.id);
                                      showToast(`Copied UTR/Ref ${tx.utr || tx.id}!`, 'info');
                                    }}
                                  >
                                    Copy Ref
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
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

            {/* TAB 6: USERS & WALLETS + PER-USER TRANSACTION LEDGER */}
            {activeTab === 'users' && (
              <div className="admin-tab-content">
                <div className="admin-card mb-6">
                  <div className="card-header flex-between">
                    <div>
                      <h3>👤 Active User Account & Per-User Transaction History</h3>
                      <p className="card-sub text-muted">Select any user to inspect their wallet balances and full transaction ledger (Deposits, Withdrawals, Bets, Rewards)</p>
                    </div>
                    <div className="user-select-box">
                      <label className="text-xs font-bold text-muted mr-2">Select User Account:</label>
                      <select
                        value={selectedUserEmail}
                        onChange={(e) => setSelectedUserEmail(e.target.value)}
                        className="user-select-dropdown"
                      >
                        <option value="demo@betking.com">Demo User (demo@betking.com)</option>
                        <option value="vikram.s@gmail.com">Vikram S. (vikram.s@gmail.com)</option>
                        <option value="ananya.p@yahoo.com">Ananya P. (ananya.p@yahoo.com)</option>
                        <option value="manish.k@gmail.com">Manish Kumar (manish.k@gmail.com)</option>
                        <option value="rohan.v@outlook.com">Rohan Verma (rohan.v@outlook.com)</option>
                        <option value="arjun.r@yahoo.com">Arjun Reddy (arjun.r@yahoo.com)</option>
                      </select>
                    </div>
                  </div>

                  <div className="admin-user-profile-view mt-4">
                    <div className="user-profile-card">
                      <div className="user-avatar-large">
                        {selectedUserEmail.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h4>{selectedUserEmail.split('@')[0]}</h4>
                        <p>{selectedUserEmail} · <span className="vip-tag">Active Account</span></p>
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

                  {/* Per-User Financial Summary Cards */}
                  <div className="admin-metrics-grid user-financial-grid mt-4">
                    <div className="admin-card metric-card">
                      <div className="metric-icon" style={{ background: '#10b98120', color: '#10b981' }}><FiDollarSign /></div>
                      <div className="metric-info">
                        <span className="metric-label">Total Deposited</span>
                        <span className="metric-value text-green">{formatInr(selectedUserStats.deposits)}</span>
                        <span className="metric-sub">User Deposit Lifetime</span>
                      </div>
                    </div>

                    <div className="admin-card metric-card">
                      <div className="metric-icon" style={{ background: '#3b82f620', color: '#3b82f6' }}><FiActivity /></div>
                      <div className="metric-info">
                        <span className="metric-label">Total Withdrawn</span>
                        <span className="metric-value">{formatInr(selectedUserStats.withdrawals)}</span>
                        <span className="metric-sub">User Withdrawal Lifetime</span>
                      </div>
                    </div>

                    <div className="admin-card metric-card">
                      <div className="metric-icon" style={{ background: '#8b5cf620', color: '#8b5cf6' }}><FiTrendingUp /></div>
                      <div className="metric-info">
                        <span className="metric-label">Total Payout Winnings</span>
                        <span className="metric-value">{formatInr(selectedUserStats.totalWon)}</span>
                        <span className="metric-sub">Staked: {formatInr(selectedUserStats.totalStaked)}</span>
                      </div>
                    </div>

                    <div className="admin-card metric-card">
                      <div className="metric-icon" style={{ background: '#f59e0b20', color: '#f59e0b' }}><FiCheckCircle /></div>
                      <div className="metric-info">
                        <span className="metric-label">User Net P&L</span>
                        <span className={`metric-value ${selectedUserStats.netPnl >= 0 ? 'text-green' : 'text-danger'}`}>
                          {selectedUserStats.netPnl >= 0 ? '+' : ''}{formatInr(selectedUserStats.netPnl)}
                        </span>
                        <span className="metric-sub">{selectedUserStats.netPnl >= 0 ? 'Net Winner' : 'Net Contributor'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* PER-USER TRANSACTION HISTORY TABLE */}
                <div className="admin-card">
                  <div className="card-header flex-between">
                    <div>
                      <h4>📜 Transaction History for {selectedUserEmail}</h4>
                      <span className="text-xs text-muted">Showing all deposits, withdrawals, bet stakes, payouts, and bonus claims for this account</span>
                    </div>

                    <div className="filter-pills">
                      {['ALL', 'DEPOSIT', 'WITHDRAWAL', 'BET_WIN', 'BET_STAKE', 'BONUS_CLAIM'].map((t) => (
                        <button
                          key={t}
                          type="button"
                          className={`filter-pill ${selectedUserTxFilter === t ? 'active' : ''}`}
                          onClick={() => setSelectedUserTxFilter(t)}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Transaction ID</th>
                          <th>Date & Time</th>
                          <th>Type</th>
                          <th>Method / Gateway</th>
                          <th>UTR / Ref Code</th>
                          <th>Amount</th>
                          <th>Status</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedUserTransactions.length === 0 ? (
                          <tr>
                            <td colSpan="8" className="text-center py-6 text-muted">
                              No transactions recorded for {selectedUserEmail} under "{selectedUserTxFilter}" filter.
                            </td>
                          </tr>
                        ) : (
                          selectedUserTransactions.map((tx) => (
                            <tr key={tx.id}>
                              <td><code className="tx-id-code">{tx.id}</code></td>
                              <td className="text-xs text-muted">
                                {new Date(tx.createdAt).toLocaleString('en-IN', {
                                  dateStyle: 'medium',
                                  timeStyle: 'short',
                                })}
                              </td>
                              <td>
                                <span className={`tx-type-pill tx-type-pill--${(tx.type || 'other').toLowerCase()}`}>
                                  {tx.type}
                                </span>
                              </td>
                              <td><span className="font-bold text-xs">{tx.method || 'Online'}</span></td>
                              <td><code className="utr-code">{tx.utr || 'N/A'}</code></td>
                              <td>
                                <span className={`font-bold ${['DEPOSIT', 'BET_WIN', 'BONUS_CLAIM'].includes(tx.type) ? 'text-green' : 'text-danger'}`}>
                                  {['DEPOSIT', 'BET_WIN', 'BONUS_CLAIM'].includes(tx.type) ? '+' : '-'}{formatInr(tx.amount || 0)}
                                </span>
                              </td>
                              <td>
                                <span className={`status-tag status-tag--${(tx.status || 'completed').toLowerCase()}`}>
                                  {tx.status}
                                </span>
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="admin-btn admin-btn--sm"
                                  onClick={() => {
                                    navigator.clipboard.writeText(tx.utr || tx.id);
                                    showToast(`Copied UTR/Ref ${tx.utr || tx.id}!`, 'info');
                                  }}
                                >
                                  Copy Ref
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
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
                <div className="admin-card mb-4" style={{ border: '2px solid #3b82f6' }}>
                  <div className="card-header flex-between">
                    <div>
                      <h3 style={{ margin: 0 }}>🏦 Live Pending Withdrawal Requests Queue</h3>
                      <p className="card-sub text-muted" style={{ margin: 0 }}>User requests awaiting manual Admin verification and payout transfer to Bank / UPI</p>
                    </div>
                    <button
                      type="button"
                      className="admin-btn admin-btn--sm"
                      onClick={() => setSystemTxList(loadAllSystemTransactions())}
                    >
                      <FiRefreshCw /> Refresh Queue
                    </button>
                  </div>

                  <div className="admin-table-wrap mt-4">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Request ID</th>
                          <th>User Email</th>
                          <th>Requested Amount</th>
                          <th>Target Bank / UPI Details</th>
                          <th>Requested At</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {systemTxList.filter((tx) => (tx.type === 'WITHDRAWAL' || tx.type === 'withdraw')).length === 0 ? (
                          <tr>
                            <td colSpan="7" className="text-center py-6 text-muted">
                              No withdrawal requests found in queue.
                            </td>
                          </tr>
                        ) : (
                          systemTxList.filter((tx) => (tx.type === 'WITHDRAWAL' || tx.type === 'withdraw')).map((w) => (
                            <tr key={w.id}>
                              <td className="font-mono">{w.id}</td>
                              <td><div className="user-cell-email font-bold">{w.userEmail || w.userName}</div></td>
                              <td className="font-bold text-danger">{formatInr(Math.abs(w.amount))}</td>
                              <td>
                                <span className="font-mono font-bold" style={{ color: '#0284c7' }}>
                                  {w.details || w.method || w.upiId || 'UPI Payout'}
                                </span>
                              </td>
                              <td className="text-xs text-muted">
                                {new Date(w.createdAt || Date.now()).toLocaleString('en-IN', {
                                  dateStyle: 'medium',
                                  timeStyle: 'short',
                                })}
                              </td>
                              <td>
                                <span className={`status-tag status-tag--${(w.status || 'pending').toLowerCase()}`}>
                                  {(w.status || 'PENDING').toUpperCase()}
                                </span>
                              </td>
                              <td>
                                {(w.status === 'PENDING' || w.status === 'PENDING_APPROVAL' || w.status === 'pending') ? (
                                  <div className="table-actions" style={{ display: 'flex', gap: '6px' }}>
                                    <button
                                      className="admin-btn admin-btn--xs admin-btn--success"
                                      onClick={() => handleApproveWithdrawal(w.id, w.userEmail, Math.abs(w.amount))}
                                    >
                                      ✓ Approve & Transfer to UPI/Bank
                                    </button>
                                    <button
                                      className="admin-btn admin-btn--xs admin-btn--danger"
                                      onClick={() => handleRejectWithdrawal(w.id, w.userEmail, Math.abs(w.amount))}
                                    >
                                      ✕ Reject & Refund
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-muted text-xs">Processed</span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 11: LIVE PUSH ALERTS */}
            {activeTab === 'push_alerts' && (
              <div className="admin-tab-content">
                <div className="admin-card">
                  <div className="card-header">
                    <h3>⚡ Dispatch Live Broadcast Push Alert</h3>
                  </div>

                  <form onSubmit={handleDispatchNotification} className="admin-form-grid">
                    <div className="form-group" style={{ gridColumn: 'span 2' }}>
                      <label>Notification Message</label>
                      <input
                        type="text"
                        placeholder="e.g. Claim ₹500 Free Bet Now!"
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
