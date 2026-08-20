import React, { useState, useEffect, useMemo } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import { useAdminToast } from '../components/AdminToastContext';

function money(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `₹${Number(n).toLocaleString()}`;
}

export default function CustomersDomainView({ subModule = 'directory' }) {
  const [users, setUsers] = useState([]);
  const [kycCases, setKycCases] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [user360, setUser360] = useState(null);
  const [error, setError] = useState(null);
  const { showToast } = useAdminToast();

  useEffect(() => {
    let cancelled = false;
    adminApiClient.get('/customers')
      .then((data) => {
        if (cancelled) return;
        setUsers(data.users || []);
        setError(data.note || null);
      })
      .catch((err) => {
        if (cancelled) return;
        setUsers([]);
        setError(err.message || 'Failed to load customers');
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (subModule !== 'kyc-queue') return undefined;
    let cancelled = false;
    adminApiClient.get('/kyc/cases?status=UNDER_REVIEW')
      .then((data) => {
        if (cancelled) return;
        setKycCases(data.cases || []);
      })
      .catch(() => {
        if (!cancelled) setKycCases([]);
      });
    return () => { cancelled = true; };
  }, [subModule]);

  const open360 = (user) => {
    setSelectedUser(user);
    setUser360(null);
    adminApiClient.get(`/users/${encodeURIComponent(user.id)}/360`)
      .then((data) => setUser360(data))
      .catch(() => setUser360(null));
  };

  const handleVerifyKyc = (row) => {
    const caseId = row.caseId || row.id;
    adminApiClient.post('/kyc/verify', { caseId, decision: 'VERIFIED', notes: 'Admin queue' })
      .then(() => {
        showToast(`KYC approved for ${caseId}`, 'success');
        setKycCases((prev) => prev.filter((c) => (c.caseId || c.id) !== caseId));
      })
      .catch((err) => showToast(err.message || 'KYC verify failed', 'error'));
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
          name: c.userId || '—',
          email: c.userId || '—',
          phone: '—',
          balance: null,
          kyc: c.status,
          status: c.status,
          risk: '—',
          regDate: c.updatedAt || c.updated_at,
        }));
      }
      return users.filter((u) => {
        const k = String(u.kyc || '').toUpperCase();
        return k && !k.includes('VERIF') && k !== 'APPROVED';
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
    'kyc-queue': ['02 · KYC Verification Queue', 'Customers whose KYC is not yet verified/approved.', 'KYC Queue'],
    restrictions: ['02 · Account Restrictions', 'Restricted / suspended accounts requiring review.', 'Restricted Accounts'],
    'responsible-gaming': ['02 · Responsible Gaming Safeguards', 'High-risk or self-exclusion related accounts.', 'RG Watchlist'],
  };
  const [heading, hint, tableTitle] = titles[subModule] || titles.directory;

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>{heading}</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted, var(--color-text-muted))', fontSize: '0.85rem' }}>
          {hint}
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.82rem' }}>{error}</p>}
      </div>

      <AdminDataTable
        title={tableTitle}
        emptyMessage="No matching customers"
        data={filtered}
        columns={[
          { header: 'User ID', key: 'id' },
          { header: 'Full Name', key: 'name' },
          { header: 'Contact Email', key: 'email' },
          { header: 'Phone', key: 'phone', render: (r) => r.phone || '—' },
          { header: 'Wallet Balance', key: 'balance', render: (r) => money(r.balance) },
          {
            header: 'KYC Status',
            key: 'kyc',
            render: (r) => (
              <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700, background: String(r.kyc).includes('VERIF') || r.kyc === 'APPROVED' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)', color: String(r.kyc).includes('VERIF') || r.kyc === 'APPROVED' ? '#10b981' : '#f59e0b' }}>
                {r.kyc}
              </span>
            ),
          },
          { header: 'Account Status', key: 'status' },
          {
            header: 'Actions',
            key: 'actions',
            sortable: false,
            render: (r) => (
              <div style={{ display: 'flex', gap: '6px' }}>
                <button type="button" onClick={() => open360(r)} style={{ padding: '4px 10px', borderRadius: '4px', border: '1px solid var(--admin-border, var(--color-border))', background: 'var(--admin-panel, var(--color-panel))', color: '#60a5fa', cursor: 'pointer', fontSize: '0.78rem' }}>
                  Customer 360
                </button>
                {subModule === 'kyc-queue' && (
                  <button type="button" onClick={() => handleVerifyKyc(r)} style={{ padding: '4px 10px', borderRadius: '4px', border: '1px solid var(--admin-border, var(--color-border))', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', cursor: 'pointer', fontSize: '0.78rem' }}>
                    Approve KYC
                  </button>
                )}
                <button type="button" onClick={() => handleRestrict(r)} style={{ padding: '4px 10px', borderRadius: '4px', border: '1px solid var(--admin-border, var(--color-border))', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', cursor: 'pointer', fontSize: '0.78rem' }}>
                  Restrict
                </button>
              </div>
            ),
          },
        ]}
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
            <div><strong>Risk:</strong> {selectedUser.risk}</div>
            <div><strong>Balance:</strong> {money(user360?.wallet?.balance ?? selectedUser.balance)}</div>
            {user360?.profile && (
              <div><strong>360:</strong> {user360.profile.status || user360.status || 'loaded'}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
