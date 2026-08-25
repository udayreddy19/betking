import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import { useAdminToast } from '../components/AdminToastContext';
import { StatusBadge } from '../components/AdminBadge';
import AdminDrawer from '../components/AdminDrawer';
import AdminConfirmDialog from '../components/AdminConfirmDialog';
import AdminFilterBar, { FilterSelect, FilterSearch } from '../components/AdminFilterBar';
import AdminTabs from '../components/AdminTabs';
import AdminCard from '../components/AdminCard';
import KycReminderUsersPanel from '../../../components/DatabaseInspector/KycReminderUsersPanel';

function money(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `₹${Number(n).toLocaleString()}`;
}

function formatReminderAt(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return String(value);
  }
}

function maskPAN(pan) {
  if (!pan) return '—';
  return pan.length > 4 ? `${pan.slice(0, 2)}●●●●${pan.slice(-2)}` : pan;
}

function maskAadhaar(num) {
  if (!num) return '—';
  return num.length > 4 ? `●●●● ●●●● ${num.slice(-4)}` : num;
}

const KYC_FILTERS = [
  { value: 'ALL', label: 'All' },
  { value: 'NEEDS_KYC', label: 'Needs KYC' },
  { value: 'VERIFIED', label: 'KYC Completed' },
  { value: 'NOT_STARTED', label: 'KYC Not Started' },
  { value: 'PENDING', label: 'KYC Pending' },
  { value: 'UNDER_REVIEW', label: 'Under Review' },
  { value: 'REJECTED', label: 'KYC Rejected' },
  { value: 'RESUBMISSION_REQUIRED', label: 'Resubmission Required' },
  { value: 'EXPIRED', label: 'KYC Expired' },
];

function needsReminder(user) {
  const k = String(user?.kyc || '').toUpperCase();
  return k !== 'VERIFIED' && k !== 'APPROVED';
}

