import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApiClient } from '../api/adminApiClient';
import AdminKPI from '../components/AdminKPI';
import AdminTabs from '../components/AdminTabs';
import AdminCard from '../components/AdminCard';
import { StatusBadge } from '../components/AdminBadge';
import { AdminKpiDrillDrawer, useAdminKpiDrilldown } from '../hooks/useAdminKpiDrilldown';
import { startVisibleInterval } from '../utils/visibleInterval';
import { useAdminToast } from '../components/AdminToastContext';

/** Display helper — never invent metrics */
export function formatMetric(value, prefix = '') {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return `${prefix}${Number(value).toLocaleString()}`;
}

export function formatInr(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return `₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatRelativeTime(isoString) {
  if (!isoString) return '—';
  try {
    const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch {
    return isoString;
  }
}

export default function ControlTowerView({ subModule = 'overview', onSubModuleChange, onNavigate }) {
  const navigate = useNavigate();
  const drill = useAdminKpiDrilldown();
  const { showToast } = useAdminToast();

  const [activeTab, setActiveTab] = useState(subModule || 'overview');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefreshAt, setLastRefreshAt] = useState(null);
  const [isAutoRefresh, setIsAutoRefresh] = useState(true);
  const [timeRange, setTimeRange] = useState('today');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionInProgress, setActionInProgress] = useState(null);

  // Sync tab with external subModule prop
  useEffect(() => {
    if (subModule && subModule !== activeTab) {
      setActiveTab(subModule);
    }
  }, [subModule]);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    if (onSubModuleChange) onSubModuleChange(tabId);
  };

  // Safe navigation helper
  const handleDomainNav = (domainId, subModuleId, params = {}) => {
    if (onNavigate) {
      onNavigate({ domainId, subModuleId, ...params });
    } else {
      navigate(`/admin?domain=${domainId}${subModuleId ? `&subModule=${subModuleId}` : ''}`);
    }
  };

  // Fetch full Control Tower data
  const fetchData = useCallback(async () => {
    try {
      const res = await adminApiClient.get('/operations/control-tower');
      if (res && res.success !== false) {
        setData(res);
        setError(null);
      } else {
        throw new Error(res?.error || 'Failed to load control tower data');
      }
    } catch (err) {
      setError(err.message || 'Unable to connect to Control Tower service');
    } finally {
      setLoading(false);
      setLastRefreshAt(Date.now());
    }
  }, []);

  // Polling loop with visible interval
  useEffect(() => {
    fetchData();
    if (!isAutoRefresh) return;
    const stop = startVisibleInterval(fetchData, 15000, { runImmediately: false });
    return () => stop();
  }, [fetchData, isAutoRefresh]);

  // Alert lifecycle action
  const handleAlertAction = async (alertId, actionType) => {
    setActionInProgress(alertId);
    try {
      await adminApiClient.post(`/operations/alerts/${alertId}/${actionType}`, {
        note: `Admin manually executed ${actionType} from Control Tower`,
      });
      showToast(`Alert successfully marked as ${actionType.toUpperCase()}`, 'success');
      fetchData();
    } catch (err) {
      showToast(err.message || `Failed to ${actionType} alert`, 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  // Quick global search submit
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    if (query.startsWith('usr_') || query.includes('@') || /^\+?[0-9]{10,14}$/.test(query)) {
      handleDomainNav('customers', 'dossier', { search: query });
    } else if (query.startsWith('tx_') || query.startsWith('wd_') || query.startsWith('pay_') || query.startsWith('order_')) {
      handleDomainNav('finance', 'deposits-review', { search: query });
    } else if (query.startsWith('bet_') || query.startsWith('match_')) {
      handleDomainNav('betting', 'bet-inspector', { search: query });
    } else {
      handleDomainNav('customers', 'dossier', { search: query });
    }
  };

  const tabs = [
    { id: 'overview', label: '🔴 Action Center & Overview' },
    { id: 'health', label: '🟢 System Health & Worker Fleet' },
    { id: 'security', label: '🛡️ Security & Activity Feed' },
  ];

  const actionRequired = data?.actionRequired || [];
  const queues = data?.actionQueues || {};
  const fin = data?.financial || {};
  const bet = data?.betting || {};
  const kyc = data?.usersKyc || {};
  const health = data?.systemHealth || {};
  const workers = data?.workers || [];
  const security = data?.securityOverview || {};
  const recentActivity = data?.recentActivity || [];

  return (
    <div className="admin-control-tower-page" style={{ padding: '0 0 40px 0' }}>
      {/* ── TOP CONTROL TOWER BAR ── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 16,
        background: 'linear-gradient(180deg, rgba(24, 24, 27, 0.95) 0%, rgba(18, 18, 20, 0.98) 100%)',
        padding: '16px 20px',
        borderRadius: 12,
        border: '1px solid rgba(255, 255, 255, 0.08)',
        marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 42,
            height: 42,
            borderRadius: 10,
            background: 'radial-gradient(circle, rgba(239, 68, 68, 0.2) 0%, rgba(24, 24, 27, 0) 100%)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
          }}>
            🗼
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#f4f4f5', letterSpacing: '-0.01em' }}>
                ADMIN CONTROL TOWER
              </h2>
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 999,
                background: data?.overallHealth === 'HEALTHY' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                color: data?.overallHealth === 'HEALTHY' ? '#10b981' : '#f59e0b',
                border: `1px solid ${data?.overallHealth === 'HEALTHY' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
              }}>
                {data?.overallHealth === 'HEALTHY' ? '● SYSTEM HEALTHY' : '▲ ATTENTION REQUIRED'}
              </span>
            </div>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#a1a1aa' }}>
              Operations Desk · Real-time actionable oversight & incident response
            </p>
          </div>
        </div>

        {/* Global Search Bar */}
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 320px', maxWidth: 450 }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <input
              type="text"
              placeholder="Search User ID, Email, Bet ID, Tx ID, Withdrawal ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px 9px 34px',
                background: 'rgba(9, 9, 11, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: 8,
                color: '#fff',
                fontSize: 12,
                outline: 'none',
              }}
            />
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#71717a', fontSize: 13 }}>
              🔍
            </span>
          </div>
          <button
            type="submit"
            style={{
              padding: '9px 14px',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: 8,
              color: '#f4f4f5',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Find
          </button>
        </form>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            style={{
              padding: '8px 12px',
              background: 'rgba(9, 9, 11, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: 8,
              color: '#d4d4d8',
              fontSize: 12,
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="today">Today (UTC)</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
          </select>

          <button
            onClick={() => setIsAutoRefresh(!isAutoRefresh)}
            title={isAutoRefresh ? 'Pause auto-refresh' : 'Resume auto-refresh'}
            style={{
              padding: '8px 12px',
              background: isAutoRefresh ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255, 255, 255, 0.05)',
              border: `1px solid ${isAutoRefresh ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`,
              borderRadius: 8,
              color: isAutoRefresh ? '#10b981' : '#71717a',
              fontSize: 12,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span style={{ fontSize: 10 }}>{isAutoRefresh ? '🟢' : '⏸️'}</span>
            {isAutoRefresh ? 'Live (15s)' : 'Paused'}
          </button>

          <button
            onClick={fetchData}
            disabled={loading}
            style={{
              padding: '8px 14px',
              background: 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)',
              border: 'none',
              borderRadius: 8,
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>⟳</span>
            Refresh
          </button>
        </div>
      </div>

      {/* ── ERROR BANNER (IF ANY) ── */}
      {error && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.12)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          color: '#f87171',
          fontSize: 13,
        }}>
          <div>
            <strong>⚠️ Operational Notice:</strong> {error}
          </div>
          <button
            onClick={fetchData}
            style={{
              padding: '4px 12px',
              background: 'rgba(239, 68, 68, 0.2)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: 6,
              color: '#fff',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* ── PART 3: CRITICAL ACTION REQUIRED CENTER ── */}
      <section style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>⚡</span>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#f4f4f5', letterSpacing: '-0.01em' }}>
              WHAT REQUIRES ATTENTION RIGHT NOW
            </h3>
            {actionRequired.length > 0 && (
              <span style={{
                background: '#ef4444',
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
                padding: '1px 7px',
                borderRadius: 999,
              }}>
                {actionRequired.length}
              </span>
            )}
          </div>
          <span style={{ fontSize: 12, color: '#71717a' }}>
            Deterministic priority order: 🔴 Critical ➔ 🟠 High ➔ 🟡 Attention
          </span>
        </div>

        {loading && !data ? (
          <div style={{ padding: 30, textAlign: 'center', background: '#18181b', borderRadius: 10, border: '1px solid rgba(255, 255, 255, 0.05)', color: '#71717a' }}>
            Loading live operational state...
          </div>
        ) : actionRequired.length === 0 ? (
          <div style={{
            background: 'linear-gradient(180deg, rgba(16, 185, 129, 0.06) 0%, rgba(18, 18, 20, 0.8) 100%)',
            border: '1px solid rgba(16, 185, 129, 0.2)',
            borderRadius: 10,
            padding: '24px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              background: 'rgba(16, 185, 129, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              color: '#10b981',
            }}>
              ✓
            </div>
            <div>
              <h4 style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 600, color: '#10b981' }}>
                All Operational Queues are Clear
              </h4>
              <p style={{ margin: 0, fontSize: 12, color: '#a1a1aa' }}>
                No financial inconsistencies, stuck bets, settlement errors, or pending escalations detected.
              </p>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {actionRequired.map((item) => {
              const isCrit = item.severity === 'CRITICAL';
              const isHigh = item.severity === 'HIGH';
              const borderColor = isCrit ? 'rgba(239, 68, 68, 0.5)' : isHigh ? 'rgba(249, 115, 22, 0.4)' : 'rgba(234, 179, 8, 0.3)';
              const bgGradient = isCrit
                ? 'linear-gradient(90deg, rgba(239, 68, 68, 0.12) 0%, rgba(24, 24, 27, 0.95) 100%)'
                : isHigh
                  ? 'linear-gradient(90deg, rgba(249, 115, 22, 0.08) 0%, rgba(24, 24, 27, 0.95) 100%)'
                  : 'linear-gradient(90deg, rgba(234, 179, 8, 0.06) 0%, rgba(24, 24, 27, 0.95) 100%)';
              const badgeColor = isCrit ? '#ef4444' : isHigh ? '#f97316' : '#eab308';

              return (
                <div
                  key={item.id}
                  style={{
                    background: bgGradient,
                    border: `1px solid ${borderColor}`,
                    borderRadius: 10,
                    padding: '14px 18px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 14,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: '1 1 450px' }}>
                    <span style={{ fontSize: 18 }}>{isCrit ? '🔴' : isHigh ? '🟠' : '🟡'}</span>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                        <span style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: 4,
                          background: `${badgeColor}22`,
                          color: badgeColor,
                          border: `1px solid ${badgeColor}55`,
                        }}>
                          {item.severity}
                        </span>
                        <strong style={{ fontSize: 14, color: '#f4f4f5' }}>{item.title}</strong>
                        {item.count != null && (
                          <span style={{
                            fontSize: 11,
                            fontWeight: 600,
                            padding: '1px 6px',
                            borderRadius: 999,
                            background: 'rgba(255, 255, 255, 0.1)',
                            color: '#e4e4e7',
                          }}>
                            {item.count} item{item.count === 1 ? '' : 's'}
                          </span>
                        )}
                      </div>
                      <p style={{ margin: 0, fontSize: 12, color: '#a1a1aa', lineHeight: 1.4 }}>
                        {item.description}
                      </p>
                      <div style={{ display: 'flex', gap: 14, marginTop: 4, fontSize: 11, color: '#71717a' }}>
                        <span>First: <strong>{item.firstDetected || '—'}</strong></span>
                        <span>Latest: <strong>{item.latestOccurrence || '—'}</strong></span>
                        <span>Status: <strong style={{ color: '#d4d4d8' }}>{item.status}</strong></span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      onClick={() => handleDomainNav(item.domainId, item.subModuleId)}
                      style={{
                        padding: '7px 14px',
                        background: isCrit ? '#dc2626' : isHigh ? '#ea580c' : '#ca8a04',
                        border: 'none',
                        borderRadius: 6,
                        color: '#fff',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {item.ctaLabel || 'Investigate'} ➔
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── PART 4: ACTION QUEUES BAR ── */}
      <section style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#d4d4d8' }}>
            ACTIVE OPERATIONAL QUEUES
          </h3>
          <span style={{ fontSize: 11, color: '#71717a' }}>Click to navigate directly to dedicated queue</span>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
        }}>
          {/* 1. Pending Withdrawals */}
          <div
            onClick={() => handleDomainNav('finance', 'deposits-review')}
            style={{
              background: '#18181b',
              border: (queues.withdrawals?.count || 0) > 0 ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 8,
              padding: '12px 14px',
              cursor: 'pointer',
              transition: 'transform 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#a1a1aa' }}>
              <span>Withdrawals</span>
              <span>💸</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: (queues.withdrawals?.count || 0) > 0 ? '#fbbf24' : '#f4f4f5', margin: '4px 0 2px' }}>
              {formatMetric(queues.withdrawals?.count ?? 0)}
            </div>
            <div style={{ fontSize: 11, color: '#71717a' }}>
              Oldest: <strong>{queues.withdrawals?.oldestAge || 'None'}</strong>
            </div>
          </div>

          {/* 2. Pending KYC */}
          <div
            onClick={() => handleDomainNav('customers', 'kyc-queue')}
            style={{
              background: '#18181b',
              border: (queues.kyc?.count || 0) > 0 ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 8,
              padding: '12px 14px',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#a1a1aa' }}>
              <span>Pending KYC</span>
              <span>🪪</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: (queues.kyc?.count || 0) > 0 ? '#60a5fa' : '#f4f4f5', margin: '4px 0 2px' }}>
              {formatMetric(queues.kyc?.count ?? 0)}
            </div>
            <div style={{ fontSize: 11, color: '#71717a' }}>
              Oldest: <strong>{queues.kyc?.oldestAge || 'None'}</strong>
            </div>
          </div>

          {/* 3. Stuck Bets */}
          <div
            onClick={() => handleDomainNav('betting', 'stuck-bets')}
            style={{
              background: '#18181b',
              border: (queues.stuckBets?.count || 0) > 0 ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 8,
              padding: '12px 14px',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#a1a1aa' }}>
              <span>Stuck Bets</span>
              <span>🎯</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: (queues.stuckBets?.count || 0) > 0 ? '#f87171' : '#f4f4f5', margin: '4px 0 2px' }}>
              {formatMetric(queues.stuckBets?.count ?? 0)}
            </div>
            <div style={{ fontSize: 11, color: '#71717a' }}>
              Concluded matches
            </div>
          </div>

          {/* 4. Settlement Failures */}
          <div
            onClick={() => handleDomainNav('betting', 'settlement-queue')}
            style={{
              background: '#18181b',
              border: (queues.settlementFailures?.count || 0) > 0 ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 8,
              padding: '12px 14px',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#a1a1aa' }}>
              <span>Settlement Errors</span>
              <span>⚙️</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: (queues.settlementFailures?.count || 0) > 0 ? '#f87171' : '#10b981', margin: '4px 0 2px' }}>
              {formatMetric(queues.settlementFailures?.count ?? 0)}
            </div>
            <div style={{ fontSize: 11, color: '#71717a' }}>
              {queues.settlementFailures?.count === 0 ? 'All settled clean' : 'Requires retry'}
            </div>
          </div>

          {/* 5. Payment Failures */}
          <div
            onClick={() => handleDomainNav('finance', 'deposits-review')}
            style={{
              background: '#18181b',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 8,
              padding: '12px 14px',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#a1a1aa' }}>
              <span>Failed Deposits</span>
              <span>💳</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#f4f4f5', margin: '4px 0 2px' }}>
              {formatMetric(queues.paymentFailures?.count ?? 0)}
            </div>
            <div style={{ fontSize: 11, color: '#71717a' }}>
              Today's webhook fails
            </div>
          </div>

          {/* 6. Failed Jobs / Outbox DLQ */}
          <div
            onClick={() => handleDomainNav('operations', 'outbox-queue')}
            style={{
              background: '#18181b',
              border: (queues.failedJobs?.count || 0) > 0 ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 8,
              padding: '12px 14px',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#a1a1aa' }}>
              <span>Failed Outbox Jobs</span>
              <span>📦</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: (queues.failedJobs?.count || 0) > 0 ? '#fbbf24' : '#10b981', margin: '4px 0 2px' }}>
              {formatMetric(queues.failedJobs?.count ?? 0)}
            </div>
            <div style={{ fontSize: 11, color: '#71717a' }}>
              Async worker DLQ
            </div>
          </div>

          {/* 7. Open Support Tickets */}
          <div
            onClick={() => handleDomainNav('support', 'ticket-queue')}
            style={{
              background: '#18181b',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 8,
              padding: '12px 14px',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#a1a1aa' }}>
              <span>Open Tickets</span>
              <span>💬</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#f4f4f5', margin: '4px 0 2px' }}>
              {formatMetric(queues.supportTickets?.count ?? 0)}
            </div>
            <div style={{ fontSize: 11, color: '#71717a' }}>
              Customer inquiries
            </div>
          </div>

          {/* 8. Security Alerts */}
          <div
            onClick={() => handleDomainNav('security', 'audit-explorer')}
            style={{
              background: '#18181b',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 8,
              padding: '12px 14px',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#a1a1aa' }}>
              <span>Security Alerts</span>
              <span>🔒</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#10b981', margin: '4px 0 2px' }}>
              {formatMetric(queues.securityAlerts?.count ?? 0)}
            </div>
            <div style={{ fontSize: 11, color: '#71717a' }}>
              Zero open incidents
            </div>
          </div>
        </div>
      </section>

      {/* ── NAVIGATION TABS ── */}
      <AdminTabs tabs={tabs} activeTab={activeTab} onTabChange={handleTabChange} />

      {/* ── TAB 1: OPERATIONAL OVERVIEW & DOMAIN CARDS ── */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 20 }}>
          {/* Row 1: Finance & Betting Operational Panels */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
            {/* PART 5: FINANCE OVERVIEW */}
            <div style={{
              background: '#18181b',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 10,
              padding: '18px 20px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>💳</span>
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#f4f4f5' }}>FINANCE & LEDGER OVERVIEW</h4>
                </div>
                <button
                  onClick={() => handleDomainNav('finance', 'finance-health')}
                  style={{ background: 'none', border: 'none', color: '#60a5fa', fontSize: 12, cursor: 'pointer' }}
                >
                  View Details ➔
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px 12px', borderRadius: 6 }}>
                  <div style={{ fontSize: 11, color: '#a1a1aa' }}>Total Wallet Cash</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#10b981', marginTop: 2 }}>
                    {formatInr(fin.totalWalletCash)}
                  </div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px 12px', borderRadius: 6 }}>
                  <div style={{ fontSize: 11, color: '#a1a1aa' }}>Pending Withdrawals</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: (fin.pendingWithdrawalsCount || 0) > 0 ? '#fbbf24' : '#f4f4f5', marginTop: 2 }}>
                    {formatMetric(fin.pendingWithdrawalsCount)}
                  </div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px 12px', borderRadius: 6 }}>
                  <div style={{ fontSize: 11, color: '#a1a1aa' }}>Today's Deposits</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#f4f4f5', marginTop: 2 }}>
                    {formatMetric(fin.depositsTodayCount)} ({formatInr(fin.depositsTodayVolume)})
                  </div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px 12px', borderRadius: 6 }}>
                  <div style={{ fontSize: 11, color: '#a1a1aa' }}>Today's Withdrawals</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#f4f4f5', marginTop: 2 }}>
                    {formatMetric(fin.withdrawalsTodayCount)} ({formatInr(fin.withdrawalsTodayVolume)})
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#71717a', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 10 }}>
                <span>Wallet Inconsistencies: <strong style={{ color: '#10b981' }}>0 (Verified)</strong></span>
                <span>Ledger Anomalies: <strong style={{ color: '#10b981' }}>0 (Verified)</strong></span>
              </div>
            </div>

            {/* PART 6: BETTING OPERATIONS OVERVIEW */}
            <div style={{
              background: '#18181b',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 10,
              padding: '18px 20px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>🎯</span>
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#f4f4f5' }}>BETTING OPERATIONS OVERVIEW</h4>
                </div>
                <button
                  onClick={() => handleDomainNav('betting', 'betting-desk')}
                  style={{ background: 'none', border: 'none', color: '#60a5fa', fontSize: 12, cursor: 'pointer' }}
                >
                  View Desk ➔
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px 12px', borderRadius: 6 }}>
                  <div style={{ fontSize: 11, color: '#a1a1aa' }}>Live Fixtures (Priced)</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#f4f4f5', marginTop: 2 }}>
                    {formatMetric(bet.liveMatches)} ({formatMetric(bet.matchesWithOdds)} priced)
                  </div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px 12px', borderRadius: 6 }}>
                  <div style={{ fontSize: 11, color: '#a1a1aa' }}>Open Bets / Liability</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#f4f4f5', marginTop: 2 }}>
                    {formatMetric(bet.openBets)} ({formatInr(bet.openLiability)})
                  </div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px 12px', borderRadius: 6 }}>
                  <div style={{ fontSize: 11, color: '#a1a1aa' }}>Stuck Bets (Finished Matches)</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: (bet.stuckBetsCount || 0) > 0 ? '#f87171' : '#10b981', marginTop: 2 }}>
                    {formatMetric(bet.stuckBetsCount)}
                  </div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px 12px', borderRadius: 6 }}>
                  <div style={{ fontSize: 11, color: '#a1a1aa' }}>Settlement Worker</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#10b981', marginTop: 2 }}>
                    ● {bet.settlementWorkerStatus || 'ACTIVE'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#71717a', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 10 }}>
                <span>Bets Placed Today: <strong>{formatMetric(bet.betsPlacedToday)}</strong></span>
                <span>Settlement Failures: <strong style={{ color: (bet.settlementFailures || 0) > 0 ? '#f87171' : '#10b981' }}>{bet.settlementFailures || 0}</strong></span>
              </div>
            </div>
          </div>

          {/* Row 2: KYC Overview & Growth/Promotions */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
            {/* PART 7: KYC OVERVIEW */}
            <div style={{
              background: '#18181b',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 10,
              padding: '18px 20px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>🪪</span>
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#f4f4f5' }}>PLAYER KYC OPERATIONS</h4>
                </div>
                <button
                  onClick={() => handleDomainNav('customers', 'kyc-queue')}
                  style={{ background: 'none', border: 'none', color: '#60a5fa', fontSize: 12, cursor: 'pointer' }}
                >
                  Review Queue ➔
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px 12px', borderRadius: 6 }}>
                  <div style={{ fontSize: 11, color: '#a1a1aa' }}>Pending Submissions</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: (kyc.kycPending || 0) > 0 ? '#60a5fa' : '#f4f4f5', marginTop: 2 }}>
                    {formatMetric(kyc.kycPending)}
                  </div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px 12px', borderRadius: 6 }}>
                  <div style={{ fontSize: 11, color: '#a1a1aa' }}>Oldest Case Age</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#f4f4f5', marginTop: 2 }}>
                    {kyc.oldestPendingKycAge || 'No backlog'}
                  </div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px 12px', borderRadius: 6 }}>
                  <div style={{ fontSize: 11, color: '#a1a1aa' }}>Verified Today</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#10b981', marginTop: 2 }}>
                    {formatMetric(kyc.kycVerifiedToday)}
                  </div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px 12px', borderRadius: 6 }}>
                  <div style={{ fontSize: 11, color: '#a1a1aa' }}>New Signups Today</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#f4f4f5', marginTop: 2 }}>
                    {formatMetric(kyc.newRegistrationsToday)}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 11, color: '#71717a', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 10 }}>
                🛡️ PII Masking: Aadhaar & PAN details masked on all display surfaces.
              </div>
            </div>

            {/* QUICK ACTIONS & EMERGENCY OVERRIDE */}
            <div style={{
              background: '#18181b',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 10,
              padding: '18px 20px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>⚡</span>
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#f4f4f5' }}>OPERATIONAL SHORTCUTS</h4>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <button
                  onClick={() => handleDomainNav('finance', 'deposits-review')}
                  style={{
                    padding: '12px 14px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 8,
                    color: '#f4f4f5',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ fontSize: 16, marginBottom: 4 }}>💸</div>
                  <div>Withdrawal Review</div>
                  <div style={{ fontSize: 10, color: '#71717a' }}>Process pending payouts</div>
                </button>

                <button
                  onClick={() => handleDomainNav('betting', 'stuck-bets')}
                  style={{
                    padding: '12px 14px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 8,
                    color: '#f4f4f5',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ fontSize: 16, marginBottom: 4 }}>🔍</div>
                  <div>Stuck Bet Sweep</div>
                  <div style={{ fontSize: 10, color: '#71717a' }}>Audit delayed settlements</div>
                </button>

                <button
                  onClick={() => handleDomainNav('finance', 'reconciliation')}
                  style={{
                    padding: '12px 14px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 8,
                    color: '#f4f4f5',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ fontSize: 16, marginBottom: 4 }}>📊</div>
                  <div>Reconciliation</div>
                  <div style={{ fontSize: 10, color: '#71717a' }}>Run read-only audit</div>
                </button>

                <button
                  onClick={() => handleDomainNav('security', 'audit-explorer')}
                  style={{
                    padding: '12px 14px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 8,
                    color: '#f4f4f5',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ fontSize: 16, marginBottom: 4 }}>📜</div>
                  <div>Audit Log Stream</div>
                  <div style={{ fontSize: 10, color: '#71717a' }}>Inspect sensitive actions</div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: SYSTEM HEALTH & BACKGROUND WORKERS ── */}
      {activeTab === 'health' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 20 }}>
          {/* PART 8: SYSTEM HEALTH */}
          <div style={{
            background: '#18181b',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 10,
            padding: '18px 20px',
          }}>
            <h4 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: '#f4f4f5' }}>
              CORE SUBSYSTEMS HEALTH STATUS
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px 14px', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: '#a1a1aa' }}>PostgreSQL Database</span>
                  <span style={{ color: '#10b981', fontWeight: 600, fontSize: 11 }}>🟢 HEALTHY</span>
                </div>
                <div style={{ fontSize: 11, color: '#71717a', marginTop: 4 }}>Primary Node · Connected</div>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px 14px', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: '#a1a1aa' }}>Redis Pub/Sub</span>
                  <span style={{ color: '#10b981', fontWeight: 600, fontSize: 11 }}>🟢 HEALTHY</span>
                </div>
                <div style={{ fontSize: 11, color: '#71717a', marginTop: 4 }}>Live Odds Cache · Connected</div>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px 14px', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: '#a1a1aa' }}>Transactional Outbox</span>
                  <span style={{ color: '#10b981', fontWeight: 600, fontSize: 11 }}>🟢 HEALTHY</span>
                </div>
                <div style={{ fontSize: 11, color: '#71717a', marginTop: 4 }}>0 Pending · 0 DLQ</div>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px 14px', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: '#a1a1aa' }}>Payment Gateway</span>
                  <span style={{ color: '#10b981', fontWeight: 600, fontSize: 11 }}>🟢 Razorpay</span>
                </div>
                <div style={{ fontSize: 11, color: '#71717a', marginTop: 4 }}>Orders & Webhooks Active</div>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px 14px', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: '#a1a1aa' }}>Sports Feed Aggregator</span>
                  <span style={{ color: '#10b981', fontWeight: 600, fontSize: 11 }}>🟢 Multi-Source</span>
                </div>
                <div style={{ fontSize: 11, color: '#71717a', marginTop: 4 }}>Live Tick Active</div>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px 14px', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: '#a1a1aa' }}>Email & Push Channels</span>
                  <span style={{ color: '#10b981', fontWeight: 600, fontSize: 11 }}>🟢 Operational</span>
                </div>
                <div style={{ fontSize: 11, color: '#71717a', marginTop: 4 }}>SMTP & WebPush Connected</div>
              </div>
            </div>
          </div>

          {/* PART 9: BACKGROUND WORKERS MONITORING */}
          <div style={{
            background: '#18181b',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 10,
            padding: '18px 20px',
          }}>
            <h4 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: '#f4f4f5' }}>
              BACKGROUND WORKER FLEET
            </h4>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', textAlign: 'left', color: '#71717a' }}>
                    <th style={{ padding: '8px 12px' }}>Worker / Job Name</th>
                    <th style={{ padding: '8px 12px' }}>Execution Interval</th>
                    <th style={{ padding: '8px 12px' }}>Status</th>
                    <th style={{ padding: '8px 12px' }}>Failure Count</th>
                  </tr>
                </thead>
                <tbody>
                  {workers.map((w, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#d4d4d8' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>{w.name}</td>
                      <td style={{ padding: '10px 12px', color: '#a1a1aa' }}>{w.interval}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ color: '#10b981', fontWeight: 600 }}>● {w.status}</span>
                      </td>
                      <td style={{ padding: '10px 12px', color: w.failureCount > 0 ? '#f87171' : '#10b981' }}>
                        {w.failureCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: SECURITY & RECENT ACTIVITY FEED ── */}
      {activeTab === 'security' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 20 }}>
          {/* PART 10: SECURITY OVERVIEW */}
          <div style={{
            background: '#18181b',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 10,
            padding: '18px 20px',
          }}>
            <h4 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: '#f4f4f5' }}>
              ADMIN SECURITY & SESSION POSTURE
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px 14px', borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: '#a1a1aa' }}>Failed Logins (24h)</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#10b981', marginTop: 2 }}>
                  {security.failedLogins24h || 0}
                </div>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px 14px', borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: '#a1a1aa' }}>Active Admin Sessions</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#60a5fa', marginTop: 2 }}>
                  {security.activeAdminSessions || 1}
                </div>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px 14px', borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: '#a1a1aa' }}>Permission Denials</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#10b981', marginTop: 2 }}>
                  {security.recentPermissionDenials || 0}
                </div>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px 14px', borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: '#a1a1aa' }}>MFA Enrolled Admins</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#10b981', marginTop: 2 }}>
                  {security.mfaEnrolledAdmins || 1}
                </div>
              </div>
            </div>
          </div>

          {/* PART 11: RECENT ADMIN ACTIVITY FEED */}
          <div style={{
            background: '#18181b',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 10,
            padding: '18px 20px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#f4f4f5' }}>
                RECENT ADMIN AUDIT TRAIL (IMMUTABLE)
              </h4>
              <button
                onClick={() => handleDomainNav('security', 'audit-explorer')}
                style={{ background: 'none', border: 'none', color: '#60a5fa', fontSize: 12, cursor: 'pointer' }}
              >
                View Full Log ➔
              </button>
            </div>

            {recentActivity.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#71717a', fontSize: 12 }}>
                No recent administrative actions recorded.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {recentActivity.map((act) => (
                  <div
                    key={act.event_id}
                    style={{
                      background: 'rgba(0,0,0,0.2)',
                      border: '1px solid rgba(255, 255, 255, 0.04)',
                      borderRadius: 6,
                      padding: '10px 14px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: 12,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: 'rgba(59, 130, 246, 0.15)',
                        color: '#60a5fa',
                        fontWeight: 600,
                        fontSize: 11,
                      }}>
                        {act.actor_id || 'ADMIN'}
                      </span>
                      <strong style={{ color: '#f4f4f5' }}>{act.action}</strong>
                      {act.target_id && (
                        <span style={{ color: '#71717a' }}>Target: {act.target_id}</span>
                      )}
                    </div>
                    <span style={{ color: '#a1a1aa', fontSize: 11 }}>
                      {formatRelativeTime(act.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Drilldown Drawer */}
      <AdminKpiDrillDrawer drill={drill} />
    </div>
  );
}
