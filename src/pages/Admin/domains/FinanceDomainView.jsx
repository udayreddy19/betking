import React, { useState, useEffect, useMemo } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import { useAdminToast } from '../components/AdminToastContext';
import { StatusBadge } from '../components/AdminBadge';
import AdminConfirmDialog from '../components/AdminConfirmDialog';

function money(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `₹${Number(n).toLocaleString()}`;
}

function matchBadge(bm) {
  if (!bm) return { label: '—', tone: 'neutral' };
  if (bm.nameMatch === 'MATCHED') return { label: '✓ MATCHED', tone: 'ok' };
  if (bm.nameMatch === 'MISMATCH') return { label: '✕ MISMATCH', tone: 'bad' };
  if (bm.nameMatch === 'AMBIGUOUS') return { label: '⚠ AMBIGUOUS', tone: 'warn' };
  if (bm.code === 'KYC_NOT_VERIFIED') return { label: 'KYC REQUIRED', tone: 'bad' };
  if (bm.dependency) return { label: 'SOURCE UNAVAILABLE', tone: 'warn' };
  return { label: bm.nameMatch || '—', tone: 'neutral' };
}

function MakerCheckerPanel() {
  const [withdrawals, setWithdrawals] = useState([]);
  const [error, setError] = useState(null);
  const [approveTarget, setApproveTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [nameLookup, setNameLookup] = useState(null);
  const [fetchingNameId, setFetchingNameId] = useState(null);
  const [processing, setProcessing] = useState(false);
  const { showToast } = useAdminToast();

  const load = () => {
    adminApiClient.get('/finance/withdrawals/pending')
      .then((data) => {
        setWithdrawals(data.requests || []);
        setError(data.note || null);
      })
      .catch((err) => {
        setWithdrawals([]);
        setError(err.message || 'Failed to load withdrawals');
      });
  };

  useEffect(() => { load(); }, []);

  const handleFetchName = async (row) => {
    if (!row?.id || fetchingNameId) return;
    setFetchingNameId(row.id);
    try {
      const data = await adminApiClient.get(`/finance/withdrawals/${encodeURIComponent(row.id)}/name`);
      setNameLookup(data);
      if (data.beneficiaryMatch) {
        setWithdrawals((prev) => prev.map((w) => (
          w.id === row.id ? { ...w, beneficiaryMatch: data.beneficiaryMatch } : w
        )));
      }
      if (data.declaredAccountHolderName || data.verifiedBeneficiaryName) {
        showToast(
          `Name: ${data.declaredAccountHolderName || data.verifiedBeneficiaryName}`,
          'success',
        );
      }
    } catch (err) {
      showToast(err.message || 'Could not fetch name', 'error');
    } finally {
      setFetchingNameId(null);
    }
  };

  const handleApproveWithdrawal = async () => {
    if (!approveTarget) return;
    setProcessing(true);
    try {
      await adminApiClient.post(`/finance/withdrawals/${approveTarget.id}/approve`, { reqId: approveTarget.id });
      showToast(`Withdrawal ${approveTarget.id} approved.`, 'success');
      load();
    } catch (err) {
      showToast(err.message || 'Approval failed', 'error');
    } finally {
      setProcessing(false);
      setApproveTarget(null);
    }
  };

  const handleRejectWithdrawal = async (reason) => {
    if (!rejectTarget) return;
    setProcessing(true);
    try {
      await adminApiClient.post(`/finance/withdrawals/${rejectTarget.id}/reject`, { reqId: rejectTarget.id, reason });
      showToast(`Withdrawal ${rejectTarget.id} rejected.`, 'success');
      load();
    } catch (err) {
      showToast(err.message || 'Rejection failed', 'error');
    } finally {
      setProcessing(false);
      setRejectTarget(null);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>06 · Maker-Checker Withdrawal Approvals</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          Pending withdrawals from PostgreSQL. Approve or reject with an audit trail.
          Beneficiary ↔ KYC name match is evaluated server-side from verified sources only.
          Use Fetch name to view the declared account-holder name on the request.
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.78rem' }}>{error}</p>}
      </div>

      <AdminDataTable
        title="Pending Withdrawal Requests"
        emptyMessage="No pending withdrawals"
        data={withdrawals}
        onRefresh={load}
        columns={[
          { header: 'Request ID', key: 'id' },
          { header: 'User ID', key: 'userId' },
          { header: 'Customer', key: 'userName' },
          { header: 'Amount (₹)', key: 'amount', render: (r) => (
            <span style={{ fontWeight: 800, color: 'var(--admin-text)' }}>{money(r.amount)}</span>
          )},
          { header: 'Method', key: 'method' },
          {
            header: 'Name match',
            key: 'beneficiaryMatch',
            sortable: false,
            render: (r) => {
              const b = matchBadge(r.beneficiaryMatch);
              const color = b.tone === 'ok' ? '#16a34a' : b.tone === 'bad' ? '#dc2626' : b.tone === 'warn' ? '#ca8a04' : 'var(--admin-text-muted)';
              return <span style={{ fontWeight: 700, fontSize: '0.72rem', color }}>{b.label}</span>;
            },
          },
          { header: 'UTR', key: 'utr', render: (r) => (
            <span className="admin-text-mono" style={{ fontSize: '0.76rem' }}>{r.utr || '—'}</span>
          )},
          { header: 'Requested', key: 'requestedAt' },
          {
            header: 'Action',
            key: 'action',
            sortable: false,
            render: (r) => (
              <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                <button type="button" className="admin-btn admin-btn--success admin-btn--sm" onClick={() => setApproveTarget(r)}>
                  Approve
                </button>
                <button type="button" className="admin-btn admin-btn--danger admin-btn--sm" onClick={() => setRejectTarget(r)}>
                  Reject
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn--secondary admin-btn--sm"
                  disabled={fetchingNameId === r.id}
                  onClick={() => handleFetchName(r)}
                  title="Fetch declared / verified account-holder name"
                >
                  {fetchingNameId === r.id ? 'Fetching…' : 'Fetch name'}
                </button>
              </div>
            ),
          },
        ]}
      />

      {/* Approve Confirm */}
      <AdminConfirmDialog
        isOpen={!!approveTarget}
        variant="success"
        icon="✅"
        title="Approve Withdrawal"
        description="Funds will be released to the user's bank account. This action is irreversible."
        details={[
          { label: 'Request ID', value: approveTarget?.id || '—' },
          { label: 'User', value: approveTarget?.userName || approveTarget?.userId || '—' },
          { label: 'Amount', value: money(approveTarget?.amount) },
          { label: 'Method', value: approveTarget?.method || '—' },
          { label: 'KYC STATUS', value: approveTarget?.beneficiaryMatch?.kycVerified ? '✓ VERIFIED' : '✕ NOT VERIFIED' },
          { label: 'BANK / BENEFICIARY', value: approveTarget?.beneficiaryMatch?.beneficiaryVerified ? '✓ VERIFIED' : '✕ NOT VERIFIED (no provider source)' },
          { label: 'NAME MATCH', value: matchBadge(approveTarget?.beneficiaryMatch).label },
          {
            label: 'APPROVAL',
            value: approveTarget?.beneficiaryMatch?.enforced
              ? (approveTarget?.beneficiaryMatch?.approvalAllowed ? 'ALLOWED' : 'BLOCKED BY SERVER RULE')
              : 'GATE OFF (WITHDRAWAL_REQUIRE_BENEFICIARY_KYC_MATCH≠1)',
          },
          ...(approveTarget?.beneficiaryMatch?.reason
            ? [{ label: 'Detail', value: approveTarget.beneficiaryMatch.reason }]
            : []),
          ...(approveTarget?.beneficiaryMatch?.dependency
            ? [{ label: 'Dependency', value: approveTarget.beneficiaryMatch.dependency }]
            : []),
        ]}
        confirmLabel="Approve Withdrawal"
        onConfirm={handleApproveWithdrawal}
        onCancel={() => setApproveTarget(null)}
        loading={processing}
      />

      {/* Reject Confirm */}
      <AdminConfirmDialog
        isOpen={!!rejectTarget}
        variant="danger"
        icon="❌"
        title="Reject Withdrawal"
        description="Funds will be released back to the user's wallet balance. A rejection reason is required."
        requireReason
        reasonPlaceholder="Rejection reason (e.g. Failed verification, KYC incomplete)..."
        reasonDefault="Failed verification"
        details={[
          { label: 'Request ID', value: rejectTarget?.id || '—' },
          { label: 'User', value: rejectTarget?.userName || rejectTarget?.userId || '—' },
          { label: 'Amount', value: money(rejectTarget?.amount) },
        ]}
        confirmLabel="Reject Withdrawal"
        onConfirm={handleRejectWithdrawal}
        onCancel={() => setRejectTarget(null)}
        loading={processing}
      />

      {/* Fetch name result */}
      <AdminConfirmDialog
        isOpen={!!nameLookup}
        variant="warning"
        icon="🪪"
        title="Fetched account name"
        description="Names below are returned by the server. Declared name is user-entered on the withdrawal request — not a bank name-enquiry result."
        details={[
          { label: 'Request ID', value: nameLookup?.withdrawalId || '—' },
          { label: 'Customer', value: nameLookup?.userName || nameLookup?.userId || '—' },
          { label: 'Method', value: nameLookup?.method || '—' },
          {
            label: 'DECLARED NAME',
            value: nameLookup?.declaredAccountHolderName
              ? `${nameLookup.declaredAccountHolderName} (user-entered)`
              : '— not provided on this request',
          },
          {
            label: 'VERIFIED BENEFICIARY',
            value: nameLookup?.verifiedBeneficiaryName || '— not available (no bank provider)',
          },
          {
            label: 'VERIFIED KYC NAME',
            value: nameLookup?.verifiedKycName || '— not available on KYC record',
          },
          { label: 'NAME MATCH', value: matchBadge(nameLookup?.beneficiaryMatch).label },
          { label: 'Bank details', value: nameLookup?.bankDetailsMasked || '—' },
          ...(nameLookup?.note ? [{ label: 'Note', value: nameLookup.note }] : []),
        ]}
        confirmLabel="Close"
        cancelLabel="Dismiss"
        onConfirm={() => setNameLookup(null)}
        onCancel={() => setNameLookup(null)}
        auditNotice={false}
      />
    </div>
  );
}

function LedgerPanel({ focusEntityId = null, focusEntityType = null, onFocusConsumed = null }) {
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState(null);
  const [filterQ, setFilterQ] = useState('');

  useEffect(() => {
    let cancelled = false;
    adminApiClient.get('/finance/ledger?limit=100')
      .then((data) => {
        if (cancelled) return;
        setEntries(data.ledgerEntries || data.entries || []);
        setError(data.note || data.error || null);
      })
      .catch((err) => {
        if (cancelled) return;
        setEntries([]);
        setError(err.message || 'Failed to load ledger entries');
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!focusEntityId) return undefined;
    const type = String(focusEntityType || '').toLowerCase();
    if (type && !['transaction', 'transactions', 'user', 'users', 'withdrawal', 'withdrawals', ''].includes(type)) {
      return undefined;
    }
    setFilterQ(String(focusEntityId));
    onFocusConsumed?.();
    return undefined;
  }, [focusEntityId, focusEntityType, onFocusConsumed]);

  const filtered = useMemo(() => {
    if (!filterQ.trim()) return entries;
    const q = filterQ.trim().toLowerCase();
    return entries.filter((r) => {
      const hay = [
        r.id, r.entry_id, r.transactionId, r.transaction_id,
        r.walletId, r.wallet_id, r.userId, r.user_id, r.description, r.type,
      ].map((v) => String(v || '').toLowerCase()).join(' ');
      return hay.includes(q);
    });
  }, [entries, filterQ]);

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>06 · Double-Entry Ledger</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          Authoritative wallet ledger entries from PostgreSQL (most recent first).
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.78rem' }}>{error}</p>}
      </div>

      <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="admin-input"
          value={filterQ}
          onChange={(e) => setFilterQ(e.target.value)}
          placeholder="Filter by txn / wallet / user id…"
          style={{ minWidth: 240, flex: '1 1 200px' }}
        />
        {filterQ && (
          <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => setFilterQ('')}>
            Clear
          </button>
        )}
      </div>

      <AdminDataTable
        title="Ledger Entries"
        emptyMessage="No ledger entries recorded yet"
        data={filtered}
        columns={[
          { header: 'Entry ID', key: 'id', render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.76rem' }}>{r.id || r.entry_id}</span> },
          { header: 'Wallet ID', key: 'walletId', render: (r) => r.walletId || r.wallet_id },
          { header: 'Txn ID', key: 'transactionId', render: (r) => (
            <span
              className="admin-text-mono"
              style={{
                fontSize: '0.76rem',
                fontWeight: filterQ && String(r.transactionId || r.transaction_id || '').includes(filterQ) ? 800 : 400,
                color: filterQ && String(r.transactionId || r.transaction_id || '').includes(filterQ) ? '#2563eb' : undefined,
              }}
            >
              {r.transactionId || r.transaction_id}
            </span>
          ) },
          { header: 'Type', key: 'type', render: (r) => <StatusBadge status={r.type} /> },
          { header: 'Amount (₹)', key: 'amount', render: (r) => <span style={{ fontWeight: 700 }}>{money(r.amount)}</span> },
          { header: 'Balance After', key: 'balanceAfter', render: (r) => money(r.balanceAfter ?? r.balance_after) },
          { header: 'Description', key: 'description' },
          { header: 'Created', key: 'createdAt', render: (r) => r.createdAt || r.created_at },
        ]}
      />
    </div>
  );
}

function PaymentGatewaysPanel() {
  const [gateways, setGateways] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    adminApiClient.get('/finance/gateways')
      .then((data) => {
        if (cancelled) return;
        setGateways(data.gateways || []);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setGateways([]);
        setError(err.message || 'Failed to load payment gateway status');
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>06 · Razorpay & Bank Gateways</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          Payment provider configuration status from server environment (no secrets shown).
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.78rem' }}>{error}</p>}
      </div>

      <AdminDataTable
        title="Payment Gateway Status"
        emptyMessage="No gateway configuration detected"
        data={gateways}
        columns={[
          { header: 'Gateway ID', key: 'id' },
          { header: 'Provider', key: 'name' },
          { header: 'Methods', key: 'methods' },
          { header: 'Status', key: 'status', render: (r) => <StatusBadge status={r.status} /> },
          { header: 'Webhook', key: 'webhook', render: (r) => <StatusBadge status={r.webhook} /> },
          { header: 'Detail', key: 'detail' },
        ]}
      />
    </div>
  );
}

function LegacyLedgerPanel() {
  const [gaps, setGaps] = useState([]);
  const [error, setError] = useState(null);
  const [busyUserId, setBusyUserId] = useState(null);
  const [actionConfirm, setActionConfirm] = useState(null);
  const { showToast } = useAdminToast();

  const load = () => {
    adminApiClient.get('/reconciliation/legacy-wallets')
      .then((data) => {
        setGaps(data.gaps || []);
        setError(null);
      })
      .catch((err) => {
        setGaps([]);
        setError(err.message || 'Failed to load legacy ledger gaps');
      });
  };

  useEffect(() => { load(); }, []);

  const runAction = async (reason) => {
    if (!actionConfirm) return;
    const { userId, action } = actionConfirm;
    setBusyUserId(userId);
    try {
      await adminApiClient.post(`/reconciliation/legacy-wallets/${userId}/${action}`, { reason });
      showToast(`Legacy ledger ${action.replace(/-/g, ' ')} recorded.`, 'success');
      load();
    } catch (err) {
      showToast(err.message || 'Action failed', 'error');
    } finally {
      setBusyUserId(null);
      setActionConfirm(null);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>06 · Legacy Ledger Gaps</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          Wallets where stored balance does not match ledger sum. Accept exception or apply opening ledger credit.
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.78rem' }}>{error}</p>}
      </div>

      <AdminDataTable
        title="Legacy Wallet Gaps"
        emptyMessage="No legacy ledger gaps detected"
        data={gaps}
        columns={[
          { header: 'User ID', key: 'userId' },
          { header: 'Wallet ID', key: 'walletId' },
          { header: 'Stored (₹)', key: 'storedBalance', render: (r) => money(r.storedBalance) },
          { header: 'Ledger (₹)', key: 'ledgerSum', render: (r) => money(r.ledgerSum) },
          { header: 'Gap (₹)', key: 'difference', render: (r) => (
            <span style={{ fontWeight: 800, color: Number(r.difference) > 0 ? '#f43f5e' : '#10b981' }}>{money(r.difference)}</span>
          )},
          { header: 'Class', key: 'classification' },
          {
            header: 'Accepted',
            key: 'acceptedException',
            render: (r) => (r.acceptedException ? <StatusBadge status="ACTIVE" /> : '—'),
          },
          {
            header: 'Actions',
            key: 'actions',
            sortable: false,
            render: (r) => (
              <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  disabled={busyUserId === r.userId}
                  className="admin-btn admin-btn--secondary admin-btn--sm"
                  onClick={() => setActionConfirm({ userId: r.userId, action: 'accept-exception', row: r })}
                  style={{ color: '#f59e0b' }}
                >
                  Accept exception
                </button>
                <button
                  type="button"
                  disabled={busyUserId === r.userId}
                  className="admin-btn admin-btn--success admin-btn--sm"
                  onClick={() => setActionConfirm({ userId: r.userId, action: 'apply-opening-ledger', row: r })}
                >
                  Opening ledger
                </button>
              </div>
            ),
          },
        ]}
      />

      <AdminConfirmDialog
        isOpen={!!actionConfirm}
        variant={actionConfirm?.action === 'accept-exception' ? 'warning' : 'success'}
        icon={actionConfirm?.action === 'accept-exception' ? '⚠️' : '📒'}
        title={actionConfirm?.action === 'accept-exception' ? 'Accept Ledger Exception' : 'Apply Opening Ledger Credit'}
        description={actionConfirm?.action === 'accept-exception'
          ? 'This marks the gap as an accepted exception. No balance mutation will occur.'
          : 'This will create an opening balance ledger entry to reconcile the gap.'}
        requireReason
        reasonPlaceholder="Reason for audit trail..."
        details={[
          { label: 'User', value: actionConfirm?.userId || '—' },
          { label: 'Gap', value: money(actionConfirm?.row?.difference) },
        ]}
        confirmLabel={actionConfirm?.action === 'accept-exception' ? 'Accept Exception' : 'Apply Opening Ledger'}
        onConfirm={runAction}
        onCancel={() => setActionConfirm(null)}
        loading={!!busyUserId}
      />
    </div>
  );
}

function healthFlag(severity, status) {
  const s = String(severity || status || '').toUpperCase();
  if (s === 'CRITICAL' || s === 'HIGH') return 'CRITICAL';
  if (s === 'MEDIUM' || s === 'WARNING' || s === 'DISCREPANCIES_DETECTED') return 'WARNING';
  if (s === 'MISMATCH' || s === 'OPEN') return 'MISMATCH';
  if (s === 'MATCHED' || s === 'RESOLVED' || s === 'HEALTHY_RECONCILED' || s === 'LOW') return 'MATCHED';
  return s || 'WARNING';
}

function FinanceHealthPanel() {
  const [exceptions, setExceptions] = useState([]);
  const [audit, setAudit] = useState(null);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);
  const [actingId, setActingId] = useState(null);
  const [resolveTarget, setResolveTarget] = useState(null);
  const { showToast } = useAdminToast();

  const load = () => {
    adminApiClient.get('/reconciliation/exceptions?limit=50')
      .then((data) => {
        setExceptions(data.exceptions || []);
        setError(null);
      })
      .catch((err) => {
        setExceptions([]);
        setError(err.message || 'Failed to load finance health');
      });
  };

  useEffect(() => { load(); }, []);

  const runAudit = async () => {
    setRunning(true);
    try {
      const result = await adminApiClient.post('/reconciliation/run', {});
      setAudit(result);
      showToast(
        result.overallStatus === 'HEALTHY_RECONCILED'
          ? 'Reconciliation audit clean.'
          : `Audit found ${result.totalNewCasesCreated || 0} case(s). No balances auto-repaired.`,
        result.overallStatus === 'HEALTHY_RECONCILED' ? 'success' : 'warning',
      );
      load();
    } catch (err) {
      showToast(err.message || 'Audit failed', 'error');
    } finally {
      setRunning(false);
    }
  };

  const investigate = async (row) => {
    setActingId(row.id);
    try {
      await adminApiClient.put(`/reconciliation/exceptions/${encodeURIComponent(row.id)}/investigate`, {});
      showToast(`Case ${row.id} → INVESTIGATING`, 'success');
      load();
    } catch (err) {
      showToast(err.message || 'Investigate failed', 'error');
    } finally {
      setActingId(null);
    }
  };

  const resolveCase = async (resolution) => {
    if (!resolveTarget) return;
    setActingId(resolveTarget.id);
    try {
      await adminApiClient.put(`/reconciliation/exceptions/${encodeURIComponent(resolveTarget.id)}/resolve`, {
        resolution: resolution || 'Reviewed — no balance repair applied',
      });
      showToast(`Case ${resolveTarget.id} → RESOLVED (flag cleared; balances unchanged)`, 'success');
      setResolveTarget(null);
      load();
    } catch (err) {
      showToast(err.message || 'Resolve failed', 'error');
    } finally {
      setActingId(null);
    }
  };

  const exportCsv = () => {
    if (!exceptions.length) {
      showToast('No cases to export', 'info');
      return;
    }
    const headers = ['id', 'reconciliation_type', 'entity_id', 'expected_value', 'actual_value', 'difference', 'severity', 'status', 'detected_at'];
    const lines = [
      headers.join(','),
      ...exceptions.map((e) => headers.map((h) => {
        const v = e[h] == null ? '' : String(e[h]).replace(/"/g, '""');
        return `"${v}"`;
      }).join(',')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reconciliation-cases-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported reconciliation cases (audit snapshot only)', 'success');
  };

  const cards = [
    {
      label: 'Overall',
      value: audit?.overallStatus || (exceptions.some((e) => e.status === 'OPEN') ? 'OPEN_CASES' : '—'),
      flag: healthFlag(null, audit?.overallStatus || (exceptions.length ? 'WARNING' : 'MATCHED')),
    },
    {
      label: 'Wallet vs Ledger',
      value: audit?.financialResult
        ? `${audit.financialResult.mismatchCount || 0} mismatch / ${audit.financialResult.totalAudited || 0}`
        : 'Run audit',
      flag: healthFlag(null, (audit?.financialResult?.mismatchCount || 0) > 0 ? 'MISMATCH' : 'MATCHED'),
    },
    {
      label: 'Deposits / Payments',
      value: audit?.paymentResult
        ? `${audit.paymentResult.casesCreated || 0} new cases`
        : 'Run audit',
      flag: healthFlag(null, (audit?.paymentResult?.casesCreated || 0) > 0 ? 'WARNING' : 'MATCHED'),
    },
    {
      label: 'Settlement',
      value: audit?.settlementResult
        ? `${audit.settlementResult.casesCreated || 0} new cases`
        : 'Run audit',
      flag: healthFlag(null, (audit?.settlementResult?.casesCreated || 0) > 0 ? 'WARNING' : 'MATCHED'),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>06 · Finance Health Center</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
            Wallet↔ledger, deposit, withdrawal, and settlement reconciliation. Flags only — never auto-repairs balances.
          </p>
          {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.78rem' }}>{error}</p>}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="admin-btn admin-btn--secondary" onClick={exportCsv}>
            Export CSV
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            disabled={running}
            onClick={runAudit}
          >
            {running ? 'Running audit…' : 'Run reconciliation audit'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 16 }}>
        {cards.map((c) => (
          <div
            key={c.label}
            style={{
              border: '1px solid var(--admin-border)',
              borderRadius: 10,
              padding: '12px 14px',
              background: 'var(--admin-surface)',
            }}
          >
            <div style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted)', fontWeight: 700 }}>{c.label}</div>
            <div style={{ marginTop: 6, fontWeight: 800, fontSize: '0.95rem' }}>{c.value}</div>
            <div style={{ marginTop: 8 }}><StatusBadge status={c.flag} /></div>
          </div>
        ))}
      </div>

      <AdminDataTable
        title="Reconciliation cases"
        emptyMessage="No reconciliation exceptions"
        data={exceptions}
        onRefresh={load}
        columns={[
          { header: 'Case ID', key: 'id' },
          { header: 'Type', key: 'reconciliation_type' },
          { header: 'Entity', key: 'entity_id' },
          { header: 'Expected', key: 'expected_value', render: (r) => money(r.expected_value) },
          { header: 'Actual', key: 'actual_value', render: (r) => money(r.actual_value) },
          { header: 'Delta', key: 'difference', render: (r) => money(r.difference) },
          {
            header: 'Flag',
            key: 'severity',
            render: (r) => <StatusBadge status={healthFlag(r.severity, r.status)} />,
          },
          { header: 'Status', key: 'status', render: (r) => <StatusBadge status={r.status} /> },
          {
            header: 'Detected',
            key: 'detected_at',
            render: (r) => (r.detected_at ? new Date(r.detected_at).toLocaleString('en-IN') : '—'),
          },
          {
            header: 'Action',
            key: 'action',
            sortable: false,
            render: (r) => {
              const busy = actingId === r.id;
              const closed = ['RESOLVED', 'DISMISSED', 'MATCHED'].includes(String(r.status || '').toUpperCase());
              if (closed) return <span style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted)' }}>Closed</span>;
              return (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="admin-btn admin-btn--secondary admin-btn--sm"
                    disabled={busy}
                    onClick={() => investigate(r)}
                  >
                    Investigate
                  </button>
                  <button
                    type="button"
                    className="admin-btn admin-btn--primary admin-btn--sm"
                    disabled={busy}
                    onClick={() => setResolveTarget(r)}
                  >
                    Resolve
                  </button>
                </div>
              );
            },
          },
        ]}
      />

      <AdminConfirmDialog
        isOpen={!!resolveTarget}
        variant="warning"
        icon="📋"
        title={`Resolve case ${resolveTarget?.id}?`}
        description="Marks the exception as reviewed. Does not change wallet or ledger balances."
        requireReason
        reasonPlaceholder="Resolution notes (required)…"
        reasonDefault="Reviewed — no balance repair applied"
        details={resolveTarget ? [
          { label: 'Type', value: resolveTarget.reconciliation_type || '—' },
          { label: 'Entity', value: resolveTarget.entity_id || '—' },
          { label: 'Delta', value: money(resolveTarget.difference) },
          { label: 'Status', value: resolveTarget.status || '—' },
        ] : []}
        confirmLabel="Resolve (no repair)"
        onConfirm={resolveCase}
        onCancel={() => setResolveTarget(null)}
        loading={actingId === resolveTarget?.id}
      />
    </div>
  );
}

export default function FinanceDomainView({
  subModule = 'maker-checker',
  focusEntityId = null,
  focusEntityType = null,
  onFocusConsumed = null,
}) {
  const view = useMemo(() => {
    if (subModule === 'ledger') {
      return (
        <LedgerPanel
          focusEntityId={focusEntityId}
          focusEntityType={focusEntityType}
          onFocusConsumed={onFocusConsumed}
        />
      );
    }
    if (subModule === 'finance-health') return <FinanceHealthPanel />;
    if (subModule === 'legacy-ledger') return <LegacyLedgerPanel />;
    if (subModule === 'payment-gateways') return <PaymentGatewaysPanel />;
    return <MakerCheckerPanel />;
  }, [subModule, focusEntityId, focusEntityType, onFocusConsumed]);

  return view;
}
