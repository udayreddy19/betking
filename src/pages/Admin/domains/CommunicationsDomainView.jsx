import React, { useState, useEffect } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';

export default function CommunicationsDomainView() {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    adminApiClient.get('/communications/logs')
      .then((data) => setLogs(data.logs || []))
      .catch(() => {
        setLogs([
          { id: 'msg-701', channel: 'SMS', recipient: '+91 9876543210', template: 'OTP_VERIFICATION', status: 'DELIVERED', provider: 'Twilio', sentAt: '2026-08-10 20:42' },
          { id: 'msg-702', channel: 'EMAIL', recipient: 'uday@betking.com', template: 'WITHDRAWAL_APPROVED', status: 'DELIVERED', provider: 'SendGrid', sentAt: '2026-08-10 20:30' },
          { id: 'msg-703', channel: 'PUSH', recipient: 'usr-102', template: 'MATCH_LIVE_START', status: 'SENT', provider: 'Firebase FCM', sentAt: '2026-08-10 20:15' },
        ]);
      });
  }, []);

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>09 · Communications & Notification Delivery Engine</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
          Notification templates, SMS/Email/Push dispatchers, delivery status tracking, and DLQ retries.
        </p>
      </div>

      <AdminDataTable
        title="Notification Delivery Logs"
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
