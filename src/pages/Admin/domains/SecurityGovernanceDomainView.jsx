import React, { useState, useEffect } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import { StatusBadge } from '../components/AdminBadge';
import { ADMIN_ROLES, ROLE_ALLOWED_DOMAINS } from '../permissions/AdminRBACGate';

export default function SecurityGovernanceDomainView({ subModule = 'audit-trail' }) {
  const [auditLogs, setAuditLogs] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (subModule === 'rbac-matrix') return undefined;
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
  }, [subModule]);

  const rbacRows = Object.keys(ADMIN_ROLES).map((role) => {
    const allowed = ROLE_ALLOWED_DOMAINS[role];
    return {
      id: role,
      role,
      access: role === 'SUPER_ADMIN'
        ? 'ALL DOMAINS'
        : (allowed?.length ? allowed.join(', ') : 'ROLE-MATCHED DOMAINS ONLY'),
    };
  });

  if (subModule === 'rbac-matrix') {
    return (
      <div>
        <div style={{ marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>13 · RBAC Role Matrix</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
            Role-to-domain access map used by the admin shell gate. Domains with no required role are open to all authenticated admins.
          </p>
        </div>

        <AdminDataTable
          title="RBAC Role Matrix"
          searchable={false}
          data={rbacRows}
          columns={[
            { header: 'Role', key: 'role', render: (r) => <span className="admin-text-mono" style={{ fontWeight: 800 }}>{r.role}</span> },
            { header: 'Allowed Domains', key: 'access', render: (r) => (
              <span className={`admin-badge ${r.access === 'ALL DOMAINS' ? 'admin-badge--success' : 'admin-badge--info'}`}>
                {r.access}
              </span>
            )},
          ]}
        />
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>13 · Enterprise Audit Explorer</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          Audit trail from `audit_events` (plus in-memory fallback if the table is empty).
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#fbbf24', fontSize: '0.78rem' }}>{error}</p>}
      </div>

      <AdminDataTable
        title="Enterprise Operational Audit Explorer"
        emptyMessage="No audit events recorded yet — perform an admin action to generate one"
        data={auditLogs}
        columns={[
          { header: 'Audit ID', key: 'id', render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.76rem' }}>{r.id}</span> },
          { header: 'Actor (Admin)', key: 'actor', render: (r) => <span style={{ fontWeight: 700 }}>{r.actor}</span> },
          {
            header: 'Action Taken',
            key: 'action',
            render: (r) => <StatusBadge status={r.action} />,
          },
          { header: 'Target Entity', key: 'entity' },
          { header: 'IP Address', key: 'ip', render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.76rem' }}>{r.ip}</span> },
          { header: 'Timestamp', key: 'timestamp' },
          { header: 'Tenant Context', key: 'tenant' },
        ]}
      />
    </div>
  );
}
