import React, { useState, useEffect } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import { useAdminToast } from '../components/AdminToastContext';
import { StatusBadge } from '../components/AdminBadge';

export default function AnalyticsDomainView({ subModule = 'turnover-ggr' }) {
  const [reports, setReports] = useState([]);
  const [error, setError] = useState(null);
  const { showToast } = useAdminToast();

  useEffect(() => {
    let cancelled = false;
    adminApiClient.get('/analytics/reports')
      .then((data) => {
        if (cancelled) return;
        setReports(data.reports || []);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setReports([]);
        setError(err.message || 'Failed to load analytics');
      });
    return () => { cancelled = true; };
  }, []);

  const turnoverReports = reports.filter((r) => /turnover|ggr|stake|open.?bet/i.test(`${r.name} ${r.id}`));
  const displayReports = subModule === 'bi-exporter' ? reports : turnoverReports;

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

  const heading = subModule === 'bi-exporter'
    ? '10 · Custom BI Data Exporter'
    : '10 · Turnover & GGR Reports';
  const hint = subModule === 'bi-exporter'
    ? 'Export operational snapshots as JSON for downstream BI pipelines.'
    : 'Stake turnover and open-bets exposure from live Postgres queries.';

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>{heading}</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          {hint}
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.78rem' }}>{error}</p>}
      </div>

      <AdminDataTable
        title={subModule === 'bi-exporter' ? 'Exportable Operational Reports' : 'Turnover & Exposure Reports'}
        emptyMessage={subModule === 'bi-exporter' ? 'No analytics available' : 'No turnover reports available yet'}
        data={displayReports}
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
