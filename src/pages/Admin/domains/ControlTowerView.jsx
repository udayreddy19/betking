import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import { startVisibleInterval } from '../utils/visibleInterval';

function formatMetric(value, prefix = '') {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return `${prefix}${Number(value).toLocaleString()}`;
}

function MetricCard({ label, value, hint, source, color, delay = 0, onClick }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay }}
      whileHover={{ y: -3 }}
      className="telemetry-card"
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      } : undefined}
      style={{
        '--card-accent': color,
        padding: '18px 18px 16px 22px',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
        <span className="telemetry-label">{label}</span>
        {source && (
          <span style={{
            fontSize: '0.62rem',
            fontWeight: 800,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            padding: '2px 7px',
            borderRadius: '999px',
            background: source === 'LIVE' ? 'rgba(236, 72, 153, 0.15)' : (source === 'DOCS' ? 'rgba(168, 85, 247, 0.15)' : 'rgba(59, 130, 246, 0.15)'),
            color: source === 'LIVE' ? '#f472b6' : (source === 'DOCS' ? '#c084fc' : '#60a5fa'),
            border: `1px solid ${source === 'LIVE' ? 'rgba(236, 72, 153, 0.3)' : (source === 'DOCS' ? 'rgba(168, 85, 247, 0.3)' : 'rgba(59, 130, 246, 0.3)')}`,
          }}>
            {source}
          </span>
        )}
      </div>
      <div className="telemetry-value" style={{ color, marginTop: '10px' }}>{value}</div>
      <div style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--admin-text-muted)', marginTop: '4px', lineHeight: 1.35 }}>
        {hint}
      </div>
    </motion.div>
  );
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
    ? { bg: 'rgba(16, 185, 129, 0.18)', fg: '#34d399', border: 'rgba(16, 185, 129, 0.35)' }
    : metrics.systemStatus === 'ERROR'
      ? { bg: 'rgba(239, 68, 68, 0.18)', fg: '#f87171', border: 'rgba(239, 68, 68, 0.35)' }
      : { bg: 'rgba(245, 158, 11, 0.18)', fg: '#fbbf24', border: 'rgba(245, 158, 11, 0.35)' };

  const overviewCards = [
    { label: 'Live Matches', value: formatMetric(metrics.liveMatches), hint: 'From aggregator cache', source: 'LIVE', color: '#f472b6', domainId: 'sports', subModuleId: 'catalog' },
    { label: 'Priced Coverage', value: pricedCoverage == null ? '—' : `${pricedCoverage}%`, hint: `${formatMetric(metrics.matchesWithOdds)} of ${formatMetric(metrics.liveMatches)} live`, source: 'LIVE', color: '#fbbf24', domainId: 'trading-risk', subModuleId: 'exposure' },
    { label: 'Open Bets', value: formatMetric(metrics.openBets), hint: 'Pending / open in ledger', source: 'DB', color: '#60a5fa', domainId: 'betting', subModuleId: 'bets-registry' },
    { label: 'Registered Users', value: formatMetric(metrics.registeredUsers ?? metrics.activeUsers), hint: 'Total accounts in Postgres', source: 'DB', color: '#34d399', domainId: 'customers', subModuleId: 'directory' },
    {
      label: metrics.turnoverScope === 'today' ? 'Today Turnover' : 'Stake Turnover',
      value: formatMetric(metrics.todayTurnover, '₹'),
      hint: metrics.turnoverScope === 'today' ? 'Stakes placed today' : 'All-time stake sum',
      source: 'DB',
      color: '#38bdf8',
      domainId: 'finance',
      subModuleId: 'ledger',
    },
    { label: 'Approx GGR', value: formatMetric(metrics.ggr, '₹'), hint: metrics.ggrNote || 'Settled stake − payouts', source: 'DB', color: '#a78bfa', domainId: 'analytics', subModuleId: 'turnover-ggr' },
    { label: 'Pending Withdrawals', value: formatMetric(metrics.pendingWithdrawals), hint: 'Awaiting finance approval', source: 'DB', color: '#f87171', domainId: 'finance', subModuleId: 'maker-checker' },
    { label: 'Open Support Tickets', value: formatMetric(metrics.openTickets), hint: 'Unresolved conversations', source: 'DB', color: '#22d3ee', domainId: 'support', subModuleId: 'ticket-queue' },
    { label: 'IPLSRL Console', value: 'Desk', hint: 'Script winner → start → control balls', source: 'SRL', color: '#fb923c', domainId: 'sports', subModuleId: 'iplsrl-console' },
    {
      label: 'Developer API Hub',
      value: 'Gateway',
      hint: 'REST APIs, Live Stream & Sandbox',
      source: 'DOCS',
      color: '#a855f7',
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
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        margin: '0 0 16px',
        padding: '0 0 12px',
        background: 'var(--admin-sticky-bg)',
        backdropFilter: 'blur(8px)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: 'var(--admin-text)' }}>
              Control Tower · {titleBySub[subModule] || 'Operational Overview'}
            </h2>
            <p style={{ margin: '6px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.85rem', maxWidth: '720px' }}>
              {metrics.note || 'Live sportsbook telemetry from aggregator + Postgres.'}
              {lastRefreshAt ? ` · Updated ${new Date(lastRefreshAt).toLocaleTimeString()}` : ''}
            </p>
            {error && (
              <p style={{ margin: '6px 0 0', color: '#f87171', fontSize: '0.8rem' }}>{error}</p>
            )}
          </div>
          <span
            style={{
              padding: '7px 14px',
              borderRadius: '999px',
              background: statusColor.bg,
              color: statusColor.fg,
              fontWeight: 800,
              fontSize: '0.78rem',
              border: `1px solid ${statusColor.border}`,
              whiteSpace: 'nowrap',
            }}
          >
            {metrics.systemStatus}
          </span>
        </div>

        <div style={{
          display: 'flex',
          gap: '8px',
          marginTop: '14px',
          flexWrap: 'wrap',
        }}>
          {tabs.map((tab) => {
            const active = subModule === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSubModuleChange?.(tab.id)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '999px',
                  border: active ? '1px solid rgba(59, 130, 246, 0.55)' : '1px solid var(--admin-border)',
                  background: active ? 'rgba(59, 130, 246, 0.14)' : 'var(--admin-chip-bg)',
                  color: active ? 'var(--admin-accent-blue, #3b82f6)' : 'var(--admin-text-muted)',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {showMetrics && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px', marginBottom: '22px' }}>
          {overviewCards.map((card, i) => (
            <MetricCard
              key={card.label}
              label={card.label}
              value={card.value}
              hint={card.hint}
              source={card.source}
              color={card.color}
              delay={i * 0.03}
              onClick={card.onClick
                ? card.onClick
                : (card.domainId && onNavigate
                  ? () => onNavigate({ domainId: card.domainId, subModuleId: card.subModuleId })
                  : undefined)}
            />
          ))}
        </div>
      )}

      {showProviders && (
        <AdminDataTable
          title="Provider Feed Status"
          emptyMessage="No provider status in current snapshot"
          data={sourceRows}
          columns={[
            { header: 'Provider', key: 'title' },
            {
              header: 'Health',
              key: 'severity',
              render: (r) => (
                <span style={{
                  padding: '3px 10px',
                  borderRadius: '12px',
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  background: r.severity === 'HIGH' ? 'rgba(239, 68, 68, 0.2)' : r.severity === 'OK' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                  color: r.severity === 'HIGH' ? '#f87171' : r.severity === 'OK' ? '#34d399' : '#fbbf24',
                }}>
                  {r.severity}
                </span>
              ),
            },
            { header: 'Status', key: 'status' },
            { header: 'Snapshot', key: 'time' },
          ]}
        />
      )}

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
              render: (r) => (
                <span style={{
                  padding: '3px 10px',
                  borderRadius: '12px',
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  background: r.severity === 'HIGH' ? 'rgba(239, 68, 68, 0.2)' : r.severity === 'OK' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                  color: r.severity === 'HIGH' ? '#f87171' : r.severity === 'OK' ? '#34d399' : '#fbbf24',
                }}>
                  {r.severity}
                </span>
              ),
            },
            { header: 'Status', key: 'status' },
            { header: 'Context', key: 'time' },
          ]}
        />
      )}

      {subModule === 'overview' && (
        <div style={{ display: 'flex', gap: '10px', marginTop: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => onSubModuleChange?.('telemetry')}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid rgba(59, 130, 246, 0.35)',
              background: 'rgba(59, 130, 246, 0.12)',
              color: '#93c5fd',
              fontWeight: 700,
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            Open Telemetry →
          </button>
          <button
            type="button"
            onClick={() => onSubModuleChange?.('incidents')}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              background: 'rgba(245, 158, 11, 0.12)',
              color: '#fbbf24',
              fontWeight: 700,
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            Open Incidents →
          </button>
          <button
            type="button"
            onClick={() => navigate('/developer')}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid rgba(168, 85, 247, 0.35)',
              background: 'rgba(168, 85, 247, 0.12)',
              color: '#c084fc',
              fontWeight: 700,
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            Developer API Gateway (/developer) ↗
          </button>
        </div>
      )}
    </div>
  );
}
