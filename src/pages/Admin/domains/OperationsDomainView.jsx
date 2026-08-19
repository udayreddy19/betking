import React, { useState, useEffect } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import { startVisibleInterval } from '../utils/visibleInterval';

function statusBadge(status) {
  const s = String(status || 'UNKNOWN').toUpperCase();
  const ok = s === 'HEALTHY' || s === 'OK' || s === 'CONFIGURED' || s === 'ACTIVE';
  const bad = s === 'DOWN' || s === 'DEGRADED' || s === 'ERROR' || s === 'FAILED' || s === 'NOT_CONFIGURED';
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
}

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
      { label: 'Pending', value: metrics.pending },
      { label: 'Processing', value: metrics.processing },
      { label: 'Processed', value: metrics.processed },
      { label: 'Failed', value: metrics.failed },
      { label: 'Dead Letter', value: metrics.deadLetter },
      { label: 'Total Events', value: metrics.totalEvents },
    ] : [];

    return (
      <div>
        <div style={{ marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>12 · Outbox Worker Telemetry</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted, var(--color-text-muted))', fontSize: '0.85rem' }}>
            Transactional outbox queue depth and in-flight events. Refreshes every 30s.
          </p>
          {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.82rem' }}>{error}</p>}
        </div>

        {metricRows.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: 12,
            marginBottom: 24,
          }}>
            {metricRows.map((m) => (
              <div key={m.label} style={{
                padding: '14px 16px',
                borderRadius: 10,
                border: '1px solid var(--admin-border, var(--color-border))',
                background: 'var(--admin-panel, var(--color-panel))',
              }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--admin-text-muted)', textTransform: 'uppercase' }}>{m.label}</div>
                <div style={{ marginTop: 6, fontSize: '1.35rem', fontWeight: 800 }}>{m.value ?? '—'}</div>
              </div>
            ))}
          </div>
        )}

        <AdminDataTable
          title="Active Outbox Events"
          emptyMessage="No pending or failed outbox events"
          data={outboxEvents}
          columns={[
            { header: 'Event ID', key: 'id' },
            { header: 'Type', key: 'eventType' },
            { header: 'Aggregate', key: 'aggregateType' },
            { header: 'Aggregate ID', key: 'aggregateId' },
            { header: 'Status', key: 'status', render: (r) => statusBadge(r.status) },
            { header: 'Created At', key: 'createdAt' },
          ]}
        />
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>12 · Infrastructure Health Matrix</h2>
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
          { header: 'Health Status', key: 'status', render: (r) => statusBadge(r.status) },
          { header: 'Latency / Mode', key: 'latency' },
          { header: 'Detail', key: 'uptime' },
        ]}
      />
    </div>
  );
}
