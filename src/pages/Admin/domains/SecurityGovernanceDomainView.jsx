import React, { useState, useEffect, useMemo } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import { StatusBadge } from '../components/AdminBadge';
import { ADMIN_ROLES, ROLE_ALLOWED_DOMAINS } from '../permissions/AdminRBACGate';
import { useAdminToast } from '../components/AdminToastContext';

function fmtTs(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v);
  }
}

function SessionsPanel() {
  const [sessions, setSessions] = useState([]);
  const [logins, setLogins] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const { showToast } = useAdminToast();

  const load = () => {
    Promise.all([
      adminApiClient.get('/security/sessions'),
      adminApiClient.get('/security/logins?limit=40'),
    ])
      .then(([s, l]) => {
        setSessions(s.sessions || []);
        setLogins(l.logins || []);
        setError(null);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load sessions');
        setSessions([]);
        setLogins([]);
      });
  };

  useEffect(() => { load(); }, []);

  const terminate = async (row) => {
    const reason = window.prompt('Reason for session revoke (required):');
    if (!reason) return;
    setBusy(row.session_id);
    try {
      await adminApiClient.post(`/security/sessions/${encodeURIComponent(row.session_id)}/terminate`, { reason });
      showToast('Session revoked', 'success');
      load();
    } catch (err) {
      showToast(err.message || 'Revoke failed', 'error');
    } finally {
      setBusy(null);
    }
  };

  const forceLogout = async (adminId) => {
    const reason = window.prompt(`Force logout all sessions for ${adminId}? Reason:`);
    if (!reason) return;
    setBusy(adminId);
    try {
      await adminApiClient.post(`/security/force-logout/${encodeURIComponent(adminId)}`, { reason });
      showToast('All sessions revoked', 'success');
      load();
    } catch (err) {
      showToast(err.message || 'Force logout failed', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>Admin Sessions</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          Active admin sessions and recent login history. Revoke does not rewrite JWT expiry; pairs with session records for observability.
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#fbbf24', fontSize: '0.78rem' }}>{error}</p>}
      </div>
      <AdminDataTable
        title="Active Sessions"
        emptyMessage="No active admin sessions recorded"
        data={sessions}
        columns={[
          { header: 'Session', key: 'session_id', render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.72rem' }}>{r.session_id}</span> },
          { header: 'Admin', key: 'admin_id' },
          { header: 'Device', key: 'device_type' },
          { header: 'IP', key: 'ip_address', render: (r) => <span className="admin-text-mono">{r.ip_address}</span> },
          { header: 'MFA', key: 'mfa_verified', render: (r) => <StatusBadge status={r.mfa_verified ? 'YES' : 'NO'} /> },
          { header: 'Started', key: 'started_at', render: (r) => fmtTs(r.started_at) },
          { header: 'Last active', key: 'last_active_at', render: (r) => fmtTs(r.last_active_at) },
          {
            header: 'Actions',
            key: 'actions',
            render: (r) => (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button type="button" className="admin-btn admin-btn--sm" disabled={busy === r.session_id} onClick={() => terminate(r)}>
                  Revoke
                </button>
                <button type="button" className="admin-btn admin-btn--sm admin-btn--danger" disabled={busy === r.admin_id} onClick={() => forceLogout(r.admin_id)}>
                  Revoke all
                </button>
              </div>
            ),
          },
        ]}
      />
      <div style={{ height: 16 }} />
      <AdminDataTable
        title="Login History"
        emptyMessage="No login history"
        data={logins}
        columns={[
          { header: 'Admin', key: 'admin_id' },
          { header: 'Success', key: 'success', render: (r) => <StatusBadge status={r.success ? 'OK' : 'FAIL'} /> },
          { header: 'IP', key: 'ip_address' },
          { header: 'MFA', key: 'mfa_used', render: (r) => (r.mfa_used ? 'Yes' : 'No') },
          { header: 'Reason', key: 'failure_reason' },
          { header: 'When', key: 'created_at', render: (r) => fmtTs(r.created_at) },
        ]}
      />
    </div>
  );
}

function ConfigHealthPanel() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    adminApiClient.get('/security/config-health')
      .then((data) => { setHealth(data); setError(null); })
      .catch((err) => { setError(err.message); setHealth(null); });
  }, []);

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>Configuration Health</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          Safe metadata only — secret values are never shown.
        </p>
        {error && <p style={{ color: '#fbbf24' }}>{error}</p>}
        {health && (
          <p style={{ marginTop: 8 }}>
            Overall: <StatusBadge status={health.overall} /> · Env: {health.environment}
          </p>
        )}
      </div>
      <AdminDataTable
        title="Checks"
        data={health?.checks || []}
        emptyMessage="No checks loaded"
        columns={[
          { header: 'Check', key: 'id' },
          { header: 'Status', key: 'status', render: (r) => <StatusBadge status={r.status} /> },
          { header: 'Message', key: 'message' },
        ]}
      />
    </div>
  );
}

