import React, { useCallback, useState } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import AdminDrawer from '../components/AdminDrawer';

function fmtCell(v) {
  if (v == null) return '—';
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

/**
 * Shared KPI click → drawer drill-down (same UX as Production Health Errors tile).
 */
export function useAdminKpiDrilldown() {
  const [metric, setMetric] = useState(null);
  const [label, setLabel] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const openDrilldown = useCallback((metricKey, displayLabel) => {
    const key = String(metricKey || '').trim();
    if (!key) return;
    setMetric(key);
    setLabel(displayLabel || key);
    setData(null);
    setError(null);
    setLoading(true);
    adminApiClient
      .get(`/operations/kpi-drilldown?metric=${encodeURIComponent(key)}&limit=100`)
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((err) => {
        setError(err?.message || 'Could not load details');
        setData(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const closeDrilldown = useCallback(() => {
    setMetric(null);
    setLabel('');
    setData(null);
    setError(null);
    setLoading(false);
  }, []);

  return {
    openDrilldown,
    closeDrilldown,
    isOpen: !!metric,
    metric,
    label,
    data,
    loading,
    error,
  };
}

export function AdminKpiDrillDrawer({ drill }) {
  if (!drill) return null;
  const { isOpen, closeDrilldown, openDrilldown, metric, label, data, loading, error } = drill;

  const columns = (data?.columns || []).map((c) => ({
    key: c.key,
    header: c.header || c.key,
    render: (row) => fmtCell(row[c.key]),
  }));

  return (
    <AdminDrawer
      isOpen={isOpen}
      onClose={closeDrilldown}
      title={data?.title || label || 'Metric details'}
      subtitle={data?.note || (metric ? `Metric: ${metric}` : '')}
      width={720}
    >
      <AdminDataTable
        title={label || 'Details'}
        columns={columns.length ? columns : [
          { key: 'id', header: 'ID' },
          { key: 'detail', header: 'Detail' },
        ]}
        data={data?.rows || []}
        loading={loading}
        error={error}
        emptyMessage={loading ? 'Loading…' : 'No detail rows for this metric'}
        onRefresh={metric ? () => openDrilldown(metric, label) : undefined}
        pageSize={25}
        searchable
      />
    </AdminDrawer>
  );
}

export default useAdminKpiDrilldown;
