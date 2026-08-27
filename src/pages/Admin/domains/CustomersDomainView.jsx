import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import { useAdminToast } from '../components/AdminToastContext';
import { StatusBadge } from '../components/AdminBadge';
import AdminDrawer from '../components/AdminDrawer';
import AdminConfirmDialog from '../components/AdminConfirmDialog';
import AdminFilterBar, { FilterSelect, FilterSearch } from '../components/AdminFilterBar';
import AdminCard from '../components/AdminCard';
import AdminTabs from '../components/AdminTabs';
import KycReminderUsersPanel from '../../../components/DatabaseInspector/KycReminderUsersPanel';
import { useAdminRole, canAccessDomain, hasPermission, PERMISSIONS } from '../permissions/AdminRBACGate';

const DOSSIER_TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'kyc', label: 'KYC' },
  { id: 'bank', label: 'Bank' },
  { id: 'wallet', label: 'Wallet' },
  { id: 'recon', label: 'Recon' },
  { id: 'bets', label: 'Bets' },
  { id: 'txns', label: 'Transactions' },
  { id: 'promotions', label: 'Promotions' },
  { id: 'risk', label: 'Risk' },
  { id: 'vip', label: 'VIP' },
  { id: 'ops', label: 'Ops' },
  { id: 'devices', label: 'Devices' },
  { id: 'rg', label: 'RG' },
  { id: 'referrals', label: 'Referrals' },
  { id: 'support', label: 'Support' },
  { id: 'audit', label: 'Audit' },
  { id: 'timeline', label: 'Timeline' },
];

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

const PENDING_KYC = new Set(['PENDING', 'UNDER_REVIEW', 'PENDING_QUEUE', 'SUBMITTED', 'IN_REVIEW']);

function needsReminder(user) {
  const k = String(user?.kyc || '').toUpperCase();
  return k !== 'VERIFIED' && k !== 'APPROVED';
}

function isRestrictedStatus(status) {
  const s = String(status || '').toUpperCase();
  return s.includes('RESTRICT') || s.includes('SUSPEND') || s.includes('LOCK');
}

function isPendingKyc(status) {
  return PENDING_KYC.has(String(status || '').toUpperCase());
}