export default function CustomersDomainView({ subModule = 'directory' }) {
  const [users, setUsers] = useState([]);
  const [kycCases, setKycCases] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [user360, setUser360] = useState(null);
  const [error, setError] = useState(null);
  const [kycLoading, setKycLoading] = useState(false);
  const [actingId, setActingId] = useState(null);
  const [kycFilter, setKycFilter] = useState(subModule === 'kyc-reminders' ? 'NEEDS_KYC' : 'ALL');
  const [searchQ, setSearchQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [confirm, setConfirm] = useState(null);
  const [restrictConfirm, setRestrictConfirm] = useState(null);
  const [kycRejectConfirm, setKycRejectConfirm] = useState(null);
  const { showToast } = useAdminToast();

  useEffect(() => {
    if (subModule === 'kyc-reminders') setKycFilter('NEEDS_KYC');
  }, [subModule]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchQ.trim()), 350);
    return () => clearTimeout(t);
  }, [searchQ]);

  const loadCustomers = useCallback(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    params.set('limit', '200');
    if (kycFilter && kycFilter !== 'ALL') params.set('kyc', kycFilter);
    if (debouncedQ) params.set('q', debouncedQ);
    adminApiClient.get(`/customers?${params.toString()}`)
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
  }, [subModule, kycFilter, debouncedQ]);

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
  useEffect(() => { setSelectedIds(new Set()); }, [kycFilter, debouncedQ, subModule]);

  const open360 = (user) => {
    setSelectedUser(user);
    setUser360(null);
    adminApiClient.get(`/users/${encodeURIComponent(user.id)}/360`)
      .then((data) => setUser360(data))
      .catch(() => setUser360(null));
  };

  const handleKycDecision = async (row, decision, notes = '') => {
    const caseId = row.caseId || row.id;
    const userId = row.userId || row.id;
    const finalNotes = notes || (decision === 'VERIFIED' ? 'Approved from KYC queue' : 'Rejected from KYC queue');

    setActingId(caseId || userId);
    try {
      await adminApiClient.post('/kyc/verify', { caseId, userId, decision, notes: finalNotes });
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
      setKycRejectConfirm(null);
    }
  };

  const handleRestrict = async (user, reason) => {
    try {
      await adminApiClient.post(`/customers/${user.id}/restrict`, { action: 'TEMPORARY_RESTRICTION', reason: reason || 'Risk Audit' });
      showToast(`User ${user.id} restricted.`, 'success');
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, status: 'RESTRICTED' } : u)));
    } catch (err) {
      showToast(err.message || 'Restrict failed', 'error');
    } finally {
      setRestrictConfirm(null);
    }
  };

  const toggleSelect = (userId, checked) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(userId);
      else next.delete(userId);
      return next;
    });
  };

  const sendSingleReminder = async (user) => {
    setActingId(user.id);
    const idem = `kyc_rem_${user.id}_${Date.now()}`;
    try {
      const res = await adminApiClient.post(
        `/kyc/users/${encodeURIComponent(user.id)}/reminder`,
        {},
        { headers: { 'X-Idempotency-Key': idem } },
      );
      showToast(res.message || 'KYC reminder queued.', 'success');
      loadCustomers();
    } catch (err) {
      const code = err?.code || err?.data?.code;
      const msg = err?.data?.message || err?.data?.error || err.message;
      showToast(
        code === 'KYC_REMINDER_COOLDOWN'
          ? (msg || 'Reminder already sent recently.')
          : (msg || 'Failed to send KYC reminder'),
        'error',
      );
    } finally {
      setActingId(null);
      setConfirm(null);
    }
  };

  const sendBulkReminders = async (ids) => {
    setActingId('bulk');
    const idem = `kyc_bulk_${Date.now()}`;
    try {
      const res = await adminApiClient.post(
        '/kyc/reminders',
        { userIds: ids },
        { headers: { 'X-Idempotency-Key': idem } },
      );
      const parts = [
        `${res.sent || 0} queued`,
        res.skipped ? `${res.skipped} skipped` : null,
        res.failed ? `${res.failed} failed` : null,
      ].filter(Boolean);
      showToast(parts.join(', ') + '.', res.failed ? 'warning' : 'success');
      setSelectedIds(new Set());
      loadCustomers();
    } catch (err) {
      showToast(err.message || 'Bulk KYC reminders failed', 'error');
    } finally {
      setActingId(null);
      setConfirm(null);
    }
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
    directory: ['02 · Customer Directory', 'Live customer directory from PostgreSQL. Filter by KYC and send completion reminders.', 'Customer Directory'],
    'kyc-reminders': ['02 · KYC Reminders & Email', 'Users who have not completed KYC. Send Zoho/SMTP completion emails — delivery is logged in kyc_reminder_log.', 'Needs KYC'],
    'kyc-queue': ['02 · KYC Verification Queue', 'Review submitted PAN / Aadhaar and approve or reject identity verification.', 'KYC Queue'],
    restrictions: ['02 · Account Restrictions', 'Restricted / suspended accounts requiring review.', 'Restricted Accounts'],
    'responsible-gaming': ['02 · Responsible Gaming Safeguards', 'High-risk or self-exclusion related accounts.', 'RG Watchlist'],
  };
  const [heading, hint, tableTitle] = titles[subModule] || titles.directory;
  const showReminderUi = subModule === 'directory';

  const eligibleForReminder = useMemo(
    () => (showReminderUi
      ? filtered.filter((u) => needsReminder(u) && u.reminderEligible !== false)
      : []),
    [filtered, showReminderUi],
  );

  if (subModule === 'kyc-reminders') {
    return (
      <div>
        <div style={{ marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: 'var(--admin-text)' }}>
            02 · KYC Reminders & Email
          </h2>
          <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
            Users who have not completed KYC. Send Zoho/SMTP completion emails — delivery is logged in kyc_reminder_log.
          </p>
          {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.82rem' }}>{error}</p>}
        </div>
        <KycReminderUsersPanel
          title="Send KYC completion emails"
          onSent={() => loadCustomers()}
        />
      </div>
    );
  }

  const columns = [];

  columns.push(
    { header: 'User ID', key: 'id' },
    { header: 'Full Name', key: 'name' },
    { header: 'Contact Email', key: 'email' },
    { header: 'Phone', key: 'phone', render: (r) => r.phone || '—' },
    { header: 'Wallet Balance', key: 'balance', render: (r) => money(r.balance) },
    {
      header: 'KYC Status',
      key: 'kyc',
      render: (r) => <StatusBadge status={r.kyc} />,
    },
  );

  if (showReminderUi) {
    columns.push(
      {
        header: 'Last Reminder',
        key: 'lastReminderAt',
        render: (r) => formatReminderAt(r.lastReminderAt),
      },
      {
        header: 'Reminder Status',
        key: 'lastReminderStatus',
        render: (r) => (r.lastReminderStatus ? String(r.lastReminderStatus) : (needsReminder(r) ? '—' : 'KYC Completed')),
      },
      {
        header: 'Reminders',
        key: 'reminderCount',
        render: (r) => (r.reminderCount != null ? r.reminderCount : 0),
      },
    );
  }

  if (subModule === 'kyc-queue') {
    columns.push(
      { header: 'DOB', key: 'dateOfBirth', render: (r) => r.dateOfBirth || '—' },
      { header: 'PAN', key: 'panNumber', render: (r) => maskPAN(r.panNumber) },
      { header: 'Aadhaar', key: 'aadhaarNumber', render: (r) => maskAadhaar(r.aadhaarNumber) },
    );
  } else {
    columns.push({ header: 'Account Status', key: 'status', render: (r) => <StatusBadge status={r.status} /> });
  }

  columns.push({
    header: 'Actions',
    key: 'actions',
    sortable: false,
    render: (r) => {
      const busy = actingId && (actingId === r.caseId || actingId === r.id || actingId === r.userId || actingId === 'bulk');
      return (
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
          <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => open360(r)} style={{ color: '#60a5fa' }}>
            360°
          </button>
          {subModule === 'kyc-queue' && (
            <>
              <button
                type="button"
                disabled={busy}
                className="admin-btn admin-btn--success admin-btn--sm"
                onClick={() => handleKycDecision(r, 'VERIFIED')}
              >
                {busy ? '…' : 'Approve'}
              </button>
              <button
                type="button"
                disabled={busy}
                className="admin-btn admin-btn--danger admin-btn--sm"
                onClick={() => setKycRejectConfirm(r)}
              >
                Reject
              </button>
            </>
          )}
          {showReminderUi && !needsReminder(r) && (
            <span style={{ fontSize: '0.73rem', color: '#10b981', fontWeight: 700, alignSelf: 'center' }}>KYC Done</span>
          )}
          {showReminderUi && needsReminder(r) && r.reminderEligible === false && (
            <span style={{ fontSize: '0.73rem', color: 'var(--admin-text-muted)', fontWeight: 700, alignSelf: 'center' }}>Cooldown</span>
          )}
          {subModule !== 'kyc-queue' && (
            <button
              type="button"
              className="admin-btn admin-btn--danger admin-btn--sm"
              onClick={() => setRestrictConfirm(r)}
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
      {/* Header */}
      <div style={{ marginBottom: '16px' }}>
        <div className="admin-flex-between" style={{ flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>{heading}</h2>
          {subModule === 'kyc-queue' && (
            <button type="button" className="admin-btn admin-btn--secondary" onClick={() => loadKycQueue()}>
              {kycLoading ? 'Refreshing…' : '↻ Refresh queue'}
            </button>
          )}
        </div>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>{hint}</p>
        {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.78rem' }}>{error}</p>}
      </div>

      {/* Filter Bar */}
      {showReminderUi && (
        <AdminFilterBar label="Filters">
          <FilterSelect
            value={kycFilter}
            onChange={setKycFilter}
            options={KYC_FILTERS}
            placeholder=""
          />
          <FilterSearch
            value={searchQ}
            onChange={setSearchQ}
            placeholder="Search name, email, phone, user ID…"
          />
          <button
            type="button"
            disabled={eligibleForReminder.length === 0 || actingId === 'bulk'}
            className="admin-btn admin-btn--primary admin-btn--sm"
            onClick={() => {
              const ids = eligibleForReminder.map((u) => u.id);
              setConfirm({ type: 'bulk', users: eligibleForReminder, ids });
            }}
          >
            Send to all ({eligibleForReminder.length})
          </button>
          <span style={{ fontSize: '0.72rem', color: 'var(--admin-text-dim)' }}>
            Only users not reminded in the last 24h.
          </span>
        </AdminFilterBar>
      )}

      {/* Data Table */}
      <AdminDataTable
        title={tableTitle}
        emptyMessage={kycLoading ? 'Loading KYC cases…' : (subModule === 'kyc-queue' ? 'No KYC submissions waiting for review' : 'No matching customers')}
        data={filtered}
        columns={columns}
        searchPlaceholder="Filter this page…"
        loading={kycLoading && subModule === 'kyc-queue'}
      />

      {/* Bulk Reminder Confirm */}
      <AdminConfirmDialog
        isOpen={!!confirm}
        variant="warning"
        icon="📧"
        title={`Send KYC reminders to all ${confirm?.ids?.length || 0} eligible users?`}
        description="After send, those users leave the eligible list for 24 hours. Server cooldown is enforced."
        details={[
          { label: 'Eligible Users', value: confirm?.ids?.length || 0 },
          { label: 'Delivery', value: 'Zoho / SMTP' },
        ]}
        confirmLabel="Send to all"
        onConfirm={() => confirm?.ids && sendBulkReminders(confirm.ids)}
        onCancel={() => setConfirm(null)}
        loading={actingId === 'bulk'}
      />

      {/* Restrict Confirm */}
      <AdminConfirmDialog
        isOpen={!!restrictConfirm}
        variant="danger"
        icon="🚫"
        title={`Restrict user ${restrictConfirm?.name || restrictConfirm?.id}?`}
        description="This will apply a temporary restriction to this account. The action is logged in the audit trail."
        requireReason
        reasonPlaceholder="Restriction reason (e.g. Risk Audit)..."
        reasonDefault="Risk Audit"
        details={[
          { label: 'User ID', value: restrictConfirm?.id || '—' },
          { label: 'Email', value: restrictConfirm?.email || '—' },
          { label: 'KYC', value: restrictConfirm?.kyc || '—' },
        ]}
        confirmLabel="Apply Restriction"
        onConfirm={(reason) => restrictConfirm && handleRestrict(restrictConfirm, reason)}
        onCancel={() => setRestrictConfirm(null)}
      />

      {/* KYC Reject Confirm */}
      <AdminConfirmDialog
        isOpen={!!kycRejectConfirm}
        variant="danger"
        icon="❌"
        title={`Reject KYC for ${kycRejectConfirm?.name || kycRejectConfirm?.id}?`}
        description="The rejection reason will be visible in the audit log. The user will need to resubmit documents."
        requireReason
        reasonPlaceholder="Rejection reason (e.g. Documents could not be verified)..."
        reasonDefault="Documents could not be verified"
        details={[
          { label: 'User', value: kycRejectConfirm?.name || '—' },
          { label: 'PAN', value: maskPAN(kycRejectConfirm?.panNumber) },
        ]}
        confirmLabel="Reject KYC"
        onConfirm={(reason) => kycRejectConfirm && handleKycDecision(kycRejectConfirm, 'REJECTED', reason)}
        onCancel={() => setKycRejectConfirm(null)}
      />

      {/* Customer 360 Drawer */}
      <AdminDrawer
        isOpen={!!selectedUser}
        onClose={() => { setSelectedUser(null); setUser360(null); }}
        title={`Customer 360`}
        subtitle={selectedUser ? `${selectedUser.name} · ${selectedUser.id}` : ''}
        actions={subModule === 'kyc-queue' && selectedUser ? (
          <div style={{ display: 'flex', gap: '6px' }}>
            <button type="button" className="admin-btn admin-btn--success admin-btn--sm" onClick={() => handleKycDecision(selectedUser, 'VERIFIED')}>Approve KYC</button>
            <button type="button" className="admin-btn admin-btn--danger admin-btn--sm" onClick={() => setKycRejectConfirm(selectedUser)}>Reject KYC</button>
          </div>
        ) : null}
      >
        {selectedUser && (
          <>
            <AdminCard title="Profile" accent="var(--admin-info)" style={{ marginBottom: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.82rem' }}>
                <div><span style={{ color: 'var(--admin-text-muted)', fontWeight: 600 }}>Registration</span><div style={{ fontWeight: 700 }}>{selectedUser.regDate || '—'}</div></div>
                <div><span style={{ color: 'var(--admin-text-muted)', fontWeight: 600 }}>Email</span><div style={{ fontWeight: 700 }}>{selectedUser.email || '—'}</div></div>
                <div><span style={{ color: 'var(--admin-text-muted)', fontWeight: 600 }}>Phone</span><div style={{ fontWeight: 700 }}>{selectedUser.phone || '—'}</div></div>
                <div><span style={{ color: 'var(--admin-text-muted)', fontWeight: 600 }}>DOB</span><div style={{ fontWeight: 700 }}>{selectedUser.dateOfBirth || '—'}</div></div>
              </div>
            </AdminCard>

            <AdminCard title="KYC & Identity" accent="var(--admin-warning)" style={{ marginBottom: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.82rem' }}>
                <div><span style={{ color: 'var(--admin-text-muted)', fontWeight: 600 }}>KYC Status</span><div><StatusBadge status={selectedUser.kyc} /></div></div>
                <div><span style={{ color: 'var(--admin-text-muted)', fontWeight: 600 }}>PAN</span><div style={{ fontWeight: 700, fontFamily: 'monospace' }}>{maskPAN(selectedUser.panNumber)}</div></div>
                <div><span style={{ color: 'var(--admin-text-muted)', fontWeight: 600 }}>Aadhaar</span><div style={{ fontWeight: 700, fontFamily: 'monospace' }}>{maskAadhaar(selectedUser.aadhaarNumber)}</div></div>
                <div><span style={{ color: 'var(--admin-text-muted)', fontWeight: 600 }}>Reminders Sent</span><div style={{ fontWeight: 700 }}>{selectedUser.reminderCount ?? 0}</div></div>
              </div>
            </AdminCard>

            <AdminCard title="Wallet" accent="var(--admin-success)" style={{ marginBottom: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.82rem' }}>
                <div><span style={{ color: 'var(--admin-text-muted)', fontWeight: 600 }}>Balance</span><div style={{ fontWeight: 800, fontSize: '1.1rem' }}>{money(user360?.wallet?.balance ?? selectedUser.balance)}</div></div>
                <div><span style={{ color: 'var(--admin-text-muted)', fontWeight: 600 }}>Last Reminder</span><div style={{ fontWeight: 700 }}>{formatReminderAt(selectedUser.lastReminderAt)}</div></div>
                <div><span style={{ color: 'var(--admin-text-muted)', fontWeight: 600 }}>Reminder Status</span><div style={{ fontWeight: 700 }}>{selectedUser.lastReminderStatus || '—'}</div></div>
              </div>
            </AdminCard>
          </>
        )}
      </AdminDrawer>
    </div>
  );
}
