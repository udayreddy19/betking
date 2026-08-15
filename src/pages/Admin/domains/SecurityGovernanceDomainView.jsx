import React, { useState, useEffect } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import { ADMIN_ROLES } from '../permissions/AdminRBACGate';

export default function SecurityGovernanceDomainView() {
  const [auditLogs, setAuditLogs] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    adminApiClient.get('/security/audit')
      .then((data) => {
        if (cancelled) return;
        setAuditLogs(data.logs || []);
        setError(data.note || null);
      })
      .catch((err) => {
        if (cancelled) return;
        setAuditLogs([]);
        setError(err.message || 'Failed to load audit logs');
      });
    return () => { cancelled = true; };
  }, []);

  const rbacRows = Object.keys(ADMIN_ROLES).map((role) => ({
    id: role,
    role,
    access: role === 'SUPER_ADMIN' ? 'ALL DOMAINS' : 'SCOPED',
  }));

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>13 · Security, RBAC & Enterprise Audit Explorer</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
          Audit trail from `audit_events` (plus in-memory fallback if the table is empty).
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#fbbf24', fontSize: '0.82rem' }}>{error}</p>}
      </div>

      <AdminDataTable
        title="RBAC Role Matrix"
        searchable={false}
        data={rbacRows}
        columns={[
          { header: 'Role', key: 'role' },
          { header: 'Access Model', key: 'access' },
        ]}
      />

      <AdminDataTable
        title="Enterprise Operational Audit Explorer"
        emptyMessage="No audit events recorded yet — perform an admin action to generate one"
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
