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

function MakerCheckerPanel() {
  const [withdrawals, setWithdrawals] = useState([]);
  const [error, setError] = useState(null);
  const [approveTarget, setApproveTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
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
    </div>
  );
}

function LedgerPanel() {
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState(null);

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

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>06 · Double-Entry Ledger</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          Authoritative wallet ledger entries from PostgreSQL (most recent first).
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.78rem' }}>{error}</p>}
      </div>

      <AdminDataTable
        title="Ledger Entries"
        emptyMessage="No ledger entries recorded yet"
        data={entries}
        columns={[
          { header: 'Entry ID', key: 'id', render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.76rem' }}>{r.id || r.entry_id}</span> },
          { header: 'Wallet ID', key: 'walletId', render: (r) => r.walletId || r.wallet_id },
          { header: 'Txn ID', key: 'transactionId', render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.76rem' }}>{r.transactionId || r.transaction_id}</span> },
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

export default function FinanceDomainView({ subModule = 'maker-checker' }) {
  const view = useMemo(() => {
    if (subModule === 'ledger') return <LedgerPanel />;
    if (subModule === 'legacy-ledger') return <LegacyLedgerPanel />;
    if (subModule === 'payment-gateways') return <PaymentGatewaysPanel />;
    return <MakerCheckerPanel />;
  }, [subModule]);

  return view;
}
