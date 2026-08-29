import React from 'react';
import AdminKPI from '../../components/AdminKPI';

export default function ApiSummaryCards({ summary = {}, onFilter }) {
  return (
    <div className="admin-kpi-grid api-explorer__kpis">
      <AdminKPI
        label="Total APIs"
        value={summary.total ?? '—'}
        accent="var(--admin-primary)"
        onClick={onFilter ? () => onFilter('ALL') : undefined}
      />
      <AdminKPI
        label="Healthy"
        value={summary.healthy ?? '—'}
        accent="var(--admin-success)"
        onClick={onFilter ? () => onFilter('HEALTHY') : undefined}
      />
      <AdminKPI
        label="Failed"
        value={summary.failed ?? '—'}
        accent="var(--admin-danger)"
        onClick={onFilter ? () => onFilter('FAILED') : undefined}
      />
      <AdminKPI
        label="Not Configured"
        value={summary.notConfigured ?? '—'}
        accent="#64748b"
        onClick={onFilter ? () => onFilter('NOT_CONFIGURED') : undefined}
      />
      <AdminKPI
        label="Avg Response"
        value={summary.averageResponseTimeMs != null ? `${summary.averageResponseTimeMs}ms` : '—'}
        accent="var(--admin-info)"
      />
    </div>
  );
}
