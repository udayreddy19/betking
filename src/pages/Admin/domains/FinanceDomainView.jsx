import React, { useState, useEffect, useMemo } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import { useAdminToast } from '../components/AdminToastContext';

function money(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `₹${Number(n).toLocaleString()}`;
}

function statusBadge(status) {
  const s = String(status || 'UNKNOWN').toUpperCase();
  const ok = s === 'CONFIGURED' || s === 'ACTIVE' || s === 'VERIFIED';
  const bad = s === 'NOT_CONFIGURED' || s === 'MISSING' || s === 'DOWN';
  return (
    <span style={{
      padding: '2px 8px',
      borderRadius: '4px',
      fontSize: '0.75rem',
      fontWeight: 700,
      background: ok ? 'rgba(16, 185, 129, 0.2)' : bad ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)',
      color: ok ? '#10b981' : bad ? '#f87171' : '#f59e0b',
    }}>
      {s}
    </span>
  );
}

function MakerCheckerPanel() {
  const [withdrawals, setWithdrawals] = useState([]);
  const [error, setError] = useState(null);
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

  const handleApproveWithdrawal = (req) => {
    adminApiClient.post(`/finance/withdrawals/${req.id}/approve`, { reqId: req.id })
      .then(() => {
        showToast(`Withdrawal ${req.id} approved.`, 'success');
        load();
      })
      .catch((err) => showToast(err.message || 'Approval failed', 'error'));
  };

  const handleRejectWithdrawal = (req) => {
    const reason = window.prompt('Rejection reason (required):', 'Failed verification');
    if (!reason?.trim()) return;
    adminApiClient.post(`/finance/withdrawals/${req.id}/reject`, { reqId: req.id, reason: reason.trim() })
      .then(() => {
        showToast(`Withdrawal ${req.id} rejected.`, 'success');
        load();
      })
      .catch((err) => showToast(err.message || 'Rejection failed', 'error'));
  };

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>06 · Maker-Checker Withdrawal Approvals</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted, var(--color-text-muted))', fontSize: '0.85rem' }}>
          Pending withdrawals from PostgreSQL. Approve or reject with an audit trail.
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.82rem' }}>{error}</p>}
      </div>

      <AdminDataTable
        title="Pending Withdrawal Requests"
        emptyMessage="No pending withdrawals"
        data={withdrawals}
        columns={[
          { header: 'Request ID', key: 'id' },
          { header: 'User ID', key: 'userId' },
          { header: 'Customer Name', key: 'userName' },
          { header: 'Amount (₹)', key: 'amount', render: (r) => money(r.amount) },
          { header: 'Payout Method', key: 'method' },
          { header: 'Reference UTR', key: 'utr' },
          { header: 'Requested At', key: 'requestedAt' },
          {
            header: 'Approval Action',
            key: 'action',
            sortable: false,
            render: (r) => (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => handleApproveWithdrawal(r)}
                  style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--admin-border, var(--color-border))', background: 'rgba(16, 185, 129, 0.18)', color: '#10b981', fontWeight: 700, cursor: 'pointer', fontSize: '0.78rem' }}
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => handleRejectWithdrawal(r)}
                  style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--admin-border, var(--color-border))', background: 'rgba(239, 68, 68, 0.14)', color: '#f87171', fontWeight: 700, cursor: 'pointer', fontSize: '0.78rem' }}
                >
                  Reject
                </button>
              </div>
            ),
          },
        ]}
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
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>06 · Double-Entry Ledger</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted, var(--color-text-muted))', fontSize: '0.85rem' }}>
          Authoritative wallet ledger entries from PostgreSQL (most recent first).
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.82rem' }}>{error}</p>}
      </div>

      <AdminDataTable
        title="Ledger Entries"
        emptyMessage="No ledger entries recorded yet"
        data={entries}
        columns={[
          { header: 'Entry ID', key: 'id', render: (r) => r.id || r.entry_id },
          { header: 'Wallet ID', key: 'walletId', render: (r) => r.walletId || r.wallet_id },
          { header: 'Transaction ID', key: 'transactionId', render: (r) => r.transactionId || r.transaction_id },
          { header: 'Type', key: 'type' },
          { header: 'Amount (₹)', key: 'amount', render: (r) => money(r.amount) },
          { header: 'Balance After', key: 'balanceAfter', render: (r) => money(r.balanceAfter ?? r.balance_after) },
          { header: 'Description', key: 'description' },
          { header: 'Created At', key: 'createdAt', render: (r) => r.createdAt || r.created_at },
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
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>06 · Razorpay & Bank Gateways</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted, var(--color-text-muted))', fontSize: '0.85rem' }}>
          Payment provider configuration status from server environment (no secrets shown).
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.82rem' }}>{error}</p>}
      </div>

      <AdminDataTable
        title="Payment Gateway Status"
        emptyMessage="No gateway configuration detected"
        data={gateways}
        columns={[
          { header: 'Gateway ID', key: 'id' },
          { header: 'Provider', key: 'name' },
          { header: 'Methods', key: 'methods' },
          { header: 'Status', key: 'status', render: (r) => statusBadge(r.status) },
          { header: 'Webhook', key: 'webhook', render: (r) => statusBadge(r.webhook) },
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

  const runAction = async (userId, action) => {
    const reason = window.prompt('Reason (required for audit trail):', '');
    if (!reason?.trim()) return;
    setBusyUserId(userId);
    try {
      await adminApiClient.post(`/reconciliation/legacy-wallets/${userId}/${action}`, { reason: reason.trim() });
      showToast(`Legacy ledger ${action.replace(/-/g, ' ')} recorded.`, 'success');
      load();
    } catch (err) {
      showToast(err.message || 'Action failed', 'error');
    } finally {
      setBusyUserId(null);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>06 · Legacy Ledger Gaps</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted, var(--color-text-muted))', fontSize: '0.85rem' }}>
          Wallets where stored balance does not match ledger sum. Accept exception (no balance mutation) or apply opening ledger credit.
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.82rem' }}>{error}</p>}
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
          { header: 'Gap (₹)', key: 'difference', render: (r) => money(r.difference) },
          { header: 'Class', key: 'classification' },
          {
            header: 'Accepted',
            key: 'acceptedException',
            render: (r) => (r.acceptedException ? 'YES' : '—'),
          },
          {
            header: 'Actions',
            key: 'actions',
            sortable: false,
            render: (r) => (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  disabled={busyUserId === r.userId}
                  onClick={() => runAction(r.userId, 'accept-exception')}
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--admin-border, var(--color-border))', background: 'rgba(245, 158, 11, 0.14)', color: '#f59e0b', fontWeight: 700, cursor: 'pointer', fontSize: '0.78rem' }}
                >
                  Accept exception
                </button>
                <button
                  type="button"
                  disabled={busyUserId === r.userId}
                  onClick={() => runAction(r.userId, 'apply-opening-ledger')}
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--admin-border, var(--color-border))', background: 'rgba(16, 185, 129, 0.18)', color: '#10b981', fontWeight: 700, cursor: 'pointer', fontSize: '0.78rem' }}
                >
                  Opening ledger
                </button>
              </div>
            ),
          },
        ]}
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
