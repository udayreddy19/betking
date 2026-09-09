import React, { useState, useEffect, useCallback } from 'react';
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
  const [pnlPeriod, setPnlPeriod] = useState('30d');
  const [pnlData, setPnlData] = useState(null);
  const [loadingPnl, setLoadingPnl] = useState(false);
  const { showToast } = useAdminToast();

  const fetchPnl = useCallback((period = pnlPeriod) => {
    setLoadingPnl(true);
    adminApiClient.get(`/analytics/pnl?period=${period}`)
      .then((data) => {
        setPnlData(data);
      })
      .catch(() => {
        setPnlData(null);
      })
      .finally(() => setLoadingPnl(false));
  }, [pnlPeriod]);

  useEffect(() => {
    fetchPnl(pnlPeriod);
  }, [pnlPeriod, fetchPnl]);

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

  const exportPnlCsv = () => {
    if (!pnlData) {
      showToast('P&L data unavailable for export', 'warning');
      return;
    }
    const lines = [
      ['OddsYra Financial P&L & GGR Ledger Report', `Period: ${pnlPeriod}`, `Exported At: ${new Date().toISOString()}`].join(','),
      [],
      ['Metric', 'Value'].join(','),
      ['Turnover (INR)', pnlData.turnover || 0].join(','),
      ['Gross Gaming Revenue (GGR INR)', pnlData.ggr || 0].join(','),
      ['House Hold %', `${pnlData.holdPct || 0}%`].join(','),
      ['Player Win Rate %', `${pnlData.playerWinRatePct || 0}%`].join(','),
      ['Total Bets', pnlData.totalBets || 0].join(','),
      ['Active Bettors', pnlData.activeBettors || 0].join(','),
      ['Total Deposits (INR)', pnlData.cashflow?.totalDeposits || 0].join(','),
      ['Total Withdrawals (INR)', pnlData.cashflow?.totalWithdrawals || 0].join(','),
      ['Net Platform Cashflow (INR)', pnlData.cashflow?.netCashflow || 0].join(','),
      [],
      ['Sport / Vertical Breakdown', 'Turnover (INR)', 'GGR (INR)', 'Hold %', 'Bets Count'].join(','),
      ...(pnlData.sportBreakdown || []).map((s) => [
        s.sport.toUpperCase(),
        s.turnover,
        s.ggr,
        `${s.holdPct}%`,
        s.betsCount,
      ].join(',')),
    ];

    const csvContent = lines.map((row) => (Array.isArray(row) ? row.join(',') : row)).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `oddsyra_pnl_ledger_${pnlPeriod}_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('P&L Ledger CSV exported successfully!', 'success');
  };

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
    { label: 'GGR', metric: 'settledGgr', value: money(betting.ggr), accent: '#f87171' },
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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" className="admin-btn admin-btn--secondary" onClick={exportPnlCsv}>
            📥 Export P&L (CSV)
          </button>
          {subModule === 'bi-exporter' && (
            <button type="button" className="admin-btn admin-btn--primary" onClick={exportOverview}>
              Export overview JSON
            </button>
          )}
        </div>
      </div>

      {/* Executive Financial P&L & Cashflow Ledger Console */}
      <AdminCard
        title="Executive Financial P&L & Cashflow Ledger"
        subtitle="Authoritative PostgreSQL accounting ledger: gross gaming revenue, player win rates, and vertical margins."
        accent="#38bdf8"
        style={{ marginBottom: 20 }}
        actions={
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { id: 'today', label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: '7d', label: '7 Days' },
              { id: '30d', label: '30 Days' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                className={`admin-btn admin-btn--sm${pnlPeriod === t.id ? ' admin-btn--secondary' : ' admin-btn--ghost'}`}
                style={{ fontSize: '0.74rem', padding: '3px 8px' }}
                onClick={() => setPnlPeriod(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        }
      >
        {pnlData && (
          <div>
            {/* P&L Cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 12,
              marginBottom: 16,
            }}>
              <div style={{ padding: '12px 14px', borderRadius: 'var(--admin-radius-sm)', background: 'var(--admin-bg)', border: '1px solid var(--admin-border)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Period Handle / Turnover</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#38bdf8', marginTop: 4 }}>
                  {money(pnlData.turnover)}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--admin-text-dim)', marginTop: 2 }}>{num(pnlData.totalBets)} bets placed</div>
              </div>

              <div style={{ padding: '12px 14px', borderRadius: 'var(--admin-radius-sm)', background: 'var(--admin-bg)', border: '1px solid var(--admin-border)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Gross Gaming Revenue (GGR)</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: pnlData.ggr >= 0 ? '#34d399' : '#f87171', marginTop: 4 }}>
                  {money(pnlData.ggr)}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--admin-text-dim)', marginTop: 2 }}>Hold: {pnlData.holdPct}%</div>
              </div>

              <div style={{ padding: '12px 14px', borderRadius: 'var(--admin-radius-sm)', background: 'var(--admin-bg)', border: '1px solid var(--admin-border)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Player Win Rate</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fbbf24', marginTop: 4 }}>
                  {pnlData.playerWinRatePct}%
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--admin-text-dim)', marginTop: 2 }}>Settled payout: {money(pnlData.settledPayout)}</div>
              </div>

              <div style={{ padding: '12px 14px', borderRadius: 'var(--admin-radius-sm)', background: 'var(--admin-bg)', border: '1px solid var(--admin-border)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Net Cashflow (Deposits − Payouts)</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: (pnlData.cashflow?.netCashflow || 0) >= 0 ? '#34d399' : '#fb7185', marginTop: 4 }}>
                  {money(pnlData.cashflow?.netCashflow)}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--admin-text-dim)', marginTop: 2 }}>In: {money(pnlData.cashflow?.totalDeposits)} · Out: {money(pnlData.cashflow?.totalWithdrawals)}</div>
              </div>
            </div>

            {/* Vertical / Sport Revenue Breakdown */}
            {Array.isArray(pnlData.sportBreakdown) && pnlData.sportBreakdown.length > 0 && (
              <div style={{ overflowX: 'auto', border: '1px solid var(--admin-border)', borderRadius: 'var(--admin-radius-sm)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--admin-bg)', borderBottom: '1px solid var(--admin-border)', textAlign: 'left' }}>
                      <th style={{ padding: '8px 12px', fontWeight: 700 }}>Vertical / Sport</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>Bets Count</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>Turnover</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>GGR</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>Hold %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pnlData.sportBreakdown.map((row) => (
                      <tr key={row.sport} style={{ borderBottom: '1px solid var(--admin-border)' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 600, textTransform: 'capitalize' }}>{row.sport}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--admin-font-mono)' }}>{num(row.betsCount)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>{money(row.turnover)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: row.ggr >= 0 ? '#34d399' : '#f87171' }}>{money(row.ggr)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: '#38bdf8' }}>{row.holdPct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </AdminCard>

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
