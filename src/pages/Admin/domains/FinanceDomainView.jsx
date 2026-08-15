import React, { useState, useEffect, useMemo } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import { useAdminToast } from '../components/AdminToastContext';

function money(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `₹${Number(n).toLocaleString()}`;
}

export default function FinanceDomainView({ subModule = 'maker-checker' }) {
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

  const title = subModule === 'ledger'
    ? '06 · Double-Entry Ledger'
    : '06 · Maker-Checker Withdrawal Approvals';

  const hint = subModule === 'ledger'
    ? 'Ledger view currently surfaces pending cash-out requests awaiting finance action.'
    : 'Pending withdrawals from PostgreSQL. Approve or reject with an audit trail.';

  const rows = useMemo(() => withdrawals, [withdrawals]);

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>{title}</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted, var(--color-text-muted))', fontSize: '0.85rem' }}>
          {hint}
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.82rem' }}>{error}</p>}
      </div>

      <AdminDataTable
        title={subModule === 'ledger' ? 'Cash Movement Queue' : 'Pending Withdrawal Requests'}
        emptyMessage="No pending withdrawals"
        data={rows}
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
