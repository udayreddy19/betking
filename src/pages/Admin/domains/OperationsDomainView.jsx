import React, { useState, useEffect } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import { StatusBadge } from '../components/AdminBadge';
import AdminKPI from '../components/AdminKPI';
import { startVisibleInterval } from '../utils/visibleInterval';

export default function OperationsDomainView({ subModule = 'health-matrix' }) {
  const [services, setServices] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [outboxEvents, setOutboxEvents] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    if (subModule === 'outbox-queue') {
      const loadOutbox = () => {
        Promise.all([
          adminApiClient.get('/outbox/metrics'),
          adminApiClient.get('/outbox/events'),
        ])
          .then(([metricsRes, eventsRes]) => {
            if (cancelled) return;
            setMetrics(metricsRes.metrics || null);
            setOutboxEvents(eventsRes.events || []);
            setError(eventsRes.note || null);
          })
          .catch((err) => {
            if (cancelled) return;
            setMetrics(null);
            setOutboxEvents([]);
            setError(err.message || 'Failed to load outbox telemetry');
          });
      };
      const stop = startVisibleInterval(loadOutbox, 30000, { runImmediately: true });
      return () => {
        cancelled = true;
        stop();
      };
    }

    const loadHealth = () => {
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
    const stop = startVisibleInterval(loadHealth, 30000, { runImmediately: true });
    return () => {
      cancelled = true;
      stop();
    };
  }, [subModule]);

  if (subModule === 'outbox-queue') {
    const metricRows = metrics ? [
      { label: 'Pending', value: metrics.pending, accent: '#fbbf24' },
      { label: 'Processing', value: metrics.processing, accent: '#38bdf8' },
      { label: 'Processed', value: metrics.processed, accent: '#34d399' },
      { label: 'Failed', value: metrics.failed, accent: '#f43f5e' },
      { label: 'Dead Letter', value: metrics.deadLetter, accent: '#f87171' },
      { label: 'Total Events', value: metrics.totalEvents, accent: '#818cf8' },
    ] : [];

    return (
      <div>
        <div style={{ marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>12 · Outbox Worker Telemetry</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
            Transactional outbox queue depth and in-flight events. Refreshes every 30s.
          </p>
          {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.78rem' }}>{error}</p>}
        </div>

        {metricRows.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: 12,
            marginBottom: 20,
          }}>
            {metricRows.map((m) => (
              <AdminKPI
                key={m.label}
                label={m.label}
                value={m.value ?? '—'}
                accent={m.accent}
              />
            ))}
          </div>
        )}

        <AdminDataTable
          title="Active Outbox Events"
          emptyMessage="No pending or failed outbox events"
          data={outboxEvents}
          columns={[
            { header: 'Event ID', key: 'id', render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.76rem' }}>{r.id}</span> },
            { header: 'Type', key: 'eventType', render: (r) => <span className="admin-badge admin-badge--neutral">{r.eventType}</span> },
            { header: 'Aggregate', key: 'aggregateType' },
            { header: 'Aggregate ID', key: 'aggregateId', render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.76rem' }}>{r.aggregateId}</span> },
            { header: 'Status', key: 'status', render: (r) => <StatusBadge status={r.status} /> },
            { header: 'Created At', key: 'createdAt' },
          ]}
        />
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>12 · Infrastructure Health Matrix</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          Live Postgres ping + aggregator provider status. Unknown services stay UNKNOWN (not faked healthy).
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.78rem' }}>{error}</p>}
      </div>

      <AdminDataTable
        title="Service & Infrastructure Health Checks"
        emptyMessage="No health signals yet"
        data={services}
        columns={[
          { header: 'Service / Dependency', key: 'service', render: (r) => <span style={{ fontWeight: 700 }}>{r.service}</span> },
          { header: 'Health Status', key: 'status', render: (r) => <StatusBadge status={r.status} /> },
          { header: 'Latency / Mode', key: 'latency', render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.76rem' }}>{r.latency}</span> },
          { header: 'Detail', key: 'uptime' },
        ]}
      />
    </div>
  );
}
