import React, { useState, useEffect, useMemo } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import { useAdminToast } from '../components/AdminToastContext';

const FAILED_STATUSES = new Set(['FAILED', 'ERROR', 'DEAD_LETTER', 'DLQ', 'BOUNCED', 'REJECTED']);

export default function CommunicationsDomainView({ subModule = 'dispatch-logs' }) {
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState(null);
  const { showToast } = useAdminToast();

  useEffect(() => {
    let cancelled = false;
    adminApiClient.get('/communications/logs')
      .then((data) => {
        if (cancelled) return;
        setLogs(data.logs || []);
        setError(data.note || null);
      })
      .catch((err) => {
        if (cancelled) return;
        setLogs([]);
        setError(err.message || 'Failed to load communication logs');
      });
    return () => { cancelled = true; };
  }, []);

  const templates = useMemo(() => {
    const map = new Map();
    logs.forEach((log) => {
      const key = log.template || 'unknown';
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          template: key,
          channel: log.channel || '—',
          provider: log.provider || '—',
          deliveries: 0,
          lastSent: log.sentAt || '—',
        });
      }
      const row = map.get(key);
      row.deliveries += 1;
      if (log.sentAt && log.sentAt > row.lastSent) row.lastSent = log.sentAt;
    });
    return Array.from(map.values());
  }, [logs]);

  const failedLogs = useMemo(
    () => logs.filter((log) => FAILED_STATUSES.has(String(log.status || '').toUpperCase())),
    [logs],
  );

  const handleRetry = (log) => {
    adminApiClient.post(`/communications/logs/${encodeURIComponent(log.id)}/retry`)
      .then(() => {
        showToast(`Retry queued for ${log.id}`, 'success');
        setLogs((prev) => prev.map((row) => (row.id === log.id ? { ...row, status: 'QUEUED' } : row)));
      })
      .catch((err) => showToast(err.message || 'Retry failed', 'error'));
  };

  const titles = {
    'dispatch-logs': ['09 · Notification Delivery Logs', 'Webhook / notification delivery records from the database.', 'Notification Delivery Logs', logs],
    templates: ['09 · Message Templates', 'Distinct templates inferred from recent delivery logs.', 'Active Message Templates', templates],
    'dlq-retry': ['09 · Dead Letter Queue Retries', 'Failed or rejected deliveries eligible for manual retry.', 'Failed Deliveries (DLQ)', failedLogs],
  };
  const [heading, hint, tableTitle, data] = titles[subModule] || titles['dispatch-logs'];

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>{heading}</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
          {hint}
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#fbbf24', fontSize: '0.82rem' }}>{error}</p>}
      </div>

      {subModule === 'templates' ? (
        <AdminDataTable
          title={tableTitle}
          emptyMessage="No templates found in delivery logs yet"
          data={data}
          columns={[
            { header: 'Template ID', key: 'template' },
            { header: 'Channel', key: 'channel' },
            { header: 'Provider', key: 'provider' },
            { header: 'Deliveries', key: 'deliveries' },
            { header: 'Last Sent', key: 'lastSent' },
          ]}
        />
      ) : (
        <AdminDataTable
          title={tableTitle}
          emptyMessage={subModule === 'dlq-retry' ? 'No failed deliveries in DLQ' : 'No notification deliveries recorded yet'}
          data={data}
          columns={[
            { header: 'Message ID', key: 'id' },
            { header: 'Channel', key: 'channel' },
            { header: 'Recipient', key: 'recipient' },
            { header: 'Template', key: 'template' },
            { header: 'Provider', key: 'provider' },
            {
              header: 'Status',
              key: 'status',
              render: (r) => (
                <span style={{
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  background: r.status === 'DELIVERED' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                  color: r.status === 'DELIVERED' ? '#10b981' : '#f87171',
                }}>
                  {r.status}
                </span>
              ),
            },
            { header: 'Sent At', key: 'sentAt' },
            ...(subModule === 'dlq-retry' ? [{
              header: 'Retry',
              key: 'retry',
              sortable: false,
              render: (r) => (
                <button
                  type="button"
                  onClick={() => handleRetry(r)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '4px',
                    border: '1px solid var(--admin-border, var(--color-border))',
                    background: 'rgba(59, 130, 246, 0.15)',
                    color: '#60a5fa',
                    cursor: 'pointer',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                  }}
                >
                  Queue Retry
                </button>
              ),
            }] : []),
          ]}
        />
      )}
    </div>
  );
}
