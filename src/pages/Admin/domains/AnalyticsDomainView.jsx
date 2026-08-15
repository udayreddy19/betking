import React, { useState, useEffect } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';

export default function AnalyticsDomainView() {
  const [reports, setReports] = useState([]);
  const [error, setError] = useState(null);

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

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>10 · Business Intelligence & Executive Analytics</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
          On-demand operational reports from live feeds + ledger tables (no fabricated GGR).
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.82rem' }}>{error}</p>}
      </div>

      <AdminDataTable
        title="Operational Analytics Reports"
        emptyMessage="No analytics available"
        data={reports}
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
        ]}
      />
    </div>
  );
}
