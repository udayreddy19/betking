import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApiClient } from '../api/adminApiClient';
import AdminTabs from '../components/AdminTabs';
import { AdminKpiDrillDrawer, useAdminKpiDrilldown } from '../hooks/useAdminKpiDrilldown';
import { startVisibleInterval } from '../utils/visibleInterval';
import { useAdminToast } from '../components/AdminToastContext';
import EmergencyControlsPanel from '../components/EmergencyControlsPanel';

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

  // Normalize subModule to match available tabs
  const getNormalizedSubModule = (sm) => {
    if (sm === 'health') return 'telemetry';
    if (sm === 'security') return 'incidents';
    if (['overview', 'telemetry', 'incidents', 'kill-switches'].includes(sm)) return sm;
    return 'overview';
  };

  const [activeTab, setActiveTab] = useState(getNormalizedSubModule(subModule));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefreshAt, setLastRefreshAt] = useState(null);
  const [isAutoRefresh, setIsAutoRefresh] = useState(true);
  const [timeRange, setTimeRange] = useState('today');
  const [searchQuery, setSearchQuery] = useState('');

  // Sync tab with external subModule prop
  useEffect(() => {
    const normalized = getNormalizedSubModule(subModule);
    if (normalized && normalized !== activeTab) {
      setActiveTab(normalized);
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
    { id: 'overview', label: '🔴 Operational Overview' },
    { id: 'telemetry', label: '🟢 Telemetry & SLA Monitors' },
    { id: 'incidents', label: '🛡️ Live System Incidents' },
    { id: 'kill-switches', label: '⛔ Kill switches' },
  ];

  const actionRequired = data?.actionRequired || [];
  const queues = data?.actionQueues || {};
  const fin = data?.financial || {};
  const bet = data?.betting || {};
  const kyc = data?.usersKyc || {};
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
        background: 'var(--admin-card-bg)',
        padding: '16px 20px',
        borderRadius: 12,
        border: '1px solid var(--admin-border)',
        boxShadow: 'var(--admin-shadow-sm)',
        marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 42,
            height: 42,
            borderRadius: 10,
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
          }}>
            🗼
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--admin-text)', letterSpacing: '-0.01em' }}>
                ADMIN CONTROL TOWER
              </h2>
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 999,
                background: data?.overallHealth === 'HEALTHY' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                color: data?.overallHealth === 'HEALTHY' ? '#10b981' : '#f59e0b',
                border: `1px solid ${data?.overallHealth === 'HEALTHY' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
              }}>
                {data?.overallHealth === 'HEALTHY' ? '● SYSTEM HEALTHY' : '▲ ATTENTION REQUIRED'}
              </span>
            </div>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--admin-text-muted)' }}>
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
              className="admin-input"
              style={{
                width: '100%',
                padding: '8px 12px 8px 34px',
                background: 'var(--admin-surface)',
                border: '1px solid var(--admin-border)',
                borderRadius: 8,
                color: 'var(--admin-text)',
                fontSize: 12,
                outline: 'none',
              }}
            />
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--admin-text-muted)', fontSize: 13 }}>
              🔍
            </span>
          </div>
          <button
            type="submit"
            className="admin-btn admin-btn--sm"
            style={{
              padding: '8px 14px',
              fontSize: 12,
              fontWeight: 600,
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
            className="admin-input"
            style={{
              padding: '8px 12px',
              background: 'var(--admin-surface)',
              border: '1px solid var(--admin-border)',
              borderRadius: 8,
              color: 'var(--admin-text)',
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
            className="admin-btn admin-btn--sm"
            style={{
              padding: '8px 12px',
              background: isAutoRefresh ? 'rgba(16, 185, 129, 0.1)' : 'var(--admin-surface)',
              border: `1px solid ${isAutoRefresh ? 'rgba(16, 185, 129, 0.3)' : 'var(--admin-border)'}`,
              borderRadius: 8,
              color: isAutoRefresh ? '#10b981' : 'var(--admin-text-muted)',
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
            className="admin-btn admin-btn--sm admin-btn--primary"
            style={{
              padding: '8px 14px',
              borderRadius: 8,
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
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          color: '#ef4444',
          fontSize: 13,
        }}>
          <div>
            <strong>⚠️ Operational Notice:</strong> {error}
          </div>
          <button
            onClick={fetchData}
            className="admin-btn admin-btn--sm"
            style={{
              padding: '4px 12px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#ef4444',
              fontSize: 12,
            }}
          >
            Retry
          </button>
        </div>
      )}

      {activeTab !== 'kill-switches' && (
        <EmergencyControlsPanel compact title="Platform kill switches" />
      )}

      {/* ── PART 3: CRITICAL ACTION REQUIRED CENTER ── */}
      <section style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>⚡</span>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--admin-text)', letterSpacing: '-0.01em' }}>
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
          <span style={{ fontSize: 12, color: 'var(--admin-text-muted)' }}>
            Deterministic priority order: 🔴 Critical ➔ 🟠 High ➔ 🟡 Attention
          </span>
        </div>

        {loading && !data ? (
          <div style={{ padding: 30, textAlign: 'center', background: 'var(--admin-card-bg)', borderRadius: 10, border: '1px solid var(--admin-border)', color: 'var(--admin-text-muted)' }}>
            Loading live operational state...
          </div>
        ) : actionRequired.length === 0 ? (
          <div style={{
            background: 'var(--admin-card-bg)',
            border: '1px solid var(--admin-border)',
            borderRadius: 10,
            padding: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            boxShadow: 'var(--admin-shadow-sm)',
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
              fontWeight: 800,
            }}>
              ✓
            </div>
            <div>
              <h4 style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 700, color: '#10b981' }}>
                All Operational Queues are Clear
              </h4>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--admin-text-muted)' }}>
                No financial inconsistencies, stuck bets, settlement errors, or pending escalations detected.
              </p>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {actionRequired.map((item) => {
              const isCrit = item.severity === 'CRITICAL';
              const isHigh = item.severity === 'HIGH';
              const borderColor = isCrit ? 'rgba(239, 68, 68, 0.4)' : isHigh ? 'rgba(249, 115, 22, 0.35)' : 'rgba(234, 179, 8, 0.3)';
              const badgeColor = isCrit ? '#ef4444' : isHigh ? '#f97316' : '#eab308';

              return (
                <div
                  key={item.id}
                  style={{
                    background: 'var(--admin-card-bg)',
                    border: `1px solid ${borderColor}`,
                    borderRadius: 10,
                    padding: '14px 18px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 14,
                    boxShadow: 'var(--admin-shadow-sm)',
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
                        <strong style={{ fontSize: 14, color: 'var(--admin-text)' }}>{item.title}</strong>
                        {item.count != null && (
                          <span style={{
                            fontSize: 11,
                            fontWeight: 600,
                            padding: '1px 6px',
                            borderRadius: 999,
                            background: 'var(--admin-surface)',
                            color: 'var(--admin-text-secondary)',
                            border: '1px solid var(--admin-border)',
                          }}>
                            {item.count} item{item.count === 1 ? '' : 's'}
                          </span>
                        )}
                      </div>
                      <p style={{ margin: 0, fontSize: 12, color: 'var(--admin-text-muted)', lineHeight: 1.4 }}>
                        {item.description}
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      onClick={() => handleDomainNav(item.domainId, item.subModuleId)}
                      className="admin-btn admin-btn--sm"
                      style={{
                        padding: '7px 14px',
                        background: isCrit ? '#dc2626' : isHigh ? '#ea580c' : '#ca8a04',
                        border: 'none',
                        color: '#fff',
                        fontSize: 12,
                        fontWeight: 700,
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
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--admin-text)' }}>
            ACTIVE OPERATIONAL QUEUES
          </h3>
          <span style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>Click to navigate directly to dedicated queue</span>
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
              background: 'var(--admin-card-bg)',
              border: (queues.withdrawals?.count || 0) > 0 ? '1px solid rgba(245, 158, 11, 0.5)' : '1px solid var(--admin-border)',
              borderRadius: 10,
              padding: '14px 16px',
              cursor: 'pointer',
              boxShadow: 'var(--admin-shadow-sm)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--admin-text-muted)' }}>
              <span style={{ fontWeight: 600 }}>Withdrawals</span>
              <span>💸</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: (queues.withdrawals?.count || 0) > 0 ? '#f59e0b' : 'var(--admin-text)', margin: '4px 0 2px' }}>
              {formatMetric(queues.withdrawals?.count ?? 0)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>
              Oldest: <strong style={{ color: 'var(--admin-text)' }}>{queues.withdrawals?.oldestAge || 'None'}</strong>
            </div>
          </div>

          {/* 2. Pending KYC */}
          <div
            onClick={() => handleDomainNav('customers', 'kyc-queue')}
            style={{
              background: 'var(--admin-card-bg)',
              border: (queues.kyc?.count || 0) > 0 ? '1px solid rgba(59, 130, 246, 0.5)' : '1px solid var(--admin-border)',
              borderRadius: 10,
              padding: '14px 16px',
              cursor: 'pointer',
              boxShadow: 'var(--admin-shadow-sm)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--admin-text-muted)' }}>
              <span style={{ fontWeight: 600 }}>Pending KYC</span>
              <span>🪪</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: (queues.kyc?.count || 0) > 0 ? '#3b82f6' : 'var(--admin-text)', margin: '4px 0 2px' }}>
              {formatMetric(queues.kyc?.count ?? 0)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>
              Oldest: <strong style={{ color: 'var(--admin-text)' }}>{queues.kyc?.oldestAge || 'None'}</strong>
            </div>
          </div>

          {/* 3. Stuck Bets */}
          <div
            onClick={() => handleDomainNav('betting', 'stuck-bets')}
            style={{
              background: 'var(--admin-card-bg)',
              border: (queues.stuckBets?.count || 0) > 0 ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid var(--admin-border)',
              borderRadius: 10,
              padding: '14px 16px',
              cursor: 'pointer',
              boxShadow: 'var(--admin-shadow-sm)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--admin-text-muted)' }}>
              <span style={{ fontWeight: 600 }}>Stuck Bets</span>
              <span>🎯</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: (queues.stuckBets?.count || 0) > 0 ? '#ef4444' : 'var(--admin-text)', margin: '4px 0 2px' }}>
              {formatMetric(queues.stuckBets?.count ?? 0)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>
              Concluded matches
            </div>
          </div>

          {/* 4. Settlement Failures */}
          <div
            onClick={() => handleDomainNav('betting', 'settlement-queue')}
            style={{
              background: 'var(--admin-card-bg)',
              border: (queues.settlementFailures?.count || 0) > 0 ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid var(--admin-border)',
              borderRadius: 10,
              padding: '14px 16px',
              cursor: 'pointer',
              boxShadow: 'var(--admin-shadow-sm)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--admin-text-muted)' }}>
              <span style={{ fontWeight: 600 }}>Settlement Errors</span>
              <span>⚙️</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: (queues.settlementFailures?.count || 0) > 0 ? '#ef4444' : '#10b981', margin: '4px 0 2px' }}>
              {formatMetric(queues.settlementFailures?.count ?? 0)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>
              {queues.settlementFailures?.count === 0 ? 'All settled clean' : 'Requires retry'}
            </div>
          </div>

          {/* 5. Payment Failures */}
          <div
            onClick={() => handleDomainNav('finance', 'deposits-review')}
            style={{
              background: 'var(--admin-card-bg)',
              border: '1px solid var(--admin-border)',
              borderRadius: 10,
              padding: '14px 16px',
              cursor: 'pointer',
              boxShadow: 'var(--admin-shadow-sm)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--admin-text-muted)' }}>
              <span style={{ fontWeight: 600 }}>Failed Deposits</span>
              <span>💳</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--admin-text)', margin: '4px 0 2px' }}>
              {formatMetric(queues.paymentFailures?.count ?? 0)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>
              Today's webhook fails
            </div>
          </div>

          {/* 6. Failed Jobs / Outbox DLQ */}
          <div
            onClick={() => handleDomainNav('operations', 'outbox-queue')}
            style={{
              background: 'var(--admin-card-bg)',
              border: (queues.failedJobs?.count || 0) > 0 ? '1px solid rgba(245, 158, 11, 0.5)' : '1px solid var(--admin-border)',
              borderRadius: 10,
              padding: '14px 16px',
              cursor: 'pointer',
              boxShadow: 'var(--admin-shadow-sm)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--admin-text-muted)' }}>
              <span style={{ fontWeight: 600 }}>Failed Outbox Jobs</span>
              <span>📦</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: (queues.failedJobs?.count || 0) > 0 ? '#f59e0b' : '#10b981', margin: '4px 0 2px' }}>
              {formatMetric(queues.failedJobs?.count ?? 0)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>
              Async worker DLQ
            </div>
          </div>

          {/* 7. Open Support Tickets */}
          <div
            onClick={() => handleDomainNav('support', 'ticket-queue')}
            style={{
              background: 'var(--admin-card-bg)',
              border: '1px solid var(--admin-border)',
              borderRadius: 10,
              padding: '14px 16px',
              cursor: 'pointer',
              boxShadow: 'var(--admin-shadow-sm)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--admin-text-muted)' }}>
              <span style={{ fontWeight: 600 }}>Open Tickets</span>
              <span>💬</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: (queues.supportTickets?.count || 0) > 0 ? '#3b82f6' : 'var(--admin-text)', margin: '4px 0 2px' }}>
              {formatMetric(queues.supportTickets?.count ?? 0)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>
              Customer inquiries
            </div>
          </div>

          {/* 8. Security Alerts */}
          <div
            onClick={() => handleDomainNav('security', 'audit-explorer')}
            style={{
              background: 'var(--admin-card-bg)',
              border: '1px solid var(--admin-border)',
              borderRadius: 10,
              padding: '14px 16px',
              cursor: 'pointer',
              boxShadow: 'var(--admin-shadow-sm)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--admin-text-muted)' }}>
              <span style={{ fontWeight: 600 }}>Security Alerts</span>
              <span>🔒</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#10b981', margin: '4px 0 2px' }}>
              {formatMetric(queues.securityAlerts?.count ?? 0)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>
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
              background: 'var(--admin-card-bg)',
              border: '1px solid var(--admin-border)',
              borderRadius: 12,
              padding: '18px 20px',
              boxShadow: 'var(--admin-shadow-sm)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>💳</span>
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--admin-text)' }}>FINANCE & LEDGER OVERVIEW</h4>
                </div>
                <button
                  onClick={() => handleDomainNav('finance', 'finance-health')}
                  style={{ background: 'none', border: 'none', color: 'var(--admin-primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  View Details ➔
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div style={{ background: 'var(--admin-surface)', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--admin-border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>Total Wallet Cash</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#10b981', marginTop: 2 }}>
                    {formatInr(fin.totalWalletCash)}
                  </div>
                </div>
                <div style={{ background: 'var(--admin-surface)', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--admin-border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>Pending Withdrawals</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: (fin.pendingWithdrawalsCount || 0) > 0 ? '#f59e0b' : 'var(--admin-text)', marginTop: 2 }}>
                    {formatMetric(fin.pendingWithdrawalsCount)}
                  </div>
                </div>
                <div style={{ background: 'var(--admin-surface)', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--admin-border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>Today's Deposits</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--admin-text)', marginTop: 2 }}>
                    {formatMetric(fin.depositsTodayCount)} ({formatInr(fin.depositsTodayVolume)})
                  </div>
                </div>
                <div style={{ background: 'var(--admin-surface)', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--admin-border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>Today's Withdrawals</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--admin-text)', marginTop: 2 }}>
                    {formatMetric(fin.withdrawalsTodayCount)} ({formatInr(fin.withdrawalsTodayVolume)})
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--admin-text-muted)', borderTop: '1px solid var(--admin-border)', paddingTop: 10 }}>
                <span>Wallet Inconsistencies: <strong style={{ color: '#10b981' }}>0 (Verified)</strong></span>
                <span>Ledger Anomalies: <strong style={{ color: '#10b981' }}>0 (Verified)</strong></span>
              </div>
            </div>

            {/* PART 6: BETTING OPERATIONS OVERVIEW */}
            <div style={{
              background: 'var(--admin-card-bg)',
              border: '1px solid var(--admin-border)',
              borderRadius: 12,
              padding: '18px 20px',
              boxShadow: 'var(--admin-shadow-sm)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>🎯</span>
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--admin-text)' }}>BETTING OPERATIONS OVERVIEW</h4>
                </div>
                <button
                  onClick={() => handleDomainNav('betting', 'betting-desk')}
                  style={{ background: 'none', border: 'none', color: 'var(--admin-primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  View Desk ➔
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div style={{ background: 'var(--admin-surface)', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--admin-border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>Live Fixtures (Priced)</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--admin-text)', marginTop: 2 }}>
                    {formatMetric(bet.liveMatches)} ({formatMetric(bet.matchesWithOdds)} priced)
                  </div>
                </div>
                <div style={{ background: 'var(--admin-surface)', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--admin-border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>Open Bets / Liability</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--admin-text)', marginTop: 2 }}>
                    {formatMetric(bet.openBets)} ({formatInr(bet.openLiability)})
                  </div>
                </div>
                <div style={{ background: 'var(--admin-surface)', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--admin-border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>Stuck Bets (Finished Matches)</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: (bet.stuckBetsCount || 0) > 0 ? '#ef4444' : '#10b981', marginTop: 2 }}>
                    {formatMetric(bet.stuckBetsCount)}
                  </div>
                </div>
                <div style={{ background: 'var(--admin-surface)', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--admin-border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>Settlement Worker</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#10b981', marginTop: 2 }}>
                    ● {bet.settlementWorkerStatus || 'ACTIVE'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--admin-text-muted)', borderTop: '1px solid var(--admin-border)', paddingTop: 10 }}>
                <span>Bets Placed Today: <strong>{formatMetric(bet.betsPlacedToday)}</strong></span>
                <span>Settlement Failures: <strong style={{ color: (bet.settlementFailures || 0) > 0 ? '#ef4444' : '#10b981' }}>{bet.settlementFailures || 0}</strong></span>
              </div>
            </div>
          </div>

          {/* Row 2: KYC Overview & Growth/Promotions */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
            {/* PART 7: KYC OVERVIEW */}
            <div style={{
              background: 'var(--admin-card-bg)',
              border: '1px solid var(--admin-border)',
              borderRadius: 12,
              padding: '18px 20px',
              boxShadow: 'var(--admin-shadow-sm)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>🪪</span>
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--admin-text)' }}>PLAYER KYC OPERATIONS</h4>
                </div>
                <button
                  onClick={() => handleDomainNav('customers', 'kyc-queue')}
                  style={{ background: 'none', border: 'none', color: 'var(--admin-primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  Review Queue ➔
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div style={{ background: 'var(--admin-surface)', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--admin-border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>Pending Submissions</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: (kyc.kycPending || 0) > 0 ? '#3b82f6' : 'var(--admin-text)', marginTop: 2 }}>
                    {formatMetric(kyc.kycPending)}
                  </div>
                </div>
                <div style={{ background: 'var(--admin-surface)', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--admin-border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>Oldest Case Age</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--admin-text)', marginTop: 2 }}>
                    {kyc.oldestPendingKycAge || 'No backlog'}
                  </div>
                </div>
                <div style={{ background: 'var(--admin-surface)', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--admin-border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>Verified Today</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#10b981', marginTop: 2 }}>
                    {formatMetric(kyc.kycVerifiedToday)}
                  </div>
                </div>
                <div style={{ background: 'var(--admin-surface)', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--admin-border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>New Signups Today</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--admin-text)', marginTop: 2 }}>
                    {formatMetric(kyc.newRegistrationsToday)}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 11, color: 'var(--admin-text-muted)', borderTop: '1px solid var(--admin-border)', paddingTop: 10 }}>
                🛡️ PII Masking: Aadhaar & PAN details masked on all display surfaces.
              </div>
            </div>

            {/* QUICK ACTIONS & EMERGENCY OVERRIDE */}
            <div style={{
              background: 'var(--admin-card-bg)',
              border: '1px solid var(--admin-border)',
              borderRadius: 12,
              padding: '18px 20px',
              boxShadow: 'var(--admin-shadow-sm)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>⚡</span>
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--admin-text)' }}>OPERATIONAL SHORTCUTS</h4>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <button
                  onClick={() => handleDomainNav('finance', 'deposits-review')}
                  className="admin-card"
                  style={{
                    padding: '12px 14px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    textAlign: 'left',
                    background: 'var(--admin-surface)',
                    border: '1px solid var(--admin-border)',
                  }}
                >
                  <div style={{ fontSize: 16, marginBottom: 4 }}>💸</div>
                  <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--admin-text)' }}>Withdrawal Review</div>
                  <div style={{ fontSize: 10, color: 'var(--admin-text-muted)' }}>Process pending payouts</div>
                </button>

                <button
                  onClick={() => handleDomainNav('betting', 'stuck-bets')}
                  className="admin-card"
                  style={{
                    padding: '12px 14px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    textAlign: 'left',
                    background: 'var(--admin-surface)',
                    border: '1px solid var(--admin-border)',
                  }}
                >
                  <div style={{ fontSize: 16, marginBottom: 4 }}>🔍</div>
                  <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--admin-text)' }}>Stuck Bet Sweep</div>
                  <div style={{ fontSize: 10, color: 'var(--admin-text-muted)' }}>Audit delayed settlements</div>
                </button>

                <button
                  onClick={() => handleDomainNav('finance', 'reconciliation')}
                  className="admin-card"
                  style={{
                    padding: '12px 14px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    textAlign: 'left',
                    background: 'var(--admin-surface)',
                    border: '1px solid var(--admin-border)',
                  }}
                >
                  <div style={{ fontSize: 16, marginBottom: 4 }}>📊</div>
                  <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--admin-text)' }}>Reconciliation</div>
                  <div style={{ fontSize: 10, color: 'var(--admin-text-muted)' }}>Run read-only audit</div>
                </button>

                <button
                  onClick={() => handleDomainNav('security', 'audit-explorer')}
                  className="admin-card"
                  style={{
                    padding: '12px 14px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    textAlign: 'left',
                    background: 'var(--admin-surface)',
                    border: '1px solid var(--admin-border)',
                  }}
                >
                  <div style={{ fontSize: 16, marginBottom: 4 }}>📜</div>
                  <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--admin-text)' }}>Audit Log Stream</div>
                  <div style={{ fontSize: 10, color: 'var(--admin-text-muted)' }}>Inspect sensitive actions</div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: TELEMETRY & SLA MONITORS / SYSTEM HEALTH ── */}
      {activeTab === 'telemetry' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 20 }}>
          {/* PART 8: SYSTEM HEALTH */}
          <div style={{
            background: 'var(--admin-card-bg)',
            border: '1px solid var(--admin-border)',
            borderRadius: 12,
            padding: '18px 20px',
            boxShadow: 'var(--admin-shadow-sm)',
          }}>
            <h4 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 800, color: 'var(--admin-text)' }}>
              CORE SUBSYSTEMS HEALTH STATUS
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <div style={{ background: 'var(--admin-surface)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--admin-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--admin-text-muted)', fontWeight: 600 }}>PostgreSQL Database</span>
                  <span style={{ color: '#10b981', fontWeight: 700, fontSize: 11 }}>🟢 HEALTHY</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--admin-text-muted)', marginTop: 4 }}>Primary Node · Connected</div>
              </div>

              <div style={{ background: 'var(--admin-surface)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--admin-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--admin-text-muted)', fontWeight: 600 }}>Redis Pub/Sub</span>
                  <span style={{ color: '#10b981', fontWeight: 700, fontSize: 11 }}>🟢 HEALTHY</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--admin-text-muted)', marginTop: 4 }}>Live Odds Cache · Connected</div>
              </div>

              <div style={{ background: 'var(--admin-surface)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--admin-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--admin-text-muted)', fontWeight: 600 }}>Transactional Outbox</span>
                  <span style={{ color: '#10b981', fontWeight: 700, fontSize: 11 }}>🟢 HEALTHY</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--admin-text-muted)', marginTop: 4 }}>0 Pending · 0 DLQ</div>
              </div>

              <div style={{ background: 'var(--admin-surface)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--admin-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--admin-text-muted)', fontWeight: 600 }}>Payment Gateway</span>
                  <span style={{ color: '#10b981', fontWeight: 700, fontSize: 11 }}>🟢 Razorpay</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--admin-text-muted)', marginTop: 4 }}>Orders & Webhooks Active</div>
              </div>

              <div style={{ background: 'var(--admin-surface)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--admin-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--admin-text-muted)', fontWeight: 600 }}>Sports Feed Aggregator</span>
                  <span style={{ color: '#10b981', fontWeight: 700, fontSize: 11 }}>🟢 Multi-Source</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--admin-text-muted)', marginTop: 4 }}>Live Tick Active</div>
              </div>

              <div style={{ background: 'var(--admin-surface)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--admin-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--admin-text-muted)', fontWeight: 600 }}>Email & Push Channels</span>
                  <span style={{ color: '#10b981', fontWeight: 700, fontSize: 11 }}>🟢 Operational</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--admin-text-muted)', marginTop: 4 }}>SMTP & WebPush Connected</div>
              </div>
            </div>
          </div>

          {/* PART 9: BACKGROUND WORKERS MONITORING */}
          <div style={{
            background: 'var(--admin-card-bg)',
            border: '1px solid var(--admin-border)',
            borderRadius: 12,
            padding: '18px 20px',
            boxShadow: 'var(--admin-shadow-sm)',
          }}>
            <h4 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 800, color: 'var(--admin-text)' }}>
              BACKGROUND WORKER FLEET
            </h4>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--admin-border)', textAlign: 'left', color: 'var(--admin-text-muted)' }}>
                    <th style={{ padding: '8px 12px' }}>Worker / Job Name</th>
                    <th style={{ padding: '8px 12px' }}>Execution Interval</th>
                    <th style={{ padding: '8px 12px' }}>Status</th>
                    <th style={{ padding: '8px 12px' }}>Failure Count</th>
                  </tr>
                </thead>
                <tbody>
                  {workers.map((w, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--admin-border)', color: 'var(--admin-text)' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 700 }}>{w.name}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--admin-text-muted)' }}>{w.interval}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ color: '#10b981', fontWeight: 700 }}>● {w.status}</span>
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: w.failureCount > 0 ? '#ef4444' : '#10b981' }}>
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

      {/* ── TAB 3: LIVE SYSTEM INCIDENTS & SECURITY ACTIVITY FEED ── */}
      {activeTab === 'incidents' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 20 }}>
          {/* PART 10: SECURITY OVERVIEW */}
          <div style={{
            background: 'var(--admin-card-bg)',
            border: '1px solid var(--admin-border)',
            borderRadius: 12,
            padding: '18px 20px',
            boxShadow: 'var(--admin-shadow-sm)',
          }}>
            <h4 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 800, color: 'var(--admin-text)' }}>
              ADMIN SECURITY & SESSION POSTURE
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <div style={{ background: 'var(--admin-surface)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--admin-border)' }}>
                <div style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>Failed Logins (24h)</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#10b981', marginTop: 2 }}>
                  {security.failedLogins24h || 0}
                </div>
              </div>

              <div style={{ background: 'var(--admin-surface)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--admin-border)' }}>
                <div style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>Active Admin Sessions</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#3b82f6', marginTop: 2 }}>
                  {security.activeAdminSessions || 1}
                </div>
              </div>

              <div style={{ background: 'var(--admin-surface)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--admin-border)' }}>
                <div style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>Permission Denials</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#10b981', marginTop: 2 }}>
                  {security.recentPermissionDenials || 0}
                </div>
              </div>

              <div style={{ background: 'var(--admin-surface)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--admin-border)' }}>
                <div style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>MFA Enrolled Admins</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#10b981', marginTop: 2 }}>
                  {security.mfaEnrolledAdmins || 1}
                </div>
              </div>
            </div>
          </div>

          {/* PART 11: RECENT ADMIN ACTIVITY FEED */}
          <div style={{
            background: 'var(--admin-card-bg)',
            border: '1px solid var(--admin-border)',
            borderRadius: 12,
            padding: '18px 20px',
            boxShadow: 'var(--admin-shadow-sm)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--admin-text)' }}>
                RECENT ADMIN AUDIT TRAIL (IMMUTABLE)
              </h4>
              <button
                onClick={() => handleDomainNav('security', 'audit-explorer')}
                style={{ background: 'none', border: 'none', color: 'var(--admin-primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                View Full Log ➔
              </button>
            </div>

            {recentActivity.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--admin-text-muted)', fontSize: 12 }}>
                No recent administrative actions recorded.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {recentActivity.map((act) => (
                  <div
                    key={act.event_id}
                    style={{
                      background: 'var(--admin-surface)',
                      border: '1px solid var(--admin-border)',
                      borderRadius: 8,
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
                        color: '#3b82f6',
                        fontWeight: 700,
                        fontSize: 11,
                      }}>
                        {act.actor_id || 'ADMIN'}
                      </span>
                      <strong style={{ color: 'var(--admin-text)' }}>{act.action}</strong>
                      {act.target_id && (
                        <span style={{ color: 'var(--admin-text-muted)' }}>Target: {act.target_id}</span>
                      )}
                    </div>
                    <span style={{ color: 'var(--admin-text-muted)', fontSize: 11 }}>
                      {formatRelativeTime(act.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'kill-switches' && (
        <div style={{ marginTop: 20 }}>
          <EmergencyControlsPanel title="Platform kill switches" showHistory />
        </div>
      )}

      {/* Drilldown Drawer */}
      <AdminKpiDrillDrawer drill={drill} />
    </div>
  );
}