function AuditCenterPanel() {
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [filters, setFilters] = useState({
    q: '', action: '', adminId: '', riskLevel: '', ip: '', requestId: '', from: '', to: '',
  });

  const load = () => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v) params.set(k === 'q' ? 'q' : k, v);
    });
    params.set('limit', '50');
    adminApiClient.get(`/security/audit-center?${params.toString()}`)
      .then((data) => {
        setEvents(data.events || []);
        setError(null);
      })
      .catch((err) => {
        // fallback to legacy audit list
        adminApiClient.get('/security/audit')
          .then((data) => {
            setEvents((data.logs || []).map((l) => ({
              event_id: l.id,
              actor_id: l.actor,
              action: l.action,
              target_id: l.entity,
              ip_address: l.ip,
              created_at: l.timestamp,
              details: l,
            })));
            setError(data.note || err.message);
          })
          .catch((e2) => {
            setEvents([]);
            setError(e2.message || err.message);
          });
      });
  };

  useEffect(() => { load(); }, []);

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>Audit Center</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          Append-only audit_events. Admins cannot edit or delete history.
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#fbbf24', fontSize: '0.78rem' }}>{error}</p>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, marginBottom: 12 }}>
        {[
          ['q', 'Search'],
          ['adminId', 'Admin'],
          ['action', 'Action'],
          ['riskLevel', 'Risk'],
          ['ip', 'IP'],
          ['requestId', 'Request ID'],
          ['from', 'From (ISO)'],
          ['to', 'To (ISO)'],
        ].map(([key, label]) => (
          <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.72rem' }}>
            {label}
            <input
              value={filters[key]}
              onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.value }))}
              style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--admin-border)' }}
            />
          </label>
        ))}
      </div>
      <button type="button" className="admin-btn" onClick={load} style={{ marginBottom: 12 }}>Apply filters</button>

      <AdminDataTable
        title="Audit Events"
        emptyMessage="No audit events"
        data={events}
        onRowClick={setSelected}
        columns={[
          { header: 'ID', key: 'event_id', render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.72rem' }}>{r.event_id}</span> },
          { header: 'Admin', key: 'actor_id' },
          { header: 'Action', key: 'action', render: (r) => <StatusBadge status={r.action} /> },
          { header: 'Target', key: 'target_id' },
          { header: 'Risk', key: 'risk_level', render: (r) => (r.risk_level ? <StatusBadge status={r.risk_level} /> : '—') },
          { header: 'IP', key: 'ip_address' },
          { header: 'Request', key: 'request_id', render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.7rem' }}>{r.request_id || '—'}</span> },
          { header: 'When', key: 'created_at', render: (r) => fmtTs(r.created_at) },
        ]}
      />

      {selected && (
        <div
          role="dialog"
          aria-label="Audit event detail"
          style={{
            position: 'fixed', right: 0, top: 0, bottom: 0, width: 'min(420px, 100vw)',
            background: 'var(--admin-surface, #111)', borderLeft: '1px solid var(--admin-border)',
            padding: 16, overflow: 'auto', zIndex: 40,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Event detail</h3>
            <button type="button" className="admin-btn admin-btn--sm" onClick={() => setSelected(null)}>Close</button>
          </div>
          <pre style={{ fontSize: '0.75rem', whiteSpace: 'pre-wrap', marginTop: 12 }}>
            {JSON.stringify(selected, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function SecurityGovernanceDomainView({ subModule = 'audit-trail' }) {
  const rbacRows = useMemo(() => Object.keys(ADMIN_ROLES).map((role) => {
    const allowed = ROLE_ALLOWED_DOMAINS[role];
    return {
      id: role,
      role,
      access: role === 'SUPER_ADMIN'
        ? 'ALL DOMAINS'
        : (allowed?.length ? allowed.join(', ') : 'ROLE-MATCHED DOMAINS ONLY'),
    };
  }), []);

  if (subModule === 'rbac-matrix') {
    return (
      <div>
        <div style={{ marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>RBAC Role Matrix</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
            Role-to-domain access map used by the admin shell gate.
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

  if (subModule === 'sessions') return <SessionsPanel />;
  if (subModule === 'config-health') return <ConfigHealthPanel />;
  return <AuditCenterPanel />;
}
