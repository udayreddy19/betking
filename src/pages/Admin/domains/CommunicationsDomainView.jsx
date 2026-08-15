import React, { useState, useEffect } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';

export default function CommunicationsDomainView() {
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState(null);

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

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>09 · Communications & Notification Delivery Engine</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
          Webhook / notification delivery records from the database.
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#fbbf24', fontSize: '0.82rem' }}>{error}</p>}
      </div>

      <AdminDataTable
        title="Notification Delivery Logs"
        emptyMessage="No notification deliveries recorded yet"
        data={logs}
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
              <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700, background: r.status === 'DELIVERED' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(59, 130, 246, 0.2)', color: r.status === 'DELIVERED' ? '#10b981' : '#60a5fa' }}>
                {r.status}
              </span>
            ),
          },
          { header: 'Sent At', key: 'sentAt' },
        ]}
      />
    </div>
  );
}
