import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import AdminKPI from '../components/AdminKPI';
import AdminTabs from '../components/AdminTabs';
import AdminCard from '../components/AdminCard';
import { StatusBadge } from '../components/AdminBadge';
import { startVisibleInterval } from '../utils/visibleInterval';

/** Display helper — never invent metrics. */
export function formatMetric(value, prefix = '') {
  if (value == null || Number.isNaN(Number(value))) return 'Data unavailable';
  return `${prefix}${Number(value).toLocaleString()}`;
}

function Section({ title, children }) {
  return (
    <section style={{ marginBottom: 20 }} aria-label={title}>
      <h3 className="admin-section-title">{title}</h3>
      {children}
    </section>
  );
}

function KpiGrid({ cards, onNavigate }) {
  return (
    <div className="admin-kpi-grid">
      {cards.map((card) => (
        <AdminKPI
          key={card.label}
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
      ))}
    </div>
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
    pendingKyc: null,
    suspendedMarkets: null,
    lockedDepositsTotal: null,
    reservedFundsTotal: null,
    openExposure: null,
    openLiability: null,
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
  const [opsHealth, setOpsHealth] = useState(null);

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
    let cancelled = false;
    const loadSide = () => {
      Promise.allSettled([
        adminApiClient.get('/ops/observability'),
        adminApiClient.get('/operations/health'),
      ]).then(([obs, health]) => {
        if (cancelled) return;
        setObservability(obs.status === 'fulfilled' ? obs.value : null);
        setOpsHealth(health.status === 'fulfilled' ? health.value : null);
      });
    };
    const stop = startVisibleInterval(loadSide, 30000, { runImmediately: true });
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
    if ((observability?.settlement?.failed_jobs || 0) > 0) {
      rows.push({
        id: 'settlement-fail',
        title: `${observability.settlement.failed_jobs} settlement jobs failed`,
        severity: 'HIGH',
        status: 'OPEN',
        time: 'operations',
        domainId: 'operations',
        subModuleId: 'settlement-queue',
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
  }, [metrics, lastRefreshAt, observability]);

  const systemCards = [
    {
      label: 'System',
      value: metrics.systemStatus || 'Data unavailable',
      source: 'LIVE',
      accent: metrics.systemStatus === 'HEALTHY' ? '#10b981' : '#f59e0b',
      domainId: 'operations',
      subModuleId: 'health-matrix',
    },
    {
      label: 'API / Ops health',
      value: opsHealth?.overall || opsHealth?.status || (opsHealth ? 'OK' : 'Data unavailable'),
      source: 'OPS',
      accent: '#38bdf8',
      domainId: 'operations',
      subModuleId: 'health-matrix',
    },
    {
      label: 'Outbox pending',
      value: formatMetric(observability?.outbox?.pending),
      source: 'DB',
      accent: '#f59e0b',
      domainId: 'operations',
      subModuleId: 'outbox',
    },
    {
      label: 'Settlement failed',
      value: formatMetric(observability?.settlement?.failed_jobs),
      source: 'DB',
      accent: '#f43f5e',
      domainId: 'operations',
      subModuleId: 'settlement-queue',
    },
    {
      label: 'Provider errors',
      value: formatMetric(metrics.riskAlerts),
      source: 'FEED',
      accent: '#fb7185',
      domainId: 'sports',
      subModuleId: 'providers',
    },
  ];

  const businessCards = [
    { label: 'Users', value: formatMetric(metrics.registeredUsers ?? metrics.activeUsers), source: 'DB', accent: '#34d399', domainId: 'customers', subModuleId: 'directory' },
    {
      label: metrics.turnoverScope === 'today' ? 'Turnover (today)' : 'Turnover',
      value: formatMetric(metrics.todayTurnover, '₹'),
      source: 'DB',
      accent: '#38bdf8',
      domainId: 'analytics',
      subModuleId: 'turnover-ggr',
    },
    { label: 'Approx GGR', value: formatMetric(metrics.ggr, '₹'), trendLabel: metrics.ggrNote || undefined, source: 'DB', accent: '#a78bfa', domainId: 'analytics', subModuleId: 'turnover-ggr' },
    { label: 'Open bets', value: formatMetric(metrics.openBets), source: 'DB', accent: '#60a5fa', domainId: 'betting', subModuleId: 'bets-registry' },
    { label: 'Open exposure', value: formatMetric(metrics.openExposure ?? metrics.openLiability, '₹'), source: 'DB', accent: '#f472b6', domainId: 'trading-risk', subModuleId: 'exposure' },
    { label: 'Pending KYC', value: formatMetric(metrics.pendingKyc), source: 'DB', accent: '#fbbf24', domainId: 'customers', subModuleId: 'kyc-queue' },
    { label: 'Pending withdrawals', value: formatMetric(metrics.pendingWithdrawals), source: 'DB', accent: '#f87171', domainId: 'finance', subModuleId: 'maker-checker' },
  ];

  const tradingCards = [
    { label: 'Live matches', value: formatMetric(metrics.liveMatches), source: 'LIVE', accent: '#f472b6', domainId: 'sports', subModuleId: 'catalog' },
    {
      label: 'Priced coverage',
      value: pricedCoverage == null ? 'Data unavailable' : `${pricedCoverage}%`,
      trendLabel: `${formatMetric(metrics.matchesWithOdds)} of ${formatMetric(metrics.liveMatches)}`,
      source: 'LIVE',
      accent: '#fbbf24',
      domainId: 'trading-risk',
      subModuleId: 'exposure',
    },
    { label: 'Suspended markets', value: formatMetric(metrics.suspendedMarkets), source: 'DB', accent: '#fb923c', domainId: 'trading-risk', subModuleId: 'suspension' },
  ];

  const financeCards = [
    { label: 'Locked deposits', value: formatMetric(metrics.lockedDepositsTotal, '₹'), source: 'DB', accent: '#22d3ee', domainId: 'finance', subModuleId: 'finance-health' },
    { label: 'Reserved funds', value: formatMetric(metrics.reservedFundsTotal, '₹'), source: 'DB', accent: '#818cf8', domainId: 'finance', subModuleId: 'ledger' },
    { label: 'Open support tickets', value: formatMetric(metrics.openTickets), source: 'DB', accent: '#22d3ee', domainId: 'support', subModuleId: 'ticket-queue' },
  ];

  const riskCards = [
    {
      label: 'Fraud / anomaly desk',
      value: 'Review',
      source: 'NAV',
      accent: '#f43f5e',
      domainId: 'trading-risk',
      subModuleId: 'fraud-signals',
    },
    {
      label: 'Referral / promo abuse',
      value: 'Growth',
      source: 'NAV',
      accent: '#a855f7',
      domainId: 'growth',
      subModuleId: 'referrals',
    },
  ];

  const titleBySub = {
    overview: 'Operational Overview',
    telemetry: 'Telemetry & SLA Monitors',
    incidents: 'Live System Incidents',
  };

  const showOverview = subModule === 'overview';
  const showProviders = subModule === 'telemetry';
  const showIncidents = subModule === 'incidents' || subModule === 'overview';
  const incidentData = subModule === 'overview' ? incidentRows.slice(0, 4) : incidentRows;

  return (
    <div>
      <div className="admin-sticky-header">
        <div className="admin-flex-between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--admin-text)' }}>
              Control Tower · {titleBySub[subModule] || 'Operational Overview'}
            </h2>
            <p style={{ margin: '5px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem', maxWidth: 720 }}>
              {metrics.note || 'Live sportsbook telemetry from aggregator + Postgres.'}
              {lastRefreshAt ? ` · Updated ${new Date(lastRefreshAt).toLocaleTimeString()}` : ''}
            </p>
            {error && (
              <p style={{ margin: '5px 0 0', color: 'var(--admin-danger)', fontSize: '0.78rem' }}>{error}</p>
            )}
          </div>
          <StatusBadge status={metrics.systemStatus} />
        </div>
        <div style={{ marginTop: 12 }}>
          <AdminTabs tabs={tabs} active={subModule} onChange={(id) => onSubModuleChange?.(id)} />
        </div>
      </div>

      {showOverview && (
        <>
          <Section title="System health">
            <KpiGrid cards={systemCards} onNavigate={onNavigate} />
          </Section>
          <Section title="Business">
            <KpiGrid cards={businessCards} onNavigate={onNavigate} />
          </Section>
          <Section title="Trading">
            <KpiGrid cards={tradingCards} onNavigate={onNavigate} />
          </Section>
          <Section title="Finance">
            <KpiGrid cards={financeCards} onNavigate={onNavigate} />
          </Section>
          <Section title="Risk">
            <KpiGrid cards={riskCards} onNavigate={onNavigate} />
          </Section>
        </>
      )}

      {showProviders && (
        <>
          <Section title="System health">
            <KpiGrid cards={systemCards} onNavigate={onNavigate} />
          </Section>
          {observability ? (
            <div className="admin-kpi-grid" style={{ marginBottom: 16 }}>
              <AdminCard title="Settlement" accent="#f43f5e" style={{ margin: 0 }}>
                <div style={{ fontSize: '0.84rem', lineHeight: 1.5 }}>
                  <div>Open jobs: <strong>{observability.settlement?.open_jobs ?? 'Data unavailable'}</strong></div>
                  <div>Failed: <strong>{observability.settlement?.failed_jobs ?? 'Data unavailable'}</strong></div>
                  <div>Completed 15m: <strong>{observability.settlement?.completed_15m ?? 'Data unavailable'}</strong></div>
                </div>
              </AdminCard>
              <AdminCard title="Outbox" accent="#f59e0b" style={{ margin: 0 }}>
                <div style={{ fontSize: '0.84rem', lineHeight: 1.5 }}>
                  <div>Pending: <strong>{observability.outbox?.pending ?? 'Data unavailable'}</strong></div>
                  <div>Failed: <strong>{observability.outbox?.failed ?? 'Data unavailable'}</strong></div>
                </div>
              </AdminCard>
              <AdminCard title="Deposits (ops)" accent="#38bdf8" style={{ margin: 0 }}>
                <div style={{ fontSize: '0.84rem', lineHeight: 1.5 }}>
                  <div>Pending 1h: <strong>{observability.deposits?.pending_1h ?? 'Data unavailable'}</strong></div>
                  <div>Captured 15m: <strong>{observability.deposits?.captured_15m ?? 'Data unavailable'}</strong></div>
                </div>
              </AdminCard>
            </div>
          ) : (
            <p style={{ color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>Observability: Data unavailable</p>
          )}
          <AdminDataTable
            title="Provider feed status"
            emptyMessage="No provider status in current snapshot"
            data={sourceRows}
            columns={[
              { header: 'Provider', key: 'title' },
              {
                header: 'Health',
                key: 'severity',
                render: (r) => (
                  <StatusBadge
                    status={r.severity}
                    customMap={{ success: ['OK'], warning: ['WATCH'], danger: ['HIGH'] }}
                  />
                ),
              },
              { header: 'Status', key: 'status' },
              { header: 'Snapshot', key: 'time' },
            ]}
          />
        </>
      )}

      {showIncidents && (
        <AdminDataTable
          title={subModule === 'overview' ? 'Incidents snapshot' : 'Operational incidents & queues'}
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
                <StatusBadge
                  status={r.severity}
                  customMap={{ success: ['OK'], warning: ['MEDIUM', 'WATCH'], danger: ['HIGH', 'CRITICAL'] }}
                />
              ),
            },
            { header: 'Status', key: 'status' },
            { header: 'Context', key: 'time' },
          ]}
        />
      )}

      {subModule === 'overview' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <button type="button" className="admin-btn admin-btn--secondary" onClick={() => onSubModuleChange?.('telemetry')}>
            Open telemetry →
          </button>
          <button type="button" className="admin-btn admin-btn--secondary" onClick={() => onSubModuleChange?.('incidents')}>
            Open incidents →
          </button>
          <button type="button" className="admin-btn admin-btn--secondary" onClick={() => navigate('/developer')}>
            Developer API ↗
          </button>
        </div>
      )}
    </div>
  );
}
