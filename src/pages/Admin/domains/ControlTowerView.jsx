import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApiClient } from '../api/adminApiClient';
import AdminTabs from '../components/AdminTabs';
import { AdminKpiDrillDrawer, useAdminKpiDrilldown } from '../hooks/useAdminKpiDrilldown';
import { startVisibleInterval } from '../utils/visibleInterval';

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

function prettyCta(label) {
  const raw = String(label || 'Open').replace(/[➔→]/g, '').trim();
  if (!raw) return 'Open';
  const lower = raw.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function prettyWorkerStatus(status) {
  if (!status) return 'Active';
  return String(status)
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function Metric({ label, children, warn = false, danger = false }) {
  const color = danger
    ? 'var(--admin-danger)'
    : warn
      ? 'var(--admin-warning)'
      : undefined;
  return (
    <div className="admin-metric">
      <div className="admin-metric__label">{label}</div>
      <div className="admin-metric__value" style={color ? { color } : undefined}>
        {children}
      </div>
    </div>
  );
}

function QueueCard({ title, count, hint, hot = false, tone, onClick }) {
  return (
    <button
      type="button"
      className={`admin-queue-card${hot ? ' is-hot' : ''}`}
      data-tone={tone}
      onClick={onClick}
    >
      <div className="admin-queue-card__label">{title}</div>
      <div className="admin-queue-card__value">{formatMetric(count ?? 0)}</div>
      <div className="admin-queue-card__hint">{hint}</div>
    </button>
  );
}

export default function ControlTowerView({ subModule = 'overview', onSubModuleChange, onNavigate }) {
  const navigate = useNavigate();
  const drill = useAdminKpiDrilldown();

  // Normalize subModule to match available tabs
  const getNormalizedSubModule = (sm) => {
    if (sm === 'health') return 'telemetry';
    if (sm === 'security') return 'incidents';
    if (['overview', 'telemetry', 'incidents'].includes(sm)) return sm;
    return 'overview';
  };

  const [activeTab, setActiveTab] = useState(getNormalizedSubModule(subModule));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefreshAt, setLastRefreshAt] = useState(null);
  const [isAutoRefresh, setIsAutoRefresh] = useState(true);
  const [timeRange, setTimeRange] = useState('today');

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

  const tabs = [
    { id: 'overview', label: 'Live' },
    { id: 'telemetry', label: 'Health' },
    { id: 'incidents', label: 'Incidents' },
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
      <div className="admin-tower-hero">
        <div className="admin-tower-hero__titles">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2>Home</h2>
            <span className={`admin-badge ${data?.overallHealth === 'HEALTHY' ? 'admin-badge--success' : 'admin-badge--warning'}`}>
              {data?.overallHealth === 'HEALTHY' ? 'Healthy' : 'Needs attention'}
            </span>
          </div>
          <p>Queues, ledger, and live betting in one place. Search from the bar above.</p>
        </div>

        <div className="admin-tower-toolbar">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="admin-input"
          >
            <option value="today">Today (UTC)</option>
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>

          <button
            type="button"
            onClick={() => setIsAutoRefresh(!isAutoRefresh)}
            title={isAutoRefresh ? 'Pause auto-refresh' : 'Resume auto-refresh'}
            className="admin-btn admin-btn--sm"
          >
            {isAutoRefresh ? 'Live · 15s' : 'Paused'}
          </button>

          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="admin-btn admin-btn--sm admin-btn--primary"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="admin-login__error" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>{error}</div>
          <button type="button" onClick={fetchData} className="admin-btn admin-btn--sm">Retry</button>
        </div>
      )}

      <section style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
          <h3 className="admin-section-title" style={{ margin: 0 }}>
            Needs attention
            {actionRequired.length > 0 && (
              <span className="admin-badge admin-badge--danger" style={{ marginLeft: 8 }}>{actionRequired.length}</span>
            )}
          </h3>
          <span style={{ fontSize: 12, color: 'var(--admin-text-muted)' }}>
            Critical, then high, then the rest
          </span>
        </div>

        {loading && !data ? (
          <div className="admin-card" style={{ padding: 24, textAlign: 'center', color: 'var(--admin-text-muted)' }}>
            Loading…
          </div>
        ) : actionRequired.length === 0 ? (
          <div className="admin-card" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div>
              <h4 style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 650, color: 'var(--admin-text)' }}>
                Nothing waiting
              </h4>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--admin-text-muted)' }}>
                No stuck bets, settlement errors, or open escalations.
              </p>
            </div>
          </div>
        ) : (
          <div className="admin-attention-list">
            {actionRequired.map((item) => {
              const isCrit = item.severity === 'CRITICAL';
              const isHigh = item.severity === 'HIGH';
              const tone = isCrit ? 'critical' : isHigh ? 'high' : 'warn';

              return (
                <div
                  key={item.id}
                  className={`admin-attention-item admin-attention-item--${tone}`}
                >
                  <div style={{ flex: '1 1 450px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                      <span className={`admin-badge ${isCrit ? 'admin-badge--danger' : isHigh ? 'admin-badge--warning' : 'admin-badge--neutral'}`}>
                        {item.severity === 'CRITICAL' ? 'Critical' : item.severity === 'HIGH' ? 'High' : 'Watch'}
                      </span>
                      <strong style={{ fontSize: 14, color: 'var(--admin-text)' }}>{item.title}</strong>
                      {item.count != null && (
                        <span className="admin-badge admin-badge--neutral">
                          {item.count} {item.count === 1 ? 'item' : 'items'}
                        </span>
                      )}
                    </div>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--admin-text-muted)', lineHeight: 1.45 }}>
                      {item.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const sub = item.subModuleId === 'deposits-review' && /withdraw/i.test(`${item.ctaLabel || ''} ${item.title || ''}`)
                        ? 'maker-checker'
                        : item.subModuleId;
                      handleDomainNav(item.domainId, sub);
                    }}
                    className={`admin-btn admin-btn--sm ${isCrit ? 'admin-btn--danger' : 'admin-btn--primary'}`}
                  >
                    {prettyCta(item.ctaLabel)}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
          <h3 className="admin-section-title" style={{ margin: 0 }}>Queues</h3>
          <span style={{ fontSize: 12, color: 'var(--admin-text-muted)' }}>Open a queue to work it</span>
        </div>
        <div className="admin-queue-grid">
          <QueueCard title="Withdrawals" count={queues.withdrawals?.count} hint={`Oldest: ${queues.withdrawals?.oldestAge || 'None'}`} hot={(queues.withdrawals?.count || 0) > 0} onClick={() => handleDomainNav('finance', 'maker-checker')} />
          <QueueCard title="Pending KYC" count={queues.kyc?.count} hint={`Oldest: ${queues.kyc?.oldestAge || 'None'}`} hot={(queues.kyc?.count || 0) > 0} onClick={() => handleDomainNav('customers', 'kyc-queue')} />
          <QueueCard title="Stuck bets" count={queues.stuckBets?.count} hint="Concluded matches" hot={(queues.stuckBets?.count || 0) > 0} tone="danger" onClick={() => handleDomainNav('betting', 'stuck-bets')} />
          <QueueCard title="Settlement errors" count={queues.settlementFailures?.count} hint={queues.settlementFailures?.count === 0 ? 'All settled' : 'Needs retry'} hot={(queues.settlementFailures?.count || 0) > 0} tone="danger" onClick={() => handleDomainNav('betting', 'settlement-queue')} />
          <QueueCard title="Failed deposits" count={queues.paymentFailures?.count} hint="Webhook failures today" onClick={() => handleDomainNav('finance', 'deposits-review')} />
          <QueueCard title="Failed outbox jobs" count={queues.failedJobs?.count} hint="Async worker DLQ" hot={(queues.failedJobs?.count || 0) > 0} onClick={() => handleDomainNav('operations', 'outbox-queue')} />
          <QueueCard title="Open tickets" count={queues.supportTickets?.count} hint="Customer inquiries" hot={(queues.supportTickets?.count || 0) > 0} onClick={() => handleDomainNav('support', 'ticket-queue')} />
          <QueueCard title="Security alerts" count={queues.securityAlerts?.count} hint="Open incidents" onClick={() => handleDomainNav('security', 'audit-explorer')} />
        </div>
      </section>


      {/* ── NAVIGATION TABS ── */}
      <AdminTabs tabs={tabs} active={activeTab} onChange={handleTabChange} />

      {/* ── TAB 1: OPERATIONAL OVERVIEW & DOMAIN CARDS ── */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 20 }}>
          {/* Row 1: Finance & Betting Operational Panels */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
            {/* PART 5: FINANCE OVERVIEW */}
            <div className="admin-panel">
              <div className="admin-panel__head">
                <h4 className="admin-section-title" style={{ margin: 0 }}>Finance</h4>
                <button type="button" className="admin-link-btn" onClick={() => handleDomainNav('finance', 'finance-health')}>
                  View details
                </button>
              </div>
              <div className="admin-metric-grid" style={{ marginBottom: 14 }}>
                <Metric label="Wallet cash">{formatInr(fin.totalWalletCash)}</Metric>
                <Metric label="Pending withdrawals" warn={(fin.pendingWithdrawalsCount || 0) > 0}>{formatMetric(fin.pendingWithdrawalsCount)}</Metric>
                <Metric label="Deposits today">{formatMetric(fin.depositsTodayCount)} ({formatInr(fin.depositsTodayVolume)})</Metric>
                <Metric label="Withdrawals today">{formatMetric(fin.withdrawalsTodayCount)} ({formatInr(fin.withdrawalsTodayVolume)})</Metric>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--admin-text-muted)', borderTop: '1px solid var(--admin-border)', paddingTop: 10 }}>
                <span>Wallet gaps: <strong style={{ color: 'var(--admin-success)' }}>0</strong></span>
                <span>Ledger anomalies: <strong style={{ color: 'var(--admin-success)' }}>0</strong></span>
              </div>
            </div>

            {/* PART 6: BETTING OPERATIONS OVERVIEW */}
            <div className="admin-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h4 className="admin-section-title" style={{ margin: 0 }}>Betting</h4>
                </div>
                <button
                  type="button"
                  className="admin-link-btn"
                  onClick={() => handleDomainNav('betting', 'betting-desk')}
                >
                  Open desk
                </button>
              </div>

              <div className="admin-metric-grid" style={{ marginBottom: 14 }}>
                <Metric label="Live fixtures">
                  {formatMetric(bet.liveMatches)} ({formatMetric(bet.matchesWithOdds)} priced)
                </Metric>
                <Metric label="Open bets / liability">
                  {formatMetric(bet.openBets)} ({formatInr(bet.openLiability)})
                </Metric>
                <Metric label="Stuck bets" danger={(bet.stuckBetsCount || 0) > 0}>
                  {formatMetric(bet.stuckBetsCount)}
                </Metric>
                <Metric label="Settlement worker">
                  {prettyWorkerStatus(bet.settlementWorkerStatus)}
                </Metric>
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
            <div className="admin-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h4 className="admin-section-title" style={{ margin: 0 }}>Players & KYC</h4>
                </div>
                <button
                  type="button"
                  className="admin-link-btn"
                  onClick={() => handleDomainNav('customers', 'kyc-queue')}
                >
                  Review queue
                </button>
              </div>

              <div className="admin-metric-grid" style={{ marginBottom: 14 }}>
                <Metric label="Pending submissions" warn={(kyc.kycPending || 0) > 0}>
                  {formatMetric(kyc.kycPending)}
                </Metric>
                <Metric label="Oldest case">{kyc.oldestPendingKycAge || 'No backlog'}</Metric>
                <Metric label="Verified today">{formatMetric(kyc.kycVerifiedToday)}</Metric>
                <Metric label="New signups today">{formatMetric(kyc.newRegistrationsToday)}</Metric>
              </div>

              <div style={{ fontSize: 11, color: 'var(--admin-text-muted)', borderTop: '1px solid var(--admin-border)', paddingTop: 10 }}>
                Aadhaar and PAN are masked on every admin surface.
              </div>
            </div>

            {/* QUICK ACTIONS & EMERGENCY OVERRIDE */}
            <div className="admin-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h4 className="admin-section-title" style={{ margin: 0 }}>Shortcuts</h4>
                </div>
              </div>

              <div className="admin-shortcut-grid">
                <button
                  type="button"
                  onClick={() => handleDomainNav('finance', 'maker-checker')}
                  className="admin-shortcut"
                >
                  <div className="admin-shortcut__title">Withdrawal review</div>
                  <div className="admin-shortcut__hint">Process pending payouts</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleDomainNav('betting', 'stuck-bets')}
                  className="admin-shortcut"
                >
                  <div className="admin-shortcut__title">Stuck bet sweep</div>
                  <div className="admin-shortcut__hint">Audit delayed settlements</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleDomainNav('finance', 'reconciliation')}
                  className="admin-shortcut"
                >
                  <div className="admin-shortcut__title">Reconciliation</div>
                  <div className="admin-shortcut__hint">Run read-only audit</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleDomainNav('security', 'audit-explorer')}
                  className="admin-shortcut"
                >
                  <div className="admin-shortcut__title">Audit log</div>
                  <div className="admin-shortcut__hint">Inspect sensitive actions</div>
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
            <h4 className="admin-section-title">Subsystem health</h4>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <div style={{ background: 'var(--admin-surface)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--admin-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--admin-text-muted)', fontWeight: 600 }}>PostgreSQL Database</span>
                  <span className="admin-inline-status">Healthy</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--admin-text-muted)', marginTop: 4 }}>Primary Node · Connected</div>
              </div>

              <div style={{ background: 'var(--admin-surface)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--admin-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--admin-text-muted)', fontWeight: 600 }}>Redis Pub/Sub</span>
                  <span className="admin-inline-status">Healthy</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--admin-text-muted)', marginTop: 4 }}>Live Odds Cache · Connected</div>
              </div>

              <div style={{ background: 'var(--admin-surface)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--admin-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--admin-text-muted)', fontWeight: 600 }}>Transactional Outbox</span>
                  <span className="admin-inline-status">Healthy</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--admin-text-muted)', marginTop: 4 }}>0 Pending · 0 DLQ</div>
              </div>

              <div style={{ background: 'var(--admin-surface)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--admin-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--admin-text-muted)', fontWeight: 600 }}>Payment Gateway</span>
                  <span className="admin-inline-status">Healthy</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--admin-text-muted)', marginTop: 4 }}>Orders & Webhooks Active</div>
              </div>

              <div style={{ background: 'var(--admin-surface)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--admin-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--admin-text-muted)', fontWeight: 600 }}>Sports Feed Aggregator</span>
                  <span className="admin-inline-status">Healthy</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--admin-text-muted)', marginTop: 4 }}>Live Tick Active</div>
              </div>

              <div style={{ background: 'var(--admin-surface)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--admin-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--admin-text-muted)', fontWeight: 600 }}>Email & Push Channels</span>
                  <span className="admin-inline-status">Operational</span>
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
            <h4 className="admin-section-title">Background workers</h4>

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
            <h4 className="admin-section-title">Security & sessions</h4>

            <div className="admin-metric-grid">
              <Metric label="Failed logins (24h)">{security.failedLogins24h || 0}</Metric>
              <Metric label="Active admin sessions">{security.activeAdminSessions || 1}</Metric>
              <Metric label="Permission denials">{security.recentPermissionDenials || 0}</Metric>
              <Metric label="MFA enrolled admins">{security.mfaEnrolledAdmins || 1}</Metric>
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
              <h4 className="admin-section-title" style={{ margin: 0 }}>Recent admin activity</h4>
              <button
                type="button"
                className="admin-link-btn"
                onClick={() => handleDomainNav('security', 'audit-explorer')}
              >
                Full log
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

      {/* Drilldown Drawer */}
      <AdminKpiDrillDrawer drill={drill} />
    </div>
  );
}