function formatDt(value) {
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

function DossierField({ label, children, mono = false }) {
  return (
    <div>
      <span style={{ color: 'var(--admin-text-muted)', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      <div style={{ fontWeight: 700, fontSize: '0.88rem', fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'inherit', wordBreak: 'break-word', marginTop: 2 }}>
        {children ?? '—'}
      </div>
    </div>
  );
}

function DossierStat({ label, value, accent }) {
  return (
    <div style={{
      padding: '10px 12px',
      borderRadius: 8,
      background: 'var(--admin-surface-2, rgba(0,0,0,0.04))',
      border: '1px solid var(--admin-border, rgba(0,0,0,0.06))',
    }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--admin-text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: '1.05rem', marginTop: 4, color: accent || 'inherit' }}>{value}</div>
    </div>
  );
}

function ResponsibleGamingAdminPanel() {
  const [controls, setControls] = useState([]);
  const [error, setError] = useState(null);
  const { showToast } = useAdminToast();

  const load = useCallback(() => {
    adminApiClient.get('/customers/rg-controls?limit=150')
      .then((data) => {
        setControls(data.controls || []);
        setError(null);
      })
      .catch((err) => {
        setControls([]);
        setError(err.message || 'Data unavailable');
        showToast(err.message || 'Failed to load RG controls', 'error');
      });
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>02 · Responsible Gaming Safeguards</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          Active player-set limits, cooling-off, and self-exclusion from `responsible_gaming_limits`. Read-only — never bypasses enforcement.
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.78rem' }}>{error}</p>}
      </div>
      <AdminDataTable
        title="Active RG controls"
        emptyMessage="No active RG controls — Data unavailable or none set"
        data={controls}
        onRefresh={load}
        columns={[
          { header: 'User', key: 'userId', render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.76rem' }}>{r.userId}</span> },
          { header: 'Name', key: 'name' },
          { header: 'Email', key: 'email', render: (r) => r.email || '—' },
          { header: 'Account', key: 'accountStatus', render: (r) => <StatusBadge status={r.accountStatus || '—'} /> },
          { header: 'Risk', key: 'riskTier', render: (r) => <StatusBadge status={r.riskTier || '—'} /> },
          { header: 'Deposit/day', key: 'depositLimitDaily', render: (r) => money(r.depositLimitDaily) },
          { header: 'Loss/day', key: 'lossLimitDaily', render: (r) => money(r.lossLimitDaily) },
          { header: 'Stake/bet', key: 'stakeLimitPerBet', render: (r) => money(r.stakeLimitPerBet) },
          {
            header: 'Cooling-off',
            key: 'coolingOffUntil',
            render: (r) => (r.coolingOffUntil ? new Date(r.coolingOffUntil).toLocaleString('en-IN') : '—'),
          },
          {
            header: 'Self-exclusion',
            key: 'selfExcludedUntil',
            render: (r) => (r.selfExcludedUntil ? new Date(r.selfExcludedUntil).toLocaleString('en-IN') : '—'),
          },
          {
            header: 'Updated',
            key: 'updatedAt',
            render: (r) => (r.updatedAt ? new Date(r.updatedAt).toLocaleString('en-IN') : '—'),
          },
        ]}
      />
    </div>
  );
}

export default function CustomersDomainView({
  subModule = 'directory',
  focusEntityId = null,
  focusEntityType = null,
  focusUserId = null,
  onFocusConsumed = null,
  onFocusUserConsumed = null,
  onNavigate = null,
}) {
  const { activeRole } = useAdminRole();
  const canViewCustomers = canAccessDomain(activeRole, 'customers', null);
  const roleCanViewPii = hasPermission(activeRole, PERMISSIONS.VIEW_PII);

  const [users, setUsers] = useState([]);
  const [kycCases, setKycCases] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [user360, setUser360] = useState(null);
  const [user360Loading, setUser360Loading] = useState(false);
  const [user360Error, setUser360Error] = useState(null);
  const [dossierTab, setDossierTab] = useState('profile');

  const [error, setError] = useState(null);
  const [kycLoading, setKycLoading] = useState(false);
  const [actingId, setActingId] = useState(null);
  const [kycFilter, setKycFilter] = useState(subModule === 'kyc-reminders' ? 'NEEDS_KYC' : 'ALL');
  const [searchQ, setSearchQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [searchBy, setSearchBy] = useState('all');
  const [, setSelectedIds] = useState(() => new Set());
  const [confirm, setConfirm] = useState(null);
  const [restrictConfirm, setRestrictConfirm] = useState(null);
  const [unrestrictConfirm, setUnrestrictConfirm] = useState(null);
  const [kycRejectConfirm, setKycRejectConfirm] = useState(null);
  const [walletConfirm, setWalletConfirm] = useState(null);
  const [walletAmount, setWalletAmount] = useState('');
  const [walletDirection, setWalletDirection] = useState('CREDIT');
  const [ticketConfirm, setTicketConfirm] = useState(null);
  const [ticketSubject, setTicketSubject] = useState('Admin outreach');
  const [ticketCategory, setTicketCategory] = useState('General');
  const [ticketMessage, setTicketMessage] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const autoOpenedRef = useRef(null);
  const { showToast } = useAdminToast();

  const resolvedFocusId = focusEntityId || focusUserId;
  const consumeFocus = onFocusConsumed || onFocusUserConsumed;

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
    if (debouncedQ) {
      params.set('q', debouncedQ);
      if (searchBy && searchBy !== 'all') params.set('searchBy', searchBy);
    }
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
  }, [subModule, kycFilter, debouncedQ, searchBy]);

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
  useEffect(() => { setSelectedIds(new Set()); }, [kycFilter, debouncedQ, searchBy, subModule]);

  const open360 = useCallback((user) => {
    setDossierTab('profile');
    const id = user?.id || user?.userId || user?.user_id;
    if (!id) return;
    setSelectedUser({
      id,
      name: user.name || user.displayName || user.email || id,
      email: user.email,
      phone: user.phone,
      balance: user.balance,
      kyc: user.kyc || user.kycStatus,
      status: user.status || user.accountStatus,
      regDate: user.regDate,
      dateOfBirth: user.dateOfBirth,
      panNumber: user.panNumber,
      aadhaarNumber: user.aadhaarNumber,
      reminderCount: user.reminderCount,
      lastReminderAt: user.lastReminderAt,
      lastReminderStatus: user.lastReminderStatus,
      caseId: user.caseId,
      userId: user.userId || id,
    });
    setUser360(null);
    setUser360Error(null);
    setUser360Loading(true);
    adminApiClient.get(`/users/${encodeURIComponent(id)}/360`)
      .then((data) => setUser360(data))
      .catch((err) => {
        setUser360(null);
        setUser360Error(err.message || 'Failed to load customer dossier');
      })
      .finally(() => setUser360Loading(false));
  }, []);

  const refresh360 = useCallback(() => {
    if (selectedUser?.id) open360(selectedUser);
  }, [selectedUser, open360]);

  useEffect(() => {
    if (!resolvedFocusId) return undefined;
    const type = String(focusEntityType || '').toLowerCase();
    if (type && !['user', 'users', 'kyc_case', 'kyc_cases', ''].includes(type)) {
      return undefined;
    }
    open360({ id: resolvedFocusId });
    consumeFocus?.();
    return undefined;
  }, [resolvedFocusId, focusEntityType, open360, consumeFocus]);

  // Sticky Find User: auto-open 360 when search returns exactly 1 user
  useEffect(() => {
    if (!debouncedQ || subModule === 'kyc-reminders') return undefined;
    if (users.length !== 1) {
      autoOpenedRef.current = null;
      return undefined;
    }
    const only = users[0];
    const id = only?.id || only?.userId;
    if (!id || autoOpenedRef.current === id) return undefined;
    const t = setTimeout(() => {
      autoOpenedRef.current = id;
      open360(only);
    }, 200);
    return () => clearTimeout(t);
  }, [users, debouncedQ, subModule, open360]);

  const handleKycDecision = async (row, decision, notes = '') => {
    const caseId = row.caseId || row.id || user360?.kyc?.caseId;
    const userId = row.userId || row.id || selectedUser?.id;
    const finalNotes = notes || (decision === 'VERIFIED' ? 'Approved from KYC queue' : 'Rejected from KYC queue');

    setActingId(caseId || userId);
    setActionBusy(true);
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
      if (selectedUser?.id === userId) refresh360();
    } catch (err) {
      showToast(err.message || 'KYC decision failed', 'error');
    } finally {
      setActingId(null);
      setActionBusy(false);
      setKycRejectConfirm(null);
    }
  };

  const handleRestrict = async (user, reason) => {
    setActionBusy(true);
    try {
      await adminApiClient.post(`/customers/${user.id}/restrict`, { action: 'TEMPORARY_RESTRICTION', reason: reason || 'Risk Audit' });
      showToast(`User ${user.id} restricted.`, 'success');
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, status: 'RESTRICTED' } : u)));
      if (selectedUser?.id === user.id) refresh360();
    } catch (err) {
      showToast(err.message || 'Restrict failed', 'error');
    } finally {
      setActionBusy(false);
      setRestrictConfirm(null);
    }
  };

  const handleUnrestrict = async (user, reason) => {
    setActionBusy(true);
    try {
      await adminApiClient.post(`/customers/${user.id}/unrestrict`, { reason: reason || 'Admin unrestrict' });
      showToast(`User ${user.id} unrestricted.`, 'success');
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, status: 'ACTIVE' } : u)));
      if (selectedUser?.id === user.id) refresh360();
    } catch (err) {
      showToast(err.message || 'Unrestrict failed', 'error');
    } finally {
      setActionBusy(false);
      setUnrestrictConfirm(null);
    }
  };

  const handleWalletAdjust = async (reason) => {
    if (!walletConfirm?.id) return;
    const amount = Number(walletAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast('Enter a positive amount', 'error');
      return;
    }
    setActionBusy(true);
    try {
      const res = await adminApiClient.post(`/customers/${walletConfirm.id}/wallet-adjust-request`, {
        amount,
        direction: walletDirection,
        reason: reason || 'Admin wallet adjustment',
      });
      showToast(res.requestId ? `Wallet adjust requested (${res.requestId})` : 'Wallet adjust requested', 'success');
      setWalletConfirm(null);
      setWalletAmount('');
      refresh360();
    } catch (err) {
      showToast(err.message || 'Wallet adjust failed', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const handleCreateTicket = async () => {
    if (!ticketConfirm?.id) return;
    setActionBusy(true);
    try {
      const res = await adminApiClient.post('/support/conversations', {
        userId: ticketConfirm.id,
        subject: ticketSubject || 'Admin outreach',
        category: ticketCategory || 'General',
        message: ticketMessage || `Ticket opened regarding account ${ticketConfirm.id}.`,
      });
      const convId = res.conversationId || res.conversation?.conversationId;
      showToast(convId ? `Ticket ${convId} created` : 'Support ticket created', 'success');
      setTicketConfirm(null);
      setTicketMessage('');
      refresh360();
      if (convId && onNavigate) {
        onNavigate({
          domainId: 'support',
          subModuleId: 'ticket-queue',
          entityType: 'ticket',
          entityId: convId,
        });
      }
    } catch (err) {
      showToast(err.message || 'Could not create ticket', 'error');
    } finally {
      setActionBusy(false);
    }
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
      return users.filter((u) => isRestrictedStatus(u.status));
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
  const showUserSearch = ['directory', 'restrictions', 'responsible-gaming', 'kyc-queue'].includes(subModule);

  const searchPlaceholder = searchBy === 'email'
    ? 'Search by email…'
    : searchBy === 'phone'
      ? 'Search by mobile number…'
      : 'Search email, mobile, name, or user ID…';

  const eligibleForReminder = useMemo(
    () => (showReminderUi
      ? filtered.filter((u) => needsReminder(u) && u.reminderEligible !== false)
      : []),
    [filtered, showReminderUi],
  );

  const canViewFullPii = Boolean(user360?.permissions?.canViewFullPii) && roleCanViewPii;
  const accountStatus = user360?.user?.accountStatus || selectedUser?.status;
  const kycStatus = user360?.kyc?.status || user360?.kyc?.caseStatus || selectedUser?.kyc;
  const showKycActions = isPendingKyc(kycStatus) || isPendingKyc(user360?.kyc?.caseStatus);

  if (!canViewCustomers) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--admin-text-muted)' }}>
        Your role cannot access the customers domain.
      </div>
    );
  }

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

  if (subModule === 'responsible-gaming') {
    return <ResponsibleGamingAdminPanel />;
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
          {showReminderUi && needsReminder(r) && r.reminderEligible !== false && (
            <button
              type="button"
              disabled={busy}
              className="admin-btn admin-btn--primary admin-btn--sm"
              onClick={() => setConfirm({ type: 'single', user: r, ids: [r.id], users: [r] })}
            >
              Remind
            </button>
          )}
          {showReminderUi && !needsReminder(r) && (
            <span style={{ fontSize: '0.73rem', color: '#10b981', fontWeight: 700, alignSelf: 'center' }}>KYC Done</span>
          )}
          {showReminderUi && needsReminder(r) && r.reminderEligible === false && (
            <span style={{ fontSize: '0.73rem', color: 'var(--admin-text-muted)', fontWeight: 700, alignSelf: 'center' }}>Cooldown</span>
          )}
          {subModule !== 'kyc-queue' && (
            isRestrictedStatus(r.status) ? (
              <button
                type="button"
                className="admin-btn admin-btn--success admin-btn--sm"
                onClick={() => setUnrestrictConfirm(r)}
              >
                Unrestrict
              </button>
            ) : (
              <button
                type="button"
                className="admin-btn admin-btn--danger admin-btn--sm"
                onClick={() => setRestrictConfirm(r)}
              >
                Restrict
              </button>
            )
          )}
        </div>
      );
    },
  });

  const drawerActions = selectedUser ? (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
      <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={refresh360} disabled={user360Loading}>
        ↻ Refresh
      </button>
      {isRestrictedStatus(accountStatus) ? (
        <button type="button" className="admin-btn admin-btn--success admin-btn--sm" onClick={() => setUnrestrictConfirm(selectedUser)}>
          Unrestrict
        </button>
      ) : (
        <button type="button" className="admin-btn admin-btn--danger admin-btn--sm" onClick={() => setRestrictConfirm(selectedUser)}>
          Restrict
        </button>
      )}
      {showKycActions && (
        <>
          <button type="button" className="admin-btn admin-btn--success admin-btn--sm" onClick={() => handleKycDecision(selectedUser, 'VERIFIED')}>
            Approve KYC
          </button>
          <button type="button" className="admin-btn admin-btn--danger admin-btn--sm" onClick={() => setKycRejectConfirm(selectedUser)}>
            Reject KYC
          </button>
        </>
      )}
      <button
        type="button"
        className="admin-btn admin-btn--secondary admin-btn--sm"
        onClick={() => {
          setTicketSubject('Admin outreach');
          setTicketCategory('General');
          setTicketMessage('');
          setTicketConfirm(selectedUser);
        }}
      >
        Create ticket
      </button>
      <button
        type="button"
        className="admin-btn admin-btn--primary admin-btn--sm"
        onClick={() => {
          setWalletAmount('');
          setWalletDirection('CREDIT');
          setWalletConfirm(selectedUser);
        }}
      >
        Wallet adjust
      </button>
    </div>
  ) : null;

  return (
    <div>
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

      {showUserSearch && (
        <AdminCard style={{
          marginBottom: '14px',
          padding: '14px 16px',
          position: 'sticky',
          top: 0,
          zIndex: 15,
          background: 'var(--admin-sticky-bg, var(--admin-surface))',
          backdropFilter: 'blur(8px)',
        }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
            <div style={{ fontWeight: 800, fontSize: '0.82rem', minWidth: '72px' }}>Find user</div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {[
                { id: 'all', label: 'All' },
                { id: 'email', label: 'Email' },
                { id: 'phone', label: 'Mobile' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`admin-btn admin-btn--sm ${searchBy === opt.id ? 'admin-btn--primary' : 'admin-btn--secondary'}`}
                  onClick={() => setSearchBy(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div style={{ flex: '1 1 220px', minWidth: '200px' }}>
              <FilterSearch
                value={searchQ}
                onChange={setSearchQ}
                placeholder={searchPlaceholder}
              />
            </div>
            {searchQ && (
              <button
                type="button"
                className="admin-btn admin-btn--ghost admin-btn--sm"
                onClick={() => setSearchQ('')}
              >
                Clear
              </button>
            )}
          </div>
          <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: 'var(--admin-text-muted)' }}>
            Mobile search matches last 10 digits. Exact single match auto-opens Customer 360.
            {debouncedQ ? ` Showing matches for “${debouncedQ}”.` : ''}
          </p>
        </AdminCard>
      )}

      {showReminderUi && (
        <AdminFilterBar label="Filters">
          <FilterSelect
            value={kycFilter}
            onChange={setKycFilter}
            options={KYC_FILTERS}
            placeholder=""
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

      <AdminDataTable
        title={tableTitle}
        emptyMessage={kycLoading ? 'Loading KYC cases…' : (subModule === 'kyc-queue' ? 'No KYC submissions waiting for review' : 'No matching customers')}
        data={filtered}
        columns={columns}
        searchPlaceholder="Filter this page…"
        loading={kycLoading && subModule === 'kyc-queue'}
        onRowClick={(row) => open360(row)}
      />

      <AdminConfirmDialog
        isOpen={!!confirm}
        variant="warning"
        icon="📧"
        title={confirm?.type === 'single'
          ? `Send KYC reminder to ${confirm?.user?.name || confirm?.user?.id}?`
          : `Send KYC reminders to ${confirm?.ids?.length || 0} eligible users?`}
        description="Preview recipients below. After send, those users leave the eligible list for the server cooldown (typically 24h)."
        details={[
          { label: 'Recipients', value: confirm?.ids?.length || 0 },
          { label: 'Delivery', value: 'Zoho / SMTP (existing provider)' },
          { label: 'Cooldown', value: 'Enforced server-side' },
        ]}
        confirmLabel={confirm?.type === 'single' ? 'Send reminder' : 'Send to all'}
        onConfirm={() => {
          if (!confirm?.ids?.length) return;
          if (confirm.type === 'single' && confirm.user) {
            sendSingleReminder(confirm.user);
            return;
          }
          sendBulkReminders(confirm.ids);
        }}
        onCancel={() => setConfirm(null)}
        loading={actingId === 'bulk' || (confirm?.user && actingId === confirm.user.id)}
      >
        {confirm?.users?.length > 0 && (
          <div style={{
            marginTop: 10,
            maxHeight: 160,
            overflow: 'auto',
            border: '1px solid var(--admin-border)',
            borderRadius: 8,
            padding: '8px 10px',
            fontSize: '0.76rem',
            background: 'var(--admin-bg)',
          }}
          >
            <strong style={{ display: 'block', marginBottom: 6 }}>Preview (up to 12)</strong>
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {confirm.users.slice(0, 12).map((u) => (
                <li key={u.id}>
                  {u.name || u.id}
                  {' · '}
                  {u.email || 'no email'}
                  {u.cooldownUntil ? ` · cooldown until ${new Date(u.cooldownUntil).toLocaleString('en-IN')}` : ''}
                </li>
              ))}
              {confirm.users.length > 12 && (
                <li>…and {confirm.users.length - 12} more</li>
              )}
            </ul>
          </div>
        )}
      </AdminConfirmDialog>

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
        loading={actionBusy}
      />

      <AdminConfirmDialog
        isOpen={!!unrestrictConfirm}
        variant="success"
        icon="✅"
        title={`Unrestrict user ${unrestrictConfirm?.name || unrestrictConfirm?.id}?`}
        description="Account status will be set back to ACTIVE. Provide a reason for the audit trail."
        requireReason
        reasonPlaceholder="Unrestrict reason..."
        reasonDefault="Admin unrestrict"
        details={[
          { label: 'User ID', value: unrestrictConfirm?.id || '—' },
          { label: 'Email', value: unrestrictConfirm?.email || '—' },
        ]}
        confirmLabel="Remove Restriction"
        onConfirm={(reason) => unrestrictConfirm && handleUnrestrict(unrestrictConfirm, reason)}
        onCancel={() => setUnrestrictConfirm(null)}
        loading={actionBusy}
      />

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
          { label: 'PAN', value: maskPAN(kycRejectConfirm?.panNumber || user360?.kyc?.panMasked) },
        ]}
        confirmLabel="Reject KYC"
        onConfirm={(reason) => kycRejectConfirm && handleKycDecision(kycRejectConfirm, 'REJECTED', reason)}
        onCancel={() => setKycRejectConfirm(null)}
        loading={actionBusy}
      />

      <AdminConfirmDialog
        isOpen={!!walletConfirm}
        variant="warning"
        icon="💳"
        title="Request wallet adjustment"
        description="Creates a maker-checker request. Amount and reason are required."
        requireReason
        reasonPlaceholder="Adjustment reason..."
        details={[
          { label: 'User', value: walletConfirm?.name || walletConfirm?.id || '—' },
          { label: 'Direction', value: walletDirection },
        ]}
        confirmLabel="Submit request"
        onConfirm={handleWalletAdjust}
        onCancel={() => { setWalletConfirm(null); setWalletAmount(''); }}
        loading={actionBusy}
      >
        <div style={{ display: 'flex', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
          <label style={{ flex: '1 1 120px', fontSize: '0.76rem', fontWeight: 700 }}>
            Amount (₹)
            <input
              className="admin-input"
              type="number"
              min="0.01"
              step="0.01"
              value={walletAmount}
              onChange={(e) => setWalletAmount(e.target.value)}
              style={{ display: 'block', width: '100%', marginTop: 4 }}
            />
          </label>
          <label style={{ flex: '1 1 120px', fontSize: '0.76rem', fontWeight: 700 }}>
            Direction
            <select
              className="admin-input"
              value={walletDirection}
              onChange={(e) => setWalletDirection(e.target.value)}
              style={{ display: 'block', width: '100%', marginTop: 4 }}
            >
              <option value="CREDIT">CREDIT</option>
              <option value="DEBIT">DEBIT</option>
            </select>
          </label>
        </div>
      </AdminConfirmDialog>

      <AdminConfirmDialog
        isOpen={!!ticketConfirm}
        variant="warning"
        icon="🎫"
        title="Create support ticket"
        description="Opens a new support conversation for this customer."
        details={[
          { label: 'User', value: ticketConfirm?.name || ticketConfirm?.id || '—' },
        ]}
        confirmLabel="Create ticket"
        onConfirm={handleCreateTicket}
        onCancel={() => setTicketConfirm(null)}
        loading={actionBusy}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 4 }}>
          <label style={{ fontSize: '0.76rem', fontWeight: 700 }}>
            Subject
            <input
              className="admin-input"
              value={ticketSubject}
              onChange={(e) => setTicketSubject(e.target.value)}
              style={{ display: 'block', width: '100%', marginTop: 4 }}
            />
          </label>
          <label style={{ fontSize: '0.76rem', fontWeight: 700 }}>
            Category
            <input
              className="admin-input"
              value={ticketCategory}
              onChange={(e) => setTicketCategory(e.target.value)}
              style={{ display: 'block', width: '100%', marginTop: 4 }}
            />
          </label>
          <label style={{ fontSize: '0.76rem', fontWeight: 700 }}>
            Message
            <textarea
              className="admin-input"
              rows={3}
              value={ticketMessage}
              onChange={(e) => setTicketMessage(e.target.value)}
              placeholder="Initial message to the customer…"
              style={{ display: 'block', width: '100%', marginTop: 4, resize: 'vertical' }}
            />
          </label>
        </div>
      </AdminConfirmDialog>

      <AdminDrawer
        isOpen={!!selectedUser}
        onClose={() => { setSelectedUser(null); setUser360(null); setUser360Error(null); }}
        title="Customer 360"
        subtitle={selectedUser
          ? `${user360?.user?.name || selectedUser.name || '—'} · ${selectedUser.id}`
          : ''}
        width={560}
        actions={drawerActions}
      >
        {selectedUser && (
          <>
            {user360Loading && (
              <div style={{ padding: '12px 0', color: 'var(--admin-text-muted)', fontSize: '0.85rem' }}>Loading full dossier…</div>
            )}
            {user360Error && (
              <div style={{ padding: '10px 12px', marginBottom: 12, borderRadius: 8, background: 'rgba(239,68,68,0.1)', color: '#b91c1c', fontSize: '0.82rem' }}>
                {user360Error}
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <AdminTabs tabs={DOSSIER_TABS} active={dossierTab} onChange={setDossierTab} />
            </div>

            {(dossierTab === 'profile') && (
            <AdminCard title="Personal details" accent="var(--admin-info)" style={{ marginBottom: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <DossierField label="Name">{user360?.user?.name || selectedUser.name || '—'}</DossierField>
                <DossierField label="User ID" mono>{selectedUser.id}</DossierField>
                <DossierField label="Email" mono>{user360?.user?.email || selectedUser.email || '—'}</DossierField>
                <DossierField label="Mobile" mono>{user360?.user?.phone || selectedUser.phone || '—'}</DossierField>
                <DossierField label="Date of birth">{user360?.user?.dateOfBirth || selectedUser.dateOfBirth || '—'}</DossierField>
                <DossierField label="Registered">{formatDt(user360?.user?.createdAt) !== '—' ? formatDt(user360?.user?.createdAt) : (selectedUser.regDate || '—')}</DossierField>
                <DossierField label="Last login">{formatDt(user360?.user?.lastLoginAt)}</DossierField>
                <DossierField label="Account">
                  <StatusBadge status={accountStatus || '—'} />
                </DossierField>
                <DossierField label="Risk tier">{user360?.user?.riskTier || '—'}</DossierField>
                <DossierField label="Country / currency">
                  {[user360?.user?.country, user360?.user?.currency].filter(Boolean).join(' · ') || '—'}
                </DossierField>
              </div>
            </AdminCard>
            )}

            {(dossierTab === 'kyc') && (
            <AdminCard title="KYC & identity" accent="var(--admin-warning)" style={{ marginBottom: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <DossierField label="KYC status">
                  <StatusBadge status={kycStatus || '—'} />
                </DossierField>
                <DossierField label="Case">{user360?.kyc?.caseId || selectedUser.caseId || '—'}</DossierField>
                <DossierField label="PAN" mono>
                  {canViewFullPii && user360?.kyc?.panNumber
                    ? user360.kyc.panNumber
                    : (user360?.kyc?.panMasked || maskPAN(selectedUser.panNumber))}
                </DossierField>
                <DossierField label="Aadhaar" mono>
                  {canViewFullPii && user360?.kyc?.aadhaarNumber
                    ? user360.kyc.aadhaarNumber
                    : (user360?.kyc?.aadhaarMasked || maskAadhaar(selectedUser.aadhaarNumber))}
                </DossierField>
                {!canViewFullPii && (user360?.kyc?.hasPan || user360?.kyc?.hasAadhaar) && (
                  <div style={{ gridColumn: '1 / -1', fontSize: '0.72rem', color: 'var(--admin-text-muted)' }}>
                    Full PAN/Aadhaar hidden — API permissions.canViewFullPii is false for this role.
                  </div>
                )}
                <DossierField label="Legal-name source">
                  <StatusBadge status={user360?.kyc?.legalNameSource || 'UNAVAILABLE'} />
                </DossierField>
                <div style={{ gridColumn: '1 / -1', fontSize: '0.72rem', color: 'var(--admin-text-muted)' }}>
                  {user360?.kyc?.legalNameNote
                    || 'Aadhaar/PAN user-entered data is not OTP-verified identity without a KYC provider.'}
                </div>
              </div>
            </AdminCard>
            )}

            {(dossierTab === 'bank') && (
            <AdminCard title="Bank / beneficiary" accent="#0ea5e9" style={{ marginBottom: '12px' }}>
              {!user360?.bankBeneficiary ? (
                <div style={{ color: 'var(--admin-text-muted)', fontSize: '0.85rem' }}>
                  {user360Loading ? 'Loading…' : 'No beneficiary snapshot.'}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <DossierField label="Method">{user360.bankBeneficiary.method || '—'}</DossierField>
                  <DossierField label="Name match">{user360.bankBeneficiary.nameMatch || user360.bankBeneficiary.nameMatchCode || '—'}</DossierField>
                  <DossierField label="Declared holder">{user360.bankBeneficiary.declaredAccountHolderName || '—'}</DossierField>
                  <DossierField label="Verified KYC name">{user360.bankBeneficiary.verifiedKycName || '—'}</DossierField>
                  <DossierField label="Verified beneficiary">{user360.bankBeneficiary.verifiedBeneficiaryName || '—'}</DossierField>
                  <DossierField label="Beneficiary verified">{user360.bankBeneficiary.beneficiaryVerified ? 'Yes' : 'No'}</DossierField>
                  <DossierField label="UPI (masked)">{user360.bankBeneficiary.upiIdMasked || '—'}</DossierField>
                  <DossierField label="Account (masked)">{user360.bankBeneficiary.accountMasked || '—'}</DossierField>
                  <div style={{ gridColumn: '1 / -1', fontSize: '0.72rem', color: 'var(--admin-text-muted)' }}>
                    {user360.bankBeneficiary.upiNote}
                  </div>
                </div>
              )}
            </AdminCard>
            )}

            {(dossierTab === 'wallet') && (
            <>
            <AdminCard title="Wallet & money" accent="var(--admin-success)" style={{ marginBottom: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: 12 }}>
                <DossierStat label="Present balance" value={money(user360?.money?.availableBalance ?? user360?.wallet?.balance ?? selectedUser.balance)} accent="#059669" />
                <DossierStat label="Bonus" value={money(user360?.money?.bonusBalance ?? user360?.wallet?.bonusBalance)} />
                <DossierStat label="Reserved" value={money(user360?.money?.reservedBalance ?? user360?.wallet?.reservedBalance)} />
                <DossierStat label="Locked deposit" value={money(user360?.money?.lockedDepositBalance ?? user360?.wallet?.lockedDepositBalance)} />
                <DossierStat label="Winnings" value={money(user360?.money?.winningsBalance ?? user360?.wallet?.winningsBalance)} />
                {(user360?.money?.freebetBalance != null || user360?.wallet?.freebetBalance != null) && (
                  <DossierStat label="Freebet" value={money(user360?.money?.freebetBalance ?? user360?.wallet?.freebetBalance)} />
                )}
                <DossierStat label="Net deposits" value={money(user360?.money?.netDeposits)} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <DossierField label="Total deposited">
                  {money(user360?.money?.totalDeposited)}
                  <span style={{ color: 'var(--admin-text-muted)', fontWeight: 600, fontSize: '0.75rem' }}>
                    {' '}({user360?.money?.depositCount ?? 0} txns)
                  </span>
                </DossierField>
                <DossierField label="Total withdrawn">
                  {money(user360?.money?.totalWithdrawn)}
                  <span style={{ color: 'var(--admin-text-muted)', fontWeight: 600, fontSize: '0.75rem' }}>
                    {' '}({user360?.money?.withdrawalCount ?? 0} txns)
                  </span>
                </DossierField>
                <DossierField label="Pending withdrawal">{money(user360?.money?.pendingWithdrawal)}</DossierField>
              </div>
            </AdminCard>
            </>
            )}

            {(dossierTab === 'recon') && (
            <AdminCard title="Reconciliation (flag-only)" accent="#0ea5e9" style={{ marginBottom: '12px' }}>
              {!user360?.reconciliation ? (
                <div style={{ fontSize: '0.82rem', color: 'var(--admin-text-muted)' }}>
                  {user360Loading ? 'Loading…' : 'No reconciliation snapshot.'}
                </div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: 12 }}>
                    <DossierStat
                      label="Reconciled"
                      value={user360.reconciliation.isReconciled ? 'Yes' : 'No'}
                      accent={user360.reconciliation.isReconciled ? '#059669' : '#dc2626'}
                    />
                    <DossierStat label="Delta" value={money(user360.reconciliation.delta)} accent={user360.reconciliation.delta > 0 ? '#dc2626' : undefined} />
                    <DossierField label="Current balance">{money(user360.reconciliation.currentBalance)}</DossierField>
                    <DossierField label="Reconstructed">{money(user360.reconciliation.reconstructedBalance)}</DossierField>
                    <DossierField label="Ledger entries">{user360.reconciliation.ledgerEntries ?? '—'}</DossierField>
                    <DossierField label="Open recon cases">{user360.reconciliation.openCaseCount ?? 0}</DossierField>
                    <DossierField label="Policy">{user360.reconciliation.note || 'Flag-only — never auto-repairs balances'}</DossierField>
                  </div>
                  {(user360.reconciliation.openCases || []).length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflow: 'auto' }}>
                      {user360.reconciliation.openCases.slice(0, 20).map((c) => (
                        <div key={c.id} style={{ fontSize: '0.76rem', borderBottom: '1px solid var(--admin-border)', paddingBottom: 4 }}>
                          <div style={{ fontWeight: 700 }}>
                            <StatusBadge status={c.severity || c.status || 'OPEN'} /> {c.id} · {c.type || '—'}
                          </div>
                          <div style={{ color: 'var(--admin-text-muted)', fontSize: '0.7rem' }}>
                            {c.status} · {formatDt(c.detected_at || c.detectedAt)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </AdminCard>
            )}

            {(dossierTab === 'vip') && (
            <AdminCard title="VIP" accent="#c084fc" style={{ marginBottom: '12px' }}>
              {!user360?.vip ? (
                <div style={{ fontSize: '0.82rem', color: 'var(--admin-text-muted)' }}>
                  {user360Loading ? 'Loading…' : 'No VIP snapshot.'}
                </div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: 12 }}>
                    <DossierStat label="Tier" value={user360.vip.tier || 'BRONZE'} />
                    <DossierStat label="VIP club" value={user360.vip.isVip ? 'Yes' : 'No'} />
                    <DossierStat label="Points" value={user360.vip.points ?? 0} />
                    <DossierStat label="VIP points" value={user360.vip.vipPoints ?? 0} />
                    <DossierField label="Monthly period">{user360.vip.monthlyPeriod || '—'}</DossierField>
                    <DossierField label="Monthly claimed">{user360.vip.monthlyClaimed ? 'Yes' : 'No'}</DossierField>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted)', marginBottom: 10 }}>
                    {user360.vip.note || 'VIP never bypasses KYC, withdrawal risk, fraud, maker-checker, RG, or RBAC.'}
                  </div>
                  {(user360.vip.history || []).slice(0, 10).map((h, i) => (
                    <div key={`${h.changed_at || i}`} style={{ fontSize: '0.74rem', marginBottom: 4 }}>
                      {(h.previous_tier || '?')} → <strong>{h.new_tier || '?'}</strong>
                      {h.reason ? ` · ${h.reason}` : ''}
                      <span style={{ color: 'var(--admin-text-muted)' }}> · {formatDt(h.changed_at)}</span>
                    </div>
                  ))}
                </>
              )}
            </AdminCard>
            )}

            {(dossierTab === 'bets') && (
            <AdminCard title="Betting (lifetime)" accent="#6366f1" style={{ marginBottom: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: 12 }}>
                <DossierStat label="Bets placed" value={user360?.betting?.totalBets ?? '—'} />
                <DossierStat label="Total stake" value={money(user360?.betting?.totalStake)} />
                <DossierStat label="Won payout" value={money(user360?.betting?.totalWonPayout)} accent="#059669" />
                <DossierStat label="Open bets" value={user360?.betting?.openBets ?? '—'} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', fontSize: '0.78rem' }}>
                <DossierField label="Won">{user360?.betting?.wonBets ?? '—'}</DossierField>
                <DossierField label="Lost">{user360?.betting?.lostBets ?? '—'}</DossierField>
                <DossierField label="Void">{user360?.betting?.voidBets ?? '—'}</DossierField>
                <DossierField label="Cashout">{user360?.betting?.cashedOutBets ?? '—'}</DossierField>
              </div>
              {user360?.recentBets?.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--admin-text-muted)', marginBottom: 6, textTransform: 'uppercase' }}>Recent bets</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflow: 'auto' }}>
                    {user360.recentBets.slice(0, 10).map((b) => (
                      <div key={b.bet_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.78rem', padding: '6px 8px', borderRadius: 6, background: 'var(--admin-surface-2, rgba(0,0,0,0.03))' }}>
                        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {b.match_id || b.bet_id} · ₹{Number(b.stake).toLocaleString()} @ {b.odds}
                        </span>
                        <StatusBadge status={b.status} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </AdminCard>
            )}

            {(dossierTab === 'txns') && (
            <AdminCard title="Recent transactions" accent="#059669" style={{ marginBottom: '12px' }}>
              {!user360?.recentTransactions?.length ? (
                <div style={{ fontSize: '0.82rem', color: 'var(--admin-text-muted)' }}>
                  {user360Loading ? 'Loading…' : 'No transactions available.'}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420, overflow: 'auto' }}>
                  {user360.recentTransactions.slice(0, 40).map((t) => (
                    <div key={t.transactionId || t.id || t.transaction_id} style={{ fontSize: '0.78rem', borderBottom: '1px solid var(--admin-border)', paddingBottom: 6 }}>
                      <div style={{ fontWeight: 700 }}>{t.type || 'TXN'} · {money(t.amount)}</div>
                      <div style={{ color: 'var(--admin-text-muted)' }}>{t.status || '—'} · {t.transactionId || t.id || t.transaction_id}</div>
                      <div style={{ color: 'var(--admin-text-muted)', fontSize: '0.7rem' }}>{formatDt(t.createdAt || t.created_at)}</div>
                    </div>
                  ))}
                </div>
              )}
            </AdminCard>
            )}

            {(dossierTab === 'promotions') && (
            <AdminCard title="Promotions" accent="#8b5cf6" style={{ marginBottom: '12px' }}>
              {!user360?.promotions ? (
                <div style={{ fontSize: '0.82rem', color: 'var(--admin-text-muted)' }}>
                  {user360Loading ? 'Loading…' : 'No promotion data.'}
                </div>
              ) : (
                <>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: 6 }}>Bonuses</div>
                  {!(user360.promotions.bonuses || []).length ? (
                    <div style={{ fontSize: '0.78rem', color: 'var(--admin-text-muted)', marginBottom: 12 }}>No bonuses.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12, maxHeight: 180, overflow: 'auto' }}>
                      {user360.promotions.bonuses.slice(0, 15).map((b) => (
                        <div key={b.id || b.promotion_id} style={{ fontSize: '0.76rem', borderBottom: '1px solid var(--admin-border)', paddingBottom: 4 }}>
                          <div style={{ fontWeight: 700 }}>{b.promo_code || b.promo_name || b.promotion_id || 'Bonus'} · {money(b.bonus_amount)}</div>
                          <div style={{ color: 'var(--admin-text-muted)' }}>{b.status || '—'} · {formatDt(b.created_at)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: 6 }}>Deposit freebet grants</div>
                  {!(user360.promotions.freebetGrants || []).length ? (
                    <div style={{ fontSize: '0.78rem', color: 'var(--admin-text-muted)', marginBottom: 12 }}>No freebet grants.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12, maxHeight: 180, overflow: 'auto' }}>
                      {user360.promotions.freebetGrants.slice(0, 15).map((g) => (
                        <div key={g.grant_id || g.id} style={{ fontSize: '0.76rem', borderBottom: '1px solid var(--admin-border)', paddingBottom: 4 }}>
                          <div style={{ fontWeight: 700 }}>Freebet {money(g.freebet_amount)} · deposit {money(g.deposit_amount)}</div>
                          <div style={{ color: 'var(--admin-text-muted)' }}>{g.status || '—'} · {formatDt(g.created_at)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: 6 }}>Signup claims</div>
                  {!(user360.promotions.signupClaims || []).length ? (
                    <div style={{ fontSize: '0.78rem', color: 'var(--admin-text-muted)' }}>No signup promo claims.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 140, overflow: 'auto' }}>
                      {user360.promotions.signupClaims.slice(0, 10).map((c) => (
                        <div key={c.id || c.code} style={{ fontSize: '0.76rem', borderBottom: '1px solid var(--admin-border)', paddingBottom: 4 }}>
                          <div style={{ fontWeight: 700 }}>{c.code || 'CODE'} · {c.reward_type || '—'} · {money(c.amount)}</div>
                          <div style={{ color: 'var(--admin-text-muted)' }}>{formatDt(c.created_at)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </AdminCard>
            )}

            {(dossierTab === 'risk') && (
            <AdminCard title="Risk" accent="#dc2626" style={{ marginBottom: '12px' }}>
              {!user360?.risk ? (
                <div style={{ fontSize: '0.82rem', color: 'var(--admin-text-muted)' }}>
                  {user360Loading ? 'Loading…' : 'No risk snapshot.'}
                </div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: 12 }}>
                    <DossierStat label="Risk tier" value={user360.risk.riskTier || '—'} />
                    <DossierStat label="Account status" value={user360.risk.accountStatus || '—'} />
                    <DossierStat label="Open fraud cases" value={user360.risk.openFraudCases ?? '—'} accent={user360.risk.openFraudCases > 0 ? '#dc2626' : undefined} />
                    <DossierStat label="Signals" value={(user360.risk.signals || []).length} />
                  </div>
                  {!(user360.risk.signals || []).length ? (
                    <div style={{ fontSize: '0.78rem', color: 'var(--admin-text-muted)' }}>No recent risk signals.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflow: 'auto' }}>
                      {user360.risk.signals.slice(0, 20).map((s) => (
                        <div key={s.signal_id || `${s.signal_type}-${s.created_at}`} style={{ fontSize: '0.76rem', borderBottom: '1px solid var(--admin-border)', paddingBottom: 4 }}>
                          <div style={{ fontWeight: 700 }}>{s.signal_type || 'SIGNAL'} · {s.severity || '—'}</div>
                          <div style={{ color: 'var(--admin-text-muted)', fontSize: '0.7rem' }}>{formatDt(s.created_at)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </AdminCard>
            )}

            {(dossierTab === 'ops') && (
            <AdminCard title="Operations" accent="#f59e0b" style={{ marginBottom: '12px' }}>
              {!user360 ? (
                <div style={{ fontSize: '0.82rem', color: 'var(--admin-text-muted)' }}>
                  {user360Loading ? 'Loading…' : 'No ops data.'}
                </div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: 12 }}>
                    <DossierStat label="Open ops alerts" value={(user360.ops?.openAlerts || []).length} accent={(user360.ops?.openAlerts || []).length ? '#dc2626' : undefined} />
                    <DossierStat label="Open incidents" value={(user360.ops?.openIncidents || []).length} />
                    <DossierStat label="Open withdrawals" value={(user360.ops?.openWithdrawals || []).length} />
                    <DossierStat label="Promo abuse open" value={(user360.ops?.promoAbuseAlerts || []).length} />
                    <DossierField label="Promo email" value={user360.marketingPreferences?.marketingEmail === false ? 'Opted out' : 'Opted in'} />
                    <DossierField label="Transactional email" value="Always on (mandatory)" />
                  </div>
                  {(user360.ops?.openWithdrawals || []).slice(0, 8).map((w) => (
                    <div key={w.withdrawalId} style={{ fontSize: '0.76rem', borderBottom: '1px solid var(--admin-border)', paddingBottom: 6, marginBottom: 6 }}>
                      <div style={{ fontWeight: 700 }}>{w.withdrawalId} · ₹{Number(w.amount || 0).toLocaleString()} · {w.status}</div>
                      <div style={{ color: 'var(--admin-text-muted)' }}>
                        Risk {w.riskLevel || '—'} ({w.riskScore ?? '—'})
                        {w.makerAdminId ? ` · Maker ${w.makerAdminId}` : ''}
                        {w.checkerAdminId ? ` · Checker ${w.checkerAdminId}` : ''}
                      </div>
                      {Array.isArray(w.riskSignals) && w.riskSignals.length > 0 && (
                        <div style={{ color: 'var(--admin-text-muted)', fontSize: '0.7rem' }}>
                          Signals: {w.riskSignals.map((s) => (typeof s === 'string' ? s : s.rule || s.code || JSON.stringify(s))).join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                  {(user360.ops?.openAlerts || []).slice(0, 10).map((a) => (
                    <div key={a.notification_id} style={{ fontSize: '0.76rem', marginBottom: 4 }}>
                      <strong>{a.severity || 'ALERT'}</strong> {a.title} · {a.status}
                    </div>
                  ))}
                  {(user360.ops?.openIncidents || []).slice(0, 8).map((i) => (
                    <div key={i.id} style={{ fontSize: '0.76rem', marginBottom: 4 }}>
                      <strong>{i.severity}</strong> {i.title} · {i.status}
                    </div>
                  ))}
                </>
              )}
            </AdminCard>
            )}

            {(dossierTab === 'devices') && (
            <AdminCard title="Devices & sessions" accent="#0ea5e9" style={{ marginBottom: '12px' }}>
              {!user360?.devices?.length ? (
                <div style={{ fontSize: '0.82rem', color: 'var(--admin-text-muted)' }}>
                  {user360Loading ? 'Loading…' : 'No devices registered for this user.'}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {user360.devices.map((d) => (
                    <div
                      key={d.deviceId || d.device_id || d.id}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: '1px solid var(--admin-border)',
                        fontSize: '0.78rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <strong>{d.deviceName || d.os || d.browser || d.deviceId || 'Device'}</strong>
                        <StatusBadge status={d.isActiveSession || d.is_active_session ? 'ACTIVE' : 'IDLE'} />
                      </div>
                      <div style={{ color: 'var(--admin-text-muted)', marginTop: 4 }}>
                        {[d.os, d.browser, d.ipAddress || d.ip_address].filter(Boolean).join(' · ') || '—'}
                      </div>
                      <div style={{ color: 'var(--admin-text-muted)', fontSize: '0.7rem', marginTop: 2 }}>
                        Last seen: {formatDt(d.lastSeenAt || d.last_seen_at || d.updatedAt)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </AdminCard>
            )}

            {(dossierTab === 'rg') && (
            <AdminCard title="Responsible gaming" accent="#f59e0b" style={{ marginBottom: '12px' }}>
              {!user360?.responsibleGaming ? (
                <div style={{ fontSize: '0.82rem', color: 'var(--admin-text-muted)' }}>
                  {user360Loading ? 'Loading…' : 'No RG limits configured for this user.'}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <DossierField label="Deposit limit (daily)">{money(user360.responsibleGaming.depositLimitDaily)}</DossierField>
                  <DossierField label="Loss limit (daily)">{money(user360.responsibleGaming.lossLimitDaily)}</DossierField>
                  <DossierField label="Stake limit / bet">{money(user360.responsibleGaming.stakeLimitPerBet)}</DossierField>
                  <DossierField label="Session limit">{user360.responsibleGaming.sessionLimitMinutes != null ? `${user360.responsibleGaming.sessionLimitMinutes}m` : '—'}</DossierField>
                  <DossierField label="Reality check">{user360.responsibleGaming.realityCheckIntervalMins != null ? `${user360.responsibleGaming.realityCheckIntervalMins}m` : '—'}</DossierField>
                  <DossierField label="Cooling off until">{formatDt(user360.responsibleGaming.coolingOffUntil)}</DossierField>
                  <DossierField label="Self-excluded until">{formatDt(user360.responsibleGaming.selfExcludedUntil)}</DossierField>
                  <DossierField label="Updated">{formatDt(user360.responsibleGaming.updatedAt)}</DossierField>
                </div>
              )}
            </AdminCard>
            )}

            {(dossierTab === 'referrals') && (
            <AdminCard title="Referrals" accent="#ec4899" style={{ marginBottom: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <DossierField label="Code" mono>{user360?.referrals?.code || '—'}</DossierField>
                <DossierField label="Referred out">{user360?.referrals?.referredOut ?? '—'}</DossierField>
                <DossierField label="Referred in">{user360?.referrals?.referredIn ?? '—'}</DossierField>
                <DossierField label="Qualified out">{user360?.referrals?.qualifiedOut ?? '—'}</DossierField>
              </div>
            </AdminCard>
            )}

            {(dossierTab === 'support') && (
            <>
            <AdminCard title="Support tickets" accent="#f59e0b" style={{ marginBottom: '12px' }}>
              {!user360Loading && (!user360?.tickets || user360.tickets.length === 0) ? (
                <div style={{ fontSize: '0.82rem', color: 'var(--admin-text-muted)' }}>No support tickets for this user.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(user360?.tickets || []).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        if (onNavigate && t.id) {
                          onNavigate({
                            domainId: 'support',
                            subModuleId: 'ticket-queue',
                            entityType: 'ticket',
                            entityId: t.id,
                          });
                        }
                      }}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: '1px solid var(--admin-border, rgba(0,0,0,0.08))',
                        background: 'transparent',
                        textAlign: 'left',
                        cursor: onNavigate ? 'pointer' : 'default',
                        color: 'inherit',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                        <strong style={{ fontSize: '0.84rem' }}>{t.subject}</strong>
                        <StatusBadge status={t.status} />
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)', marginTop: 4 }}>
                        {t.id} · {t.category} · {t.priority} · {t.agent} · {t.createdAt || '—'}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </AdminCard>

            <AdminCard title="Notifications history" accent="#8b5cf6" style={{ marginBottom: '12px' }}>
              {!user360?.notifications?.length ? (
                <div style={{ fontSize: '0.82rem', color: 'var(--admin-text-muted)' }}>
                  {user360Loading ? 'Loading…' : 'No notifications.'}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflow: 'auto' }}>
                  {user360.notifications.slice(0, 15).map((n) => (
                    <div key={n.id} style={{ fontSize: '0.78rem', padding: '6px 8px', borderRadius: 6, background: 'var(--admin-surface-2, rgba(0,0,0,0.03))' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <strong>{n.subject || n.eventType}</strong>
                        <StatusBadge status={n.status} />
                      </div>
                      <div style={{ color: 'var(--admin-text-muted)', marginTop: 2 }}>
                        {n.channel} · {n.category} · {formatDt(n.createdAt)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </AdminCard>
            </>
            )}

            {(dossierTab === 'audit') && (
            <AdminCard title="Audit trail" accent="#64748b" style={{ marginBottom: '12px' }}>
              {!user360?.auditTrail?.length ? (
                <div style={{ fontSize: '0.82rem', color: 'var(--admin-text-muted)' }}>
                  {user360Loading ? 'Loading…' : 'No audit events.'}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflow: 'auto' }}>
                  {user360.auditTrail.slice(0, 20).map((a) => (
                    <div key={a.id} style={{ fontSize: '0.78rem', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--admin-border, rgba(0,0,0,0.06))' }}>
                      <div style={{ fontWeight: 700 }}>{a.action}</div>
                      <div style={{ color: 'var(--admin-text-muted)' }}>
                        {a.actorId} · {formatDt(a.createdAt)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </AdminCard>
            )}

            {(dossierTab === 'timeline') && (
            <AdminCard title="Recent activity" accent="var(--admin-text-muted)" style={{ marginBottom: '12px' }}>
              {!user360?.timeline?.length ? (
                <div style={{ fontSize: '0.82rem', color: 'var(--admin-text-muted)' }}>
                  {user360Loading ? 'Loading…' : 'No recent activity.'}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflow: 'auto' }}>
                  {user360.timeline.slice(0, 20).map((item, i) => (
                    <div key={`${item.type}-${item.id || i}`} style={{ display: 'grid', gridTemplateColumns: '72px 1fr', gap: 8, fontSize: '0.78rem' }}>
                      <span style={{
                        fontWeight: 800,
                        fontSize: '0.65rem',
                        letterSpacing: '0.04em',
                        color: item.type === 'BET' ? '#6366f1' : item.type === 'TRANSACTION' ? '#059669' : '#64748b',
                      }}>
                        {item.type}
                      </span>
                      <div>
                        <div style={{ fontWeight: 700 }}>{item.title}</div>
                        <div style={{ color: 'var(--admin-text-muted)' }}>{item.details}</div>
                        <div style={{ color: 'var(--admin-text-muted)', fontSize: '0.7rem' }}>{formatDt(item.timestamp)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </AdminCard>
            )}
          </>
        )}
      </AdminDrawer>
    </div>
  );
}
