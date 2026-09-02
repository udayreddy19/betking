import React, { useState, useEffect } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import { useAdminToast } from '../components/AdminToastContext';
import { StatusBadge } from '../components/AdminBadge';
import AdminKPI from '../components/AdminKPI';
import AdminCard from '../components/AdminCard';
import { AdminKpiDrillDrawer, useAdminKpiDrilldown } from '../hooks/useAdminKpiDrilldown';

function money(v) {
  if (v == null || Number.isNaN(Number(v))) return 'Data unavailable';
  return `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function num(v) {
  if (v == null || Number.isNaN(Number(v))) return 'Data unavailable';
  return Number(v).toLocaleString('en-IN');
}

export default function AnalyticsDomainView({ subModule = 'turnover-ggr' }) {
  const [reports, setReports] = useState([]);
  const [overview, setOverview] = useState(null);
  const [retention, setRetention] = useState(null);
  const [funnel, setFunnel] = useState(null);
  const [error, setError] = useState(null);
  const { showToast } = useAdminToast();

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      adminApiClient.get('/analytics/overview').catch((err) => ({ __error: err.message })),
      adminApiClient.get('/analytics/retention').catch((err) => ({ __error: err.message })),
      adminApiClient.get('/analytics/funnel').catch((err) => ({ __error: err.message })),
      adminApiClient.get('/analytics/reports').catch((err) => ({ __error: err.message, reports: [] })),
    ]).then(([ov, ret, fun, rep]) => {
      if (cancelled) return;
      setOverview(ov?.__error ? null : ov);
      setRetention(ret?.__error ? null : ret);
      setFunnel(fun?.__error ? null : fun);
      setReports(rep?.reports || []);
      const errs = [ov, ret, fun, rep].map((x) => x?.__error).filter(Boolean);
      setError(errs.length === 4 ? (errs[0] || 'Failed to load analytics') : null);
    });
    return () => { cancelled = true; };
  }, []);

  const exportReport = (report) => {
    const payload = JSON.stringify(report, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${report.id || 'report'}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${report.name || report.id}`, 'success');
  };

  const exportOverview = () => {
    if (!overview) {
      showToast('Data unavailable', 'info');
      return;
    }
    exportReport({ id: 'bi-overview', name: 'Executive BI Overview', ...overview });
  };

  const heading = subModule === 'bi-exporter'
    ? 'Custom BI Data Exporter'
    : 'Performance';
  const hint = subModule === 'bi-exporter'
    ? 'Export live BI snapshots as JSON. Metrics come from PostgreSQL — never synthetic.'
    : 'Users, turnover, GGR/NGR, retention, and funnel from authoritative BI queries.';

  const betting = overview?.betting || {};
  const users = overview?.users || {};
  const finance = overview?.finance || {};

  const kpiCards = [
    { label: 'Users', metric: 'registeredUsers', value: num(users.total), accent: '#38bdf8' },
    { label: 'Active users', metric: 'activeUsers', value: num(users.active), accent: '#34d399' },
    { label: 'Active bettors', metric: 'activeBettors', value: num(users.activeBettors), accent: '#a78bfa' },
    { label: 'Turnover', metric: 'turnover', value: money(betting.turnover), accent: '#fb923c' },
    { label: 'GGR', metric: 'ggr', value: money(betting.ggr), accent: '#f87171' },
    { label: 'NGR', metric: 'NGR', value: money(betting.ngr), accent: '#fbbf24' },
    { label: 'Avg stake', metric: 'Avg stake', value: money(betting.totalBets > 0 ? betting.turnover / betting.totalBets : null), accent: '#818cf8' },
    { label: 'Bet count', metric: 'totalBets', value: num(betting.totalBets), accent: '#60a5fa' },
    { label: 'Deposits', metric: 'Deposits', value: money(finance.totalDeposits), accent: '#4ade80' },
    { label: 'Withdrawals', metric: 'Withdrawals', value: money(finance.totalWithdrawals), accent: '#fb7185' },
  ];

  const drill = useAdminKpiDrilldown();

  return (
    <div>
      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 className="admin-page-header__title">{heading}</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
            {hint} Click any tile for underlying rows.
          </p>
          {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.78rem' }}>{error}</p>}
        </div>
        {subModule === 'bi-exporter' && (
          <button type="button" className="admin-btn admin-btn--primary" onClick={exportOverview}>
            Export overview JSON
          </button>
        )}
      </div>

      {!overview && !error && (
        <p style={{ color: 'var(--admin-text-muted)' }}>Loading BI metrics…</p>
      )}
      {!overview && error && (
        <p style={{ color: 'var(--admin-text-muted)' }}>Data unavailable</p>
      )}

      {overview && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 10,
          marginBottom: 20,
        }}
        >
          {kpiCards.map((c) => (
            <AdminKPI
              key={c.label}
              label={c.label}
              value={c.value}
              accent={c.accent}
              source="Details"
              onClick={() => drill.openDrilldown(c.metric, c.label)}
            />
          ))}
        </div>
      )}

      <AdminKpiDrillDrawer drill={drill} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginBottom: 20 }}>
        <AdminCard title="Retention" accent="#34d399">
          {!retention ? (
            <p style={{ margin: 0, color: 'var(--admin-text-muted)' }}>Data unavailable</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.84rem', color: 'var(--admin-text)' }}>
              <li>Registered: {num(retention.totalRegistered)}</li>
              <li>D1 active bettors: {num(retention.d1Active)}</li>
              <li>D1 retention: {retention.d1RetentionPct != null ? `${retention.d1RetentionPct}%` : 'Data unavailable'}</li>
              <li>Recent cohorts: {Array.isArray(retention.cohorts) ? retention.cohorts.length : 0}</li>
            </ul>
          )}
        </AdminCard>
        <AdminCard title="Funnel" accent="#818cf8">
          {!funnel?.funnel?.length ? (
            <p style={{ margin: 0, color: 'var(--admin-text-muted)' }}>Data unavailable</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.84rem', color: 'var(--admin-text)' }}>
              {funnel.funnel.map((stage) => (
                <li key={stage.stage}>
                  {stage.stage}: {num(stage.count)} ({stage.conversionRate || '—'})
                </li>
              ))}
            </ul>
          )}
        </AdminCard>
      </div>

      <AdminDataTable
        title={subModule === 'bi-exporter' ? 'Exportable Operational Reports' : 'Operational Snapshots'}
        emptyMessage="Data unavailable"
        data={reports}
        columns={[
          { header: 'Report ID', key: 'id', render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.76rem' }}>{r.id}</span> },
          { header: 'Report Name', key: 'name', render: (r) => <span style={{ fontWeight: 700 }}>{r.name}</span> },
          { header: 'Frequency', key: 'frequency', render: (r) => <span className="admin-badge admin-badge--neutral">{r.frequency}</span> },
          { header: 'Detail', key: 'detail', render: (r) => r.detail || r.format || '—' },
          { header: 'Last Generated', key: 'lastGenerated' },
          {
            header: 'Status',
            key: 'status',
            render: (r) => <StatusBadge status={r.status} />,
          },
          ...(subModule === 'bi-exporter' ? [{
            header: 'Export',
            key: 'export',
            sortable: false,
            render: (r) => (
              <button
                type="button"
                onClick={() => exportReport(r)}
                className="admin-btn admin-btn--primary admin-btn--sm"
              >
                Export JSON
              </button>
            ),
          }] : []),
        ]}
      />
    </div>
  );
}
