import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import AdminKPI from '../components/AdminKPI';
import AdminTabs from '../components/AdminTabs';
import AdminCard from '../components/AdminCard';
import { StatusBadge } from '../components/AdminBadge';
import { startVisibleInterval } from '../utils/visibleInterval';

function formatMetric(value, prefix = '') {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return `${prefix}${Number(value).toLocaleString()}`;
}

export default function ControlTowerView({ subModule = 'overview', onSubModuleChange, onNavigate }) {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState({
    registeredUsers: null,
    activeUsers: null,
    openBets: null,
    liveMatches: 0,
    matchesWithOdds: 0,
    todayTurnover: null,
    ggr: null,
    pendingWithdrawals: null,
    riskAlerts: 0,
    openTickets: null,
    systemStatus: 'LOADING',
    note: '',
    providerSources: {},
    timestamp: null,
    turnoverScope: 'today',
    ggrNote: '',
  });
  const [error, setError] = useState(null);
  const [lastRefreshAt, setLastRefreshAt] = useState(null);
  const [observability, setObservability] = useState(null);

  const tabs = [
    { id: 'overview', label: 'Operational Overview' },
    { id: 'telemetry', label: 'Telemetry & SLA' },
    { id: 'incidents', label: 'Live System Incidents' },
  ];

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      adminApiClient.get('/control-tower/metrics')
        .then((data) => {
          if (cancelled) return;
          setMetrics((prev) => ({ ...prev, ...data }));
          setLastRefreshAt(Date.now());
          setError(null);
        })
        .catch((err) => {
          if (cancelled) return;
          setError(err.message || 'Failed to load control tower metrics');
          setMetrics((prev) => ({ ...prev, systemStatus: 'ERROR' }));
        });
    };
    const stop = startVisibleInterval(load, 20000, { runImmediately: true });
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  useEffect(() => {
    if (subModule !== 'telemetry') return undefined;
    let cancelled = false;
    const loadObs = () => {
      adminApiClient.get('/ops/observability')
        .then((data) => {
          if (cancelled) return;
          setObservability(data);
        })
        .catch(() => {
          if (!cancelled) setObservability(null);
        });
    };
    const stop = startVisibleInterval(loadObs, 30000, { runImmediately: true });
    return () => {
      cancelled = true;
      stop();
    };
  }, [subModule]);

  const pricedCoverage = useMemo(() => {
    const live = Number(metrics.liveMatches) || 0;
    const priced = Number(metrics.matchesWithOdds) || 0;
    if (!live) return null;
    return Math.round((priced / live) * 100);
  }, [metrics.liveMatches, metrics.matchesWithOdds]);

  const sourceRows = Object.entries(metrics.providerSources || {}).map(([name, status]) => ({
    id: name,
    title: name,
    severity: status === 'error' ? 'HIGH' : status === 'ok' ? 'OK' : 'WATCH',
    status: String(status || 'unknown').toUpperCase(),
    time: metrics.timestamp ? new Date(metrics.timestamp).toLocaleTimeString() : '—',
  }));

  const incidentRows = useMemo(() => {
    const rows = [];
    Object.entries(metrics.providerSources || {}).forEach(([name, status]) => {
      if (status === 'error') {
        rows.push({
          id: `feed-${name}`,
          title: `${name} feed degraded`,
          severity: 'HIGH',
          status: 'OPEN',
          time: metrics.timestamp ? new Date(metrics.timestamp).toLocaleTimeString() : '—',
          domainId: 'sports',
          subModuleId: 'providers',
        });
      }
    });
    if ((metrics.pendingWithdrawals || 0) > 0) {
      rows.push({
        id: 'finance-queue',
        title: `${metrics.pendingWithdrawals} withdrawals pending approval`,
        severity: 'MEDIUM',
        status: 'PENDING',
        time: 'finance',
        domainId: 'finance',
        subModuleId: 'maker-checker',
      });
    }
    if ((metrics.openTickets || 0) > 10) {
      rows.push({
        id: 'support-queue',
        title: `${metrics.openTickets} open support tickets`,
        severity: 'MEDIUM',
        status: 'QUEUE',
        time: 'support',
        domainId: 'support',
        subModuleId: 'ticket-queue',
      });
    }
    if ((metrics.riskAlerts || 0) === 0 && rows.length === 0) {
      rows.push({
        id: 'all-clear',
        title: 'No active operational incidents',
        severity: 'OK',
        status: 'CLEAR',
        time: lastRefreshAt ? new Date(lastRefreshAt).toLocaleTimeString() : '—',
      });
    }
    return rows;
  }, [metrics, lastRefreshAt]);

  const statusColor = metrics.systemStatus === 'HEALTHY'
    ? 'success'
    : metrics.systemStatus === 'ERROR'
      ? 'danger'
      : 'warning';

  const overviewCards = [
    { label: 'Live Matches', value: formatMetric(metrics.liveMatches), source: 'LIVE', accent: '#f472b6', domainId: 'sports', subModuleId: 'catalog' },
    { label: 'Priced Coverage', value: pricedCoverage == null ? '—' : `${pricedCoverage}%`, trendLabel: `${formatMetric(metrics.matchesWithOdds)} of ${formatMetric(metrics.liveMatches)}`, source: 'LIVE', accent: '#fbbf24', domainId: 'trading-risk', subModuleId: 'exposure' },
    { label: 'Open Bets', value: formatMetric(metrics.openBets), source: 'DB', accent: '#60a5fa', domainId: 'betting', subModuleId: 'bets-registry' },
    { label: 'Registered Users', value: formatMetric(metrics.registeredUsers ?? metrics.activeUsers), source: 'DB', accent: '#34d399', domainId: 'customers', subModuleId: 'directory' },
    {
      label: metrics.turnoverScope === 'today' ? 'Today Turnover' : 'Stake Turnover',
      value: formatMetric(metrics.todayTurnover, '₹'),
      source: 'DB',
      accent: '#38bdf8',
      domainId: 'finance',
      subModuleId: 'ledger',
    },
    { label: 'Approx GGR', value: formatMetric(metrics.ggr, '₹'), trendLabel: metrics.ggrNote || 'Settled stake − payouts', source: 'DB', accent: '#a78bfa', domainId: 'analytics', subModuleId: 'turnover-ggr' },
    { label: 'Pending Withdrawals', value: formatMetric(metrics.pendingWithdrawals), source: 'DB', accent: '#f87171', domainId: 'finance', subModuleId: 'maker-checker' },
    { label: 'Open Support Tickets', value: formatMetric(metrics.openTickets), source: 'DB', accent: '#22d3ee', domainId: 'support', subModuleId: 'ticket-queue' },
    { label: 'IPLSRL Console', value: 'Desk', source: 'SRL', accent: '#fb923c', domainId: 'sports', subModuleId: 'iplsrl-console' },
    {
      label: 'Developer API Hub',
      value: 'Gateway',
      source: 'DOCS',
      accent: '#a855f7',
      onClick: () => navigate('/developer'),
    },
  ];

  const titleBySub = {
    overview: 'Operational Overview',
    telemetry: 'Telemetry & SLA Monitors',
    incidents: 'Live System Incidents',
  };

  const showMetrics = subModule === 'overview' || subModule === 'telemetry';
  const showProviders = subModule === 'telemetry';
  const showIncidents = subModule === 'incidents' || subModule === 'overview';
  const incidentData = subModule === 'overview' ? incidentRows.slice(0, 4) : incidentRows;

  return (
    <div>
      {/* Sticky Header */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        margin: '0 0 16px',
        padding: '0 0 12px',
        background: 'var(--admin-sticky-bg)',
        backdropFilter: 'blur(8px)',
      }}>
        <div className="admin-flex-between" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: 'var(--admin-text)' }}>
              Control Tower · {titleBySub[subModule] || 'Operational Overview'}
            </h2>
            <p style={{ margin: '5px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem', maxWidth: '720px' }}>
              {metrics.note || 'Live sportsbook telemetry from aggregator + Postgres.'}
              {lastRefreshAt ? ` · Updated ${new Date(lastRefreshAt).toLocaleTimeString()}` : ''}
            </p>
            {error && (
              <p style={{ margin: '5px 0 0', color: '#f87171', fontSize: '0.78rem' }}>{error}</p>
            )}
          </div>
          <StatusBadge status={metrics.systemStatus} />
        </div>

        <div style={{ marginTop: '12px' }}>
          <AdminTabs
            tabs={tabs}
            active={subModule}
            onChange={(id) => onSubModuleChange?.(id)}
          />
        </div>
      </div>

      {/* KPI Grid */}
      {showMetrics && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '20px' }}>
          {overviewCards.map((card, i) => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.025 }}
            >
              <AdminKPI
                label={card.label}
                value={card.value}
                accent={card.accent}
                source={card.source}
                trendLabel={card.trendLabel}
                onClick={card.onClick
                  ? card.onClick
                  : (card.domainId && onNavigate
                    ? () => onNavigate({ domainId: card.domainId, subModuleId: card.subModuleId })
                    : undefined)}
              />
            </motion.div>
          ))}
        </div>
      )}

      {/* Provider Status Table */}
      {showProviders && (
        <>
          {observability && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
              <AdminCard title="Settlement" accent="#f43f5e" style={{ margin: 0 }}>
                <div style={{ fontSize: '0.84rem', lineHeight: 1.5 }}>
                  <div>Open jobs: <strong>{observability.settlement?.open_jobs ?? '—'}</strong></div>
                  <div>Failed: <strong>{observability.settlement?.failed_jobs ?? '—'}</strong></div>
                  <div>Completed 15m: <strong>{observability.settlement?.completed_15m ?? '—'}</strong></div>
                  <button
                    type="button"
                    className="admin-btn admin-btn--secondary admin-btn--sm"
                    style={{ marginTop: 8 }}
                    onClick={() => onNavigate?.({ domainId: 'operations', subModuleId: 'settlement-queue' })}
                  >
                    Open settlement queue →
                  </button>
                </div>
              </AdminCard>
              <AdminCard title="Deposits" accent="#38bdf8" style={{ margin: 0 }}>
                <div style={{ fontSize: '0.84rem', lineHeight: 1.5 }}>
                  <div>Pending 1h: <strong>{observability.deposits?.pending_1h ?? '—'}</strong></div>
                  <div>Captured 15m: <strong>{observability.deposits?.captured_15m ?? '—'}</strong></div>
                </div>
              </AdminCard>
              <AdminCard title="Outbox" accent="#f59e0b" style={{ margin: 0 }}>
                <div style={{ fontSize: '0.84rem', lineHeight: 1.5 }}>
                  <div>Pending: <strong>{observability.outbox?.pending ?? '—'}</strong></div>
                  <div>Failed: <strong>{observability.outbox?.failed ?? '—'}</strong></div>
                </div>
              </AdminCard>
              {(observability.alerts || []).length > 0 && (
                <AdminCard title="Alerts" accent="#ef4444" style={{ margin: 0 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {observability.alerts.map((a) => (
                      <div key={a.code} style={{ fontSize: '0.78rem', color: a.severity === 'high' ? '#b91c1c' : '#b45309' }}>
                        {a.message}
                      </div>
                    ))}
                    <button
                      type="button"
                      className="admin-btn admin-btn--ghost admin-btn--sm"
                      onClick={() => onNavigate?.({ domainId: 'operations', subModuleId: 'settlement-queue' })}
                    >
                      Investigate →
                    </button>
                  </div>
                </AdminCard>
              )}
            </div>
          )}
          <AdminDataTable
            title="Provider Feed Status"
            emptyMessage="No provider status in current snapshot"
            data={sourceRows}
            columns={[
              { header: 'Provider', key: 'title' },
              {
                header: 'Health',
                key: 'severity',
                render: (r) => <StatusBadge status={r.severity} customMap={{
                  success: ['OK'],
                  warning: ['WATCH'],
                  danger: ['HIGH'],
                }} />,
              },
              { header: 'Status', key: 'status' },
              { header: 'Snapshot', key: 'time' },
            ]}
          />
        </>
      )}

      {/* Incidents Table */}
      {showIncidents && (
        <AdminDataTable
          title={subModule === 'overview' ? 'Incidents Snapshot' : 'Operational Incidents & Queues'}
          emptyMessage="No incidents"
          data={incidentData}
          onRowClick={(row) => {
            if (row?.domainId && onNavigate) {
              onNavigate({ domainId: row.domainId, subModuleId: row.subModuleId });
            }
          }}
          columns={[
            { header: 'Incident', key: 'title' },
            {
              header: 'Severity',
              key: 'severity',
              render: (r) => <StatusBadge status={r.severity} customMap={{
                success: ['OK'],
                warning: ['MEDIUM', 'WATCH'],
                danger: ['HIGH', 'CRITICAL'],
              }} />,
            },
            { header: 'Status', key: 'status' },
            { header: 'Context', key: 'time' },
          ]}
        />
      )}

      {/* Quick Nav Buttons */}
      {subModule === 'overview' && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="admin-btn admin-btn--secondary"
            onClick={() => onSubModuleChange?.('telemetry')}
            style={{ color: '#93c5fd' }}
          >
            Open Telemetry →
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--secondary"
            onClick={() => onSubModuleChange?.('incidents')}
            style={{ color: '#fbbf24' }}
          >
            Open Incidents →
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--secondary"
            onClick={() => navigate('/developer')}
            style={{ color: '#c084fc' }}
          >
            Developer API Gateway ↗
          </button>
        </div>
      )}
    </div>
  );
}
