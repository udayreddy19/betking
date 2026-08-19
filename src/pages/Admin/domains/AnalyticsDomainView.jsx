import React, { useState, useEffect } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import { useAdminToast } from '../components/AdminToastContext';

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
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>{heading}</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
          {hint}
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.82rem' }}>{error}</p>}
      </div>

      <AdminDataTable
        title={subModule === 'bi-exporter' ? 'Exportable Operational Reports' : 'Turnover & Exposure Reports'}
        emptyMessage={subModule === 'bi-exporter' ? 'No analytics available' : 'No turnover reports available yet'}
        data={displayReports}
        columns={[
          { header: 'Report ID', key: 'id' },
          { header: 'Report Name', key: 'name' },
          { header: 'Frequency', key: 'frequency' },
          { header: 'Detail', key: 'detail', render: (r) => r.detail || r.format || '—' },
          { header: 'Last Generated', key: 'lastGenerated' },
          {
            header: 'Status',
            key: 'status',
            render: (r) => (
              <span style={{
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '0.75rem',
                fontWeight: 700,
                background: r.status === 'READY' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                color: r.status === 'READY' ? '#10b981' : '#f59e0b',
              }}>
                {r.status}
              </span>
            ),
          },
          ...(subModule === 'bi-exporter' ? [{
            header: 'Export',
            key: 'export',
            sortable: false,
            render: (r) => (
              <button
                type="button"
                onClick={() => exportReport(r)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  border: '1px solid var(--admin-border, var(--color-border))',
                  background: 'var(--admin-panel, var(--color-panel))',
                  color: '#60a5fa',
                  cursor: 'pointer',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                }}
              >
                Download JSON
              </button>
            ),
          }] : []),
        ]}
      />
    </div>
  );
}
