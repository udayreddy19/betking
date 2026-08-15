import React, { useState, useEffect } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import { startVisibleInterval } from '../utils/visibleInterval';

export default function OperationsDomainView() {
  const [services, setServices] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      adminApiClient.get('/operations/health')
        .then((data) => {
          if (cancelled) return;
          setServices(data.services || []);
          setError(null);
        })
        .catch((err) => {
          if (cancelled) return;
          setServices([]);
          setError(err.message || 'Failed to load health matrix');
        });
    };
    const stop = startVisibleInterval(load, 30000, { runImmediately: true });
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>12 · Systems Health & DevOps Operational Telemetry</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted, var(--color-text-muted))', fontSize: '0.85rem' }}>
          Live Postgres ping + aggregator provider status. Unknown services stay UNKNOWN (not faked healthy).
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.82rem' }}>{error}</p>}
      </div>

      <AdminDataTable
        title="Service & Infrastructure Health Checks"
        emptyMessage="No health signals yet"
        data={services}
        columns={[
          { header: 'Service / Dependency', key: 'service' },
          {
            header: 'Health Status',
            key: 'status',
            render: (r) => {
              const s = String(r.status || 'UNKNOWN').toUpperCase();
              const ok = s === 'HEALTHY' || s === 'OK';
              const bad = s === 'DOWN' || s === 'DEGRADED' || s === 'ERROR';
              return (
                <span style={{
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  background: ok ? 'rgba(16, 185, 129, 0.2)' : bad ? 'rgba(239, 68, 68, 0.2)' : 'rgba(148, 163, 184, 0.2)',
                  color: ok ? '#10b981' : bad ? '#f87171' : '#94a3b8',
                }}>
                  {s}
                </span>
              );
            },
          },
          { header: 'Latency / Mode', key: 'latency' },
          { header: 'Detail', key: 'uptime' },
        ]}
      />
    </div>
  );
}
