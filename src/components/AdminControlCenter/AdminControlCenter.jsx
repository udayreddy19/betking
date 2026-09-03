import { useState, useEffect } from 'react';
import { FiActivity, FiUsers, FiDollarSign, FiShield, FiSearch, FiCheckCircle, FiRefreshCw, FiCpu, FiAlertTriangle } from '../../icons';
import './AdminControlCenter.css';
import { formatIst, formatIstDateTime } from '../../utils/istTime';

export default function AdminControlCenter() {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState('overview');

  // Search states
  const [userSearchId, setUserSearchId] = useState('user_demo_101');
  const [user360Data, setUser360Data] = useState(null);
  const [betSearchId, setBetSearchId] = useState('');
  const [betTraceData, setBetTraceData] = useState(null);

  const fetchOverview = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/dashboard/overview');
      if (res.ok) {
        const data = await res.json();
        setOverview(data);
      }
    } catch (err) {
      console.error('Failed to fetch dashboard overview:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchUser360 = async (uId) => {
    if (!uId) return;
    try {
      const res = await fetch(`/api/admin/users/${uId}/360`);
      if (res.ok) {
        const data = await res.json();
        setUser360Data(data);
      }
    } catch (err) {
      console.error('Failed to fetch User 360:', err);
    }
  };

  const fetchBetTrace = async (bId) => {
    if (!bId) return;
    try {
      const res = await fetch(`/api/admin/bets/${bId}/investigate`);
      if (res.ok) {
        const data = await res.json();
        setBetTraceData(data);
      }
    } catch (err) {
      console.error('Failed to trace bet:', err);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  return (
    <div className="admin-control-center-container">
      {/* NAVIGATION BAR */}
      <div className="acc-nav-header">
        <div className="acc-title-group">
          <FiActivity className="acc-icon" />
          <div>
            <h2 className="text-lg font-bold text-slate-100">Operations Control Center & Realtime Intelligence</h2>
            <p className="text-xs text-slate-400">100% Real-Time Backend Data Hub & Dual-Authorization Workflow</p>
          </div>
        </div>

        <div className="acc-tabs">
          <button className={`acc-tab ${activeSubTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveSubTab('overview')}>
            <FiActivity /> Overview
          </button>
          <button className={`acc-tab ${activeSubTab === 'user360' ? 'active' : ''}`} onClick={() => { setActiveSubTab('user360'); fetchUser360(userSearchId); }}>
            <FiUsers /> User 360
          </button>
          <button className={`acc-tab ${activeSubTab === 'betTrace' ? 'active' : ''}`} onClick={() => setActiveSubTab('betTrace')}>
            <FiSearch /> Bet Trace
          </button>
          <button className={`acc-tab ${activeSubTab === 'system' ? 'active' : ''}`} onClick={() => setActiveSubTab('system')}>
            <FiCpu /> System & Outbox
          </button>
          <button type="button" className="acc-refresh-btn" onClick={fetchOverview}>
            <FiRefreshCw className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* SUBTAB 1: OPERATIONAL OVERVIEW */}
      {activeSubTab === 'overview' && (
        <div className="acc-overview-grid">
          {/* USERS CARD */}
          <div className="acc-card">
            <div className="acc-card-header">
              <FiUsers className="text-blue-400" />
              <h3>Users Overview</h3>
            </div>
            <div className="acc-metrics-list">
              <div className="acc-metric-row"><span>Total Users:</span><strong>{overview?.users?.total || 0}</strong></div>
              <div className="acc-metric-row"><span>Active Users:</span><strong className="text-green-400">{overview?.users?.active || 0}</strong></div>
              <div className="acc-metric-row"><span>Restricted Users:</span><strong className="text-red-400">{overview?.users?.restricted || 0}</strong></div>
              <div className="acc-metric-row"><span>KYC Verified:</span><strong className="text-emerald-400">{overview?.users?.kycVerified || 0}</strong></div>
            </div>
          </div>

          {/* BETTING CARD */}
          <div className="acc-card">
            <div className="acc-card-header">
              <FiActivity className="text-purple-400" />
              <h3>Betting Operations</h3>
            </div>
            <div className="acc-metrics-list">
              <div className="acc-metric-row"><span>Total Bets:</span><strong>{overview?.betting?.totalBets || 0}</strong></div>
              <div className="acc-metric-row"><span>Settled Bets:</span><strong className="text-cyan-400">{overview?.betting?.settledBets || 0}</strong></div>
              <div className="acc-metric-row"><span>Total Stake:</span><strong>₹{(overview?.betting?.totalStake || 0).toLocaleString()}</strong></div>
              <div className="acc-metric-row"><span>Total Payout:</span><strong>₹{(overview?.betting?.totalPayout || 0).toLocaleString()}</strong></div>
            </div>
          </div>

          {/* FINANCE CARD */}
          <div className="acc-card">
            <div className="acc-card-header">
              <FiDollarSign className="text-emerald-400" />
              <h3>Financial Intelligence</h3>
            </div>
            <div className="acc-metrics-list">
              <div className="acc-metric-row"><span>Total Deposits:</span><strong>₹{(overview?.finance?.totalDeposits || 0).toLocaleString()}</strong></div>
              <div className="acc-metric-row"><span>Total Withdrawals:</span><strong>₹{(overview?.finance?.totalWithdrawals || 0).toLocaleString()}</strong></div>
              <div className="acc-metric-row"><span>Wallet Liability:</span><strong className="text-yellow-400">₹{(overview?.finance?.walletLiability || 0).toLocaleString()}</strong></div>
              <div className="acc-metric-row"><span>Open Recon Cases:</span><strong className="text-red-400">{overview?.finance?.openReconciliationCases || 0}</strong></div>
            </div>
          </div>

          {/* SYSTEM HEALTH CARD */}
          <div className="acc-card">
            <div className="acc-card-header">
              <FiCpu className="text-amber-400" />
              <h3>System & Outbox Health</h3>
            </div>
            <div className="acc-metrics-list">
              <div className="acc-metric-row"><span>PostgreSQL Engine:</span><strong className="text-green-400">{overview?.system?.postgres}</strong></div>
              <div className="acc-metric-row"><span>Redis Cache Broker:</span><strong className="text-purple-400">{overview?.system?.redis}</strong></div>
              <div className="acc-metric-row"><span>Pending Outbox Events:</span><strong className="text-yellow-400">{overview?.system?.pendingOutboxEvents || 0}</strong></div>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 2: USER 360 EXPLORER */}
      {activeSubTab === 'user360' && (
        <div className="acc-user360-workspace">
          <div className="acc-search-bar">
            <input
              type="text"
              placeholder="Enter User ID or Email..."
              value={userSearchId}
              onChange={(e) => setUserSearchId(e.target.value)}
            />
            <button type="button" onClick={() => fetchUser360(userSearchId)}>Search User 360</button>
          </div>

          {user360Data && (
            <div className="acc-user360-details">
              <div className="acc-profile-banner">
                <div>
                  <h3 className="font-bold text-slate-100">{user360Data.user.display_name || user360Data.user.email}</h3>
                  <p className="text-xs text-slate-400">User ID: {user360Data.user.user_id} | KYC: <span className="text-green-400 font-bold">{user360Data.user.kyc_status}</span></p>
                </div>
                <div className="acc-balance-badge">
                  <span>Balance:</span> <strong>₹{parseFloat(user360Data.wallet?.balance || 0).toLocaleString()}</strong>
                </div>
              </div>

              <h4 className="mt-4 font-bold text-sm text-slate-200">Chronological Activity Timeline</h4>
              <div className="acc-timeline-list">
                {user360Data.timeline?.map((item, i) => (
                  <div key={i} className="acc-timeline-item">
                    <span className="acc-timeline-badge">{item.type}</span>
                    <div>
                      <h5 className="font-bold text-slate-200 text-xs">{item.title}</h5>
                      <p className="text-xs text-slate-400">{item.details} • {formatIstDateTime(item.timestamp)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 3: BET TRACE */}
      {activeSubTab === 'betTrace' && (
        <div className="acc-bettrace-workspace">
          <div className="acc-search-bar">
            <input
              type="text"
              placeholder="Enter Bet ID (e.g. bet_12345)..."
              value={betSearchId}
              onChange={(e) => setBetSearchId(e.target.value)}
            />
            <button type="button" onClick={() => fetchBetTrace(betSearchId)}>Investigate Bet</button>
          </div>

          {betTraceData && (
            <div className="acc-bettrace-details">
              <div className="acc-card">
                <h4 className="font-bold text-slate-100">Bet Snapshot: {betTraceData.bet.bet_id}</h4>
                <p className="text-xs text-slate-400">User: {betTraceData.bet.email} | Stake: ₹{betTraceData.bet.stake} | Odds: {betTraceData.bet.odds} | Payout: ₹{betTraceData.bet.potential_payout}</p>
                <div className="mt-2 text-xs font-bold text-green-400">Status: {betTraceData.bet.status}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
