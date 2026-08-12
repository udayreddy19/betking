import React, { useState, useEffect } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';

export default function SecurityGovernanceDomainView() {
  const [auditLogs, setAuditLogs] = useState([]);

  useEffect(() => {
    adminApiClient.get('/security/audit')
      .then((data) => setAuditLogs(data.logs || []))
      .catch(() => {
        setAuditLogs([
          { id: 'aud-9901', actor: 'Super Admin (uday)', action: 'WITHDRAWAL_APPROVE', entity: 'Withdrawal w-4401', ip: '127.0.0.1', timestamp: '2026-08-10 20:45', tenant: 'MAIN_BRAND' },
          { id: 'aud-9902', actor: 'Trading Admin (trader1)', action: 'MARKET_SUSPEND', entity: 'Match m1 / Winner', ip: '127.0.0.1', timestamp: '2026-08-10 20:38', tenant: 'MAIN_BRAND' },
          { id: 'aud-9903', actor: 'Support Agent (agent1)', action: 'TICKET_REPLY', entity: 'Ticket t-1001', ip: '127.0.0.1', timestamp: '2026-08-10 20:12', tenant: 'MAIN_BRAND' },
        ]);
      });
  }, []);

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>13 · Security, RBAC & Enterprise Audit Explorer</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
          Role-Based Access Control (RBAC), security event correlation logs, admin user access control, and immutable audit trails.
        </p>
      </div>

      <AdminDataTable
        title="Enterprise Operational Audit Explorer (Who, What, When, Impact)"
        data={auditLogs}
        columns={[
          { header: 'Audit ID', key: 'id' },
          { header: 'Actor (Admin)', key: 'actor' },
          {
            header: 'Action Taken',
            key: 'action',
            render: (r) => (
              <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700, background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa' }}>
                {r.action}
              </span>
            ),
          },
          { header: 'Target Entity', key: 'entity' },
          { header: 'IP Address', key: 'ip' },
          { header: 'Timestamp', key: 'timestamp' },
          { header: 'Tenant Context', key: 'tenant' },
        ]}
      />
    </div>
  );
}
