import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import { useAdminToast } from '../components/AdminToastContext';

function money(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `₹${Number(n).toLocaleString()}`;
}

function kycBadge(status) {
  const s = String(status || '').toUpperCase();
  const ok = s.includes('VERIF') || s === 'APPROVED';
  const rejected = s === 'REJECTED';
  return (
    <span style={{
      padding: '2px 8px',
      borderRadius: '4px',
      fontSize: '0.75rem',
      fontWeight: 700,
      background: ok ? 'rgba(16, 185, 129, 0.2)' : rejected ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.2)',
      color: ok ? '#10b981' : rejected ? '#ef4444' : '#f59e0b',
    }}
    >
      {status || '—'}
    </span>
  );
}

export default function CustomersDomainView({ subModule = 'directory' }) {
  const [users, setUsers] = useState([]);
  const [kycCases, setKycCases] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [user360, setUser360] = useState(null);
  const [error, setError] = useState(null);
  const [kycLoading, setKycLoading] = useState(false);
  const [actingId, setActingId] = useState(null);
  const { showToast } = useAdminToast();

  const loadCustomers = useCallback(() => {
    let cancelled = false;
    adminApiClient.get('/customers')
      .then((data) => {
        if (cancelled) return;
        setUsers(data.users || []);
        if (subModule !== 'kyc-queue') setError(data.note || null);
      })
      .catch((err) => {
        if (cancelled) return;
        setUsers([]);
        if (subModule !== 'kyc-queue') setError(err.message || 'Failed to load customers');
      });
    return () => { cancelled = true; };
  }, [subModule]);

  const loadKycQueue = useCallback(() => {
    if (subModule !== 'kyc-queue') return undefined;
    let cancelled = false;
    setKycLoading(true);
    adminApiClient.get('/kyc/cases?status=PENDING_QUEUE')
      .then((data) => {
        if (cancelled) return;
        setKycCases(data.cases || []);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setKycCases([]);
        setError(err.message || 'Failed to load KYC queue');
      })
      .finally(() => {
        if (!cancelled) setKycLoading(false);
      });
    return () => { cancelled = true; };
  }, [subModule]);

  useEffect(() => loadCustomers(), [loadCustomers]);
  useEffect(() => loadKycQueue(), [loadKycQueue]);

  const open360 = (user) => {
    setSelectedUser(user);
    setUser360(null);
    adminApiClient.get(`/users/${encodeURIComponent(user.id)}/360`)
      .then((data) => setUser360(data))
      .catch(() => setUser360(null));
  };

  const handleKycDecision = async (row, decision) => {
    const caseId = row.caseId || row.id;
    const userId = row.userId || row.id;
    let notes = decision === 'VERIFIED' ? 'Approved from KYC queue' : '';
    if (decision === 'REJECTED') {
      const reason = window.prompt('Rejection reason (shown in audit log):', 'Documents could not be verified');
      if (reason == null) return;
      notes = reason.trim() || 'Rejected from KYC queue';
    }

    setActingId(caseId || userId);
    try {
      await adminApiClient.post('/kyc/verify', { caseId, userId, decision, notes });
      showToast(
        decision === 'VERIFIED'
          ? `KYC approved for ${row.name || userId}`
          : `KYC rejected for ${row.name || userId}`,
        decision === 'VERIFIED' ? 'success' : 'warning',
      );
      setKycCases((prev) => prev.filter((c) => (c.caseId || c.userId) !== caseId && c.userId !== userId));
      loadKycQueue();
    } catch (err) {
      showToast(err.message || 'KYC decision failed', 'error');
    } finally {
      setActingId(null);
    }
  };

  const handleRestrict = (user) => {
    adminApiClient.post(`/customers/${user.id}/restrict`, { action: 'TEMPORARY_RESTRICTION', reason: 'Risk Audit' })
      .then(() => {
        showToast(`User ${user.id} restricted.`, 'success');
        setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, status: 'RESTRICTED' } : u)));
      })
      .catch((err) => showToast(err.message || 'Restrict failed', 'error'));
  };

  const filtered = useMemo(() => {
    if (subModule === 'kyc-queue') {
      if (kycCases.length) {
        return kycCases.map((c) => ({
          id: c.userId || c.caseId,
          caseId: c.caseId,
          userId: c.userId,
          name: c.name || c.userId || '—',
          email: c.email || '—',
          phone: c.phone || '—',
          balance: c.balance,
          kyc: c.status,
          status: c.status,
          risk: '—',
          regDate: c.updatedAt || c.updated_at,
          panNumber: c.panNumber,
          aadhaarNumber: c.aadhaarNumber,
          dateOfBirth: c.dateOfBirth,
          actionable: c.actionable !== false,
        }));
      }
      return users.filter((u) => {
        const k = String(u.kyc || '').toUpperCase();
        return k && !k.includes('VERIF') && k !== 'APPROVED' && k !== 'NOT_STARTED';
      });
    }
    if (subModule === 'restrictions') {
      return users.filter((u) => {
        const s = String(u.status || '').toUpperCase();
        return s.includes('RESTRICT') || s.includes('SUSPEND') || s.includes('LOCK');
      });
    }
    if (subModule === 'responsible-gaming') {
      return users.filter((u) => String(u.risk || '').toUpperCase().includes('HIGH') || String(u.status || '').toUpperCase().includes('SELF'));
    }
    return users;
  }, [users, subModule, kycCases]);

  const titles = {
    directory: ['02 · Customer Directory', 'Live customer directory from PostgreSQL.', 'Customer Directory'],
    'kyc-queue': ['02 · KYC Verification Queue', 'Review submitted PAN / Aadhaar and approve or reject identity verification.', 'KYC Queue'],
    restrictions: ['02 · Account Restrictions', 'Restricted / suspended accounts requiring review.', 'Restricted Accounts'],
    'responsible-gaming': ['02 · Responsible Gaming Safeguards', 'High-risk or self-exclusion related accounts.', 'RG Watchlist'],
  };
  const [heading, hint, tableTitle] = titles[subModule] || titles.directory;

  const columns = [
    { header: 'User ID', key: 'id' },
    { header: 'Full Name', key: 'name' },
    { header: 'Contact Email', key: 'email' },
    { header: 'Phone', key: 'phone', render: (r) => r.phone || '—' },
    { header: 'Wallet Balance', key: 'balance', render: (r) => money(r.balance) },
    {
      header: 'KYC Status',
      key: 'kyc',
      render: (r) => kycBadge(r.kyc),
    },
  ];

  if (subModule === 'kyc-queue') {
    columns.push(
      { header: 'DOB', key: 'dateOfBirth', render: (r) => r.dateOfBirth || '—' },
      { header: 'PAN', key: 'panNumber', render: (r) => r.panNumber || '—' },
      { header: 'Aadhaar', key: 'aadhaarNumber', render: (r) => r.aadhaarNumber || '—' },
    );
  } else {
    columns.push({ header: 'Account Status', key: 'status' });
  }

  columns.push({
    header: 'Actions',
    key: 'actions',
    sortable: false,
    render: (r) => {
      const busy = actingId && (actingId === r.caseId || actingId === r.id || actingId === r.userId);
      return (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => open360(r)}
            style={{ padding: '4px 10px', borderRadius: '4px', border: '1px solid var(--admin-border, var(--color-border))', background: 'var(--admin-panel, var(--color-panel))', color: '#60a5fa', cursor: 'pointer', fontSize: '0.78rem' }}
          >
            Customer 360
          </button>
          {subModule === 'kyc-queue' && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => handleKycDecision(r, 'VERIFIED')}
                style={{ padding: '4px 10px', borderRadius: '4px', border: '1px solid rgba(16, 185, 129, 0.35)', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', cursor: busy ? 'wait' : 'pointer', fontSize: '0.78rem', fontWeight: 700 }}
              >
                {busy ? '…' : 'Approve KYC'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => handleKycDecision(r, 'REJECTED')}
                style={{ padding: '4px 10px', borderRadius: '4px', border: '1px solid rgba(239, 68, 68, 0.35)', background: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', cursor: busy ? 'wait' : 'pointer', fontSize: '0.78rem', fontWeight: 700 }}
              >
                Reject
              </button>
            </>
          )}
          {subModule !== 'kyc-queue' && (
            <button
              type="button"
              onClick={() => handleRestrict(r)}
              style={{ padding: '4px 10px', borderRadius: '4px', border: '1px solid var(--admin-border, var(--color-border))', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', cursor: 'pointer', fontSize: '0.78rem' }}
            >
              Restrict
            </button>
          )}
        </div>
      );
    },
  });

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>{heading}</h2>
          {subModule === 'kyc-queue' && (
            <button
              type="button"
              onClick={() => loadKycQueue()}
              style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--admin-border, var(--color-border))', background: 'var(--admin-panel, var(--color-panel))', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 }}
            >
              {kycLoading ? 'Refreshing…' : 'Refresh queue'}
            </button>
          )}
        </div>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted, var(--color-text-muted))', fontSize: '0.85rem' }}>
          {hint}
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.82rem' }}>{error}</p>}
      </div>

      <AdminDataTable
        title={tableTitle}
        emptyMessage={kycLoading ? 'Loading KYC cases…' : (subModule === 'kyc-queue' ? 'No KYC submissions waiting for review' : 'No matching customers')}
        data={filtered}
        columns={columns}
      />

      {selectedUser && (
        <div style={{ marginTop: '24px', padding: '20px', background: 'var(--admin-surface, var(--color-surface))', border: '1px solid var(--admin-border, var(--color-border))', borderRadius: '12px', boxShadow: 'var(--admin-shadow)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Customer 360: {selectedUser.name} ({selectedUser.id})</h3>
            <button type="button" onClick={() => { setSelectedUser(null); setUser360(null); }} style={{ background: 'none', border: 'none', color: 'var(--admin-text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', margin: '16px 0' }}>
            <div><strong>Registration:</strong> {selectedUser.regDate || '—'}</div>
            <div><strong>KYC:</strong> {selectedUser.kyc}</div>
            <div><strong>PAN:</strong> {selectedUser.panNumber || '—'}</div>
            <div><strong>Aadhaar:</strong> {selectedUser.aadhaarNumber || '—'}</div>
            <div><strong>DOB:</strong> {selectedUser.dateOfBirth || '—'}</div>
            <div><strong>Balance:</strong> {money(user360?.wallet?.balance ?? selectedUser.balance)}</div>
          </div>
          {subModule === 'kyc-queue' && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => handleKycDecision(selectedUser, 'VERIFIED')}
                style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', background: '#10b981', color: '#fff', fontWeight: 800, cursor: 'pointer' }}
              >
                Approve KYC
              </button>
              <button
                type="button"
                onClick={() => handleKycDecision(selectedUser, 'REJECTED')}
                style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', background: '#ef4444', color: '#fff', fontWeight: 800, cursor: 'pointer' }}
              >
                Reject KYC
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
