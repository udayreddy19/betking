import React, { useState, useEffect, useMemo } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import { useAdminToast } from '../components/AdminToastContext';
import { StatusBadge } from '../components/AdminBadge';
import AdminConfirmDialog from '../components/AdminConfirmDialog';
import AdminPageHeader from '../components/AdminPageHeader';
import AdminFilterBar, { FilterDateRange } from '../components/AdminFilterBar';
import AdminKPI from '../components/AdminKPI';
import { AdminKpiDrillDrawer, useAdminKpiDrilldown } from '../hooks/useAdminKpiDrilldown';
import PaymentGatewaysView from './PaymentGatewaysView';

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

function riskNeedsForce(level) {
  const l = String(level || '').toUpperCase();
  return l === 'HIGH' || l === 'CRITICAL';
}

/** CRITICAL on checker stage requires force+reason; maker step never does. */
function approveNeedsForce(row) {
  const l = String(row?.riskLevel || '').toUpperCase();
  const st = String(row?.status || '').toUpperCase();
  return st === 'PENDING_CHECKER' && l === 'CRITICAL';
}

function approveActionLabel(row) {
  const st = String(row?.status || '').toUpperCase();
  const l = String(row?.riskLevel || '').toUpperCase();
  if (st === 'PENDING_CHECKER') {
    return l === 'CRITICAL' ? 'Force checker approve' : 'Checker approve';
  }
  if (l === 'HIGH' || l === 'CRITICAL') return 'Maker review';
  return 'Approve';
}

function MakerCheckerPanel() {
  const [withdrawals, setWithdrawals] = useState([]);
  const [error, setError] = useState(null);
  const [approveTarget, setApproveTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [holdTarget, setHoldTarget] = useState(null);
  const [nameLookup, setNameLookup] = useState(null);
  const [fetchingNameId, setFetchingNameId] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [filterRisk, setFilterRisk] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
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

  const filtered = withdrawals.filter((w) => {
    if (filterRisk && String(w.riskLevel || '').toUpperCase() !== filterRisk) return false;
    if (filterStatus && String(w.status || '').toUpperCase() !== filterStatus) return false;
    if (filterUser) {
      const q = filterUser.toLowerCase();
      const hay = `${w.userId || ''} ${w.userName || ''} ${w.id || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (dateFrom || dateTo) {
      const ts = w.createdAt || w.created_at || w.requestedAt;
      if (ts) {
        const d = new Date(ts).toISOString().slice(0, 10);
        if (dateFrom && d < dateFrom) return false;
        if (dateTo && d > dateTo) return false;
      }
    }
    return true;
  });

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

  const handleApproveWithdrawal = async (reason) => {
    if (!approveTarget) return;
    const force = approveNeedsForce(approveTarget);
    if (force && !String(reason || '').trim()) {
      showToast('Force-approve requires a reason', 'error');
      return;
    }
    setProcessing(true);
    try {
      const data = await adminApiClient.post(`/finance/withdrawals/${approveTarget.id}/approve`, {
        reqId: approveTarget.id,
        reason: reason || '',
        forceApprove: force,
      });
      const st = String(data?.status || '').toUpperCase();
      showToast(
        st === 'PENDING_CHECKER'
          ? `Maker review recorded for ${approveTarget.id} — awaiting checker.`
          : force
            ? `Withdrawal ${approveTarget.id} force-approved by checker.`
            : `Withdrawal ${approveTarget.id} approved.`,
        'success',
      );
      load();
    } catch (err) {
      showToast(err.message || 'Approval failed', 'error');
    } finally {
      setProcessing(false);
      setApproveTarget(null);
    }
  };

  const handleHoldWithdrawal = async (reason) => {
    if (!holdTarget) return;
    setProcessing(true);
    try {
      await adminApiClient.post(`/finance/withdrawals/${holdTarget.id}/hold`, {
        reason: reason || 'Held for risk review',
      });
      showToast(`Withdrawal ${holdTarget.id} held.`, 'success');
        load();
    } catch (err) {
      showToast(err.message || 'Hold failed', 'error');
    } finally {
      setProcessing(false);
      setHoldTarget(null);
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
      <AdminPageHeader
        title="Withdrawal queue"
        subtitle="Pending withdrawals — risk, name-match, and maker≠checker are enforced server-side. Flag-only visibility here."
        breadcrumbs={[{ label: 'Finance' }, { label: 'Withdrawals' }]}
        banner={error ? <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.78rem' }}>{error}</p> : null}
      />

      <AdminFilterBar label="Filters" style={{ marginBottom: 12 }}>
        <input
          className="admin-input"
          placeholder="Filter user / id"
          value={filterUser}
          onChange={(e) => setFilterUser(e.target.value)}
          style={{ minWidth: 160 }}
        />
        <select className="admin-input" value={filterRisk} onChange={(e) => setFilterRisk(e.target.value)} style={{ width: 140 }}>
          <option value="">All risk</option>
          {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select className="admin-input" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ width: 180 }}>
          <option value="">All status</option>
          {['PENDING_REVIEW', 'HOLD', 'PENDING_CHECKER'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <FilterDateRange from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
      </AdminFilterBar>

      <AdminDataTable
        title="Pending Withdrawal Requests"
        emptyMessage="No pending withdrawals"
        data={filtered}
        onRefresh={load}
        mobilePrimaryKeys={['id', 'userId', 'amount', 'riskLevel', 'status']}
        renderExpandedRow={(r) => {
          const sigs = Array.isArray(r.riskSignals) ? r.riskSignals : [];
          return (
            <div style={{ fontSize: '0.78rem', display: 'grid', gap: 6 }}>
              <div><strong>Maker:</strong> {r.makerAdminId || '—'} · <strong>Checker:</strong> {r.checkerAdminId || '—'}</div>
              <div><strong>Force required:</strong> {approveNeedsForce(r) ? 'Yes (CRITICAL checker)' : 'No'}</div>
              <div>
                <strong>Signals:</strong>{' '}
                {sigs.length
                  ? sigs.map((s) => (typeof s === 'string' ? s : s.rule || s.code || JSON.stringify(s))).join(', ')
                  : '—'}
              </div>
              {r.beneficiaryMatch && (
                <div><strong>Name match:</strong> {r.beneficiaryMatch.nameMatch || r.beneficiaryMatch.code || '—'}</div>
              )}
            </div>
          );
        }}
        columns={[
          { header: 'Request ID', key: 'id' },
          { header: 'User ID', key: 'userId' },
          { header: 'Customer', key: 'userName' },
          { header: 'Amount (₹)', key: 'amount', render: (r) => (
            <span style={{ fontWeight: 800, color: 'var(--admin-text)' }}>{money(r.amount)}</span>
          )},
          {
            header: 'Status',
            key: 'status',
            render: (r) => <StatusBadge status={String(r.status || 'PENDING').toUpperCase()} />,
          },
          { header: 'Method', key: 'method' },
          {
            header: 'Risk',
            key: 'riskLevel',
            render: (r) => {
              const level = String(r.riskLevel || '—').toUpperCase();
              const tone = level === 'CRITICAL' || level === 'HIGH' ? 'bad' : level === 'MEDIUM' ? 'warn' : level === 'LOW' ? 'ok' : 'neutral';
              const color = tone === 'ok' ? '#16a34a' : tone === 'bad' ? '#dc2626' : tone === 'warn' ? '#ca8a04' : 'var(--admin-text-muted)';
              return (
                <span style={{ fontWeight: 700, fontSize: '0.72rem', color }}>
                  {level}{r.riskScore != null ? ` (${r.riskScore})` : ''}
                </span>
              );
            },
          },
          {
            header: 'Signals',
            key: 'riskSignals',
            sortable: false,
            render: (r) => {
              const sigs = Array.isArray(r.riskSignals) ? r.riskSignals : [];
              if (!sigs.length) return '—';
              const labels = sigs.slice(0, 3).map((s) => (typeof s === 'string' ? s : s.rule || s.code || s.signal || 'signal'));
              return <span style={{ fontSize: '0.7rem' }} title={JSON.stringify(sigs)}>{labels.join(', ')}</span>;
            },
          },
          {
            header: 'Maker',
            key: 'makerAdminId',
            render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.7rem' }}>{r.makerAdminId || '—'}</span>,
          },
          {
            header: 'Checker',
            key: 'checkerAdminId',
            render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.7rem' }}>{r.checkerAdminId || '—'}</span>,
          },
          {
            header: 'Risk score',
            key: 'riskScore',
            render: (r) => (r.riskScore != null ? r.riskScore : '—'),
          },
          {
            header: 'KYC',
            key: 'kycStatus',
            render: (r) => {
              const k = String(r.kycStatus || '—').toUpperCase();
              const ok = k === 'VERIFIED' || k === 'APPROVED';
              return (
                <span style={{ fontWeight: 700, fontSize: '0.72rem', color: ok ? '#16a34a' : '#ca8a04' }}>
                  {k}
                </span>
              );
            },
          },
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
                  {approveActionLabel(r)}
                </button>
                <button type="button" className="admin-btn admin-btn--secondary admin-btn--sm" onClick={() => setHoldTarget(r)}>
                  Hold
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
        variant={approveNeedsForce(approveTarget) ? 'warning' : 'success'}
        icon={approveNeedsForce(approveTarget) ? '⚠️' : '✅'}
        title={approveActionLabel(approveTarget)}
        description={
          String(approveTarget?.status || '').toUpperCase() === 'PENDING_CHECKER'
            ? (approveNeedsForce(approveTarget)
              ? `CRITICAL risk — checker must differ from maker (${approveTarget?.makerAdminId || 'maker'}) and provide forceApprove + reason.`
              : `Checker approval required. Maker was ${approveTarget?.makerAdminId || 'another admin'}; you cannot be the same admin.`)
            : riskNeedsForce(approveTarget?.riskLevel)
              ? `Risk is ${String(approveTarget?.riskLevel || '').toUpperCase()}. This records a maker review and moves the request to PENDING_CHECKER for a different admin.`
              : 'Funds will be released to the user\'s bank account. This action is irreversible.'
        }
        requireReason={approveNeedsForce(approveTarget)}
        reasonPlaceholder="Force-approve reason (required for CRITICAL checker)…"
        details={[
          { label: 'Request ID', value: approveTarget?.id || '—' },
          { label: 'User', value: approveTarget?.userName || approveTarget?.userId || '—' },
          { label: 'Amount', value: money(approveTarget?.amount) },
          { label: 'Method', value: approveTarget?.method || '—' },
          { label: 'Status', value: approveTarget?.status || '—' },
          { label: 'Risk level', value: approveTarget?.riskLevel || '—' },
          { label: 'Risk score', value: approveTarget?.riskScore != null ? String(approveTarget.riskScore) : '—' },
          { label: 'Maker', value: approveTarget?.makerAdminId || '—' },
          { label: 'KYC STATUS', value: approveTarget?.kycStatus || (approveTarget?.beneficiaryMatch?.kycVerified ? '✓ VERIFIED' : '✕ NOT VERIFIED') },
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
        confirmLabel={approveActionLabel(approveTarget)}
        onConfirm={handleApproveWithdrawal}
        onCancel={() => setApproveTarget(null)}
        loading={processing}
      />

      <AdminConfirmDialog
        isOpen={!!holdTarget}
        variant="warning"
        icon="⏸"
        title="Hold Withdrawal"
        description="Marks the request as HOLD for further risk review. Reserved funds stay locked."
        requireReason
        reasonPlaceholder="Hold reason (e.g. High risk score, KYC re-check)…"
        reasonDefault="Held for risk review"
        details={[
          { label: 'Request ID', value: holdTarget?.id || '—' },
          { label: 'User', value: holdTarget?.userName || holdTarget?.userId || '—' },
          { label: 'Amount', value: money(holdTarget?.amount) },
          { label: 'Risk level', value: holdTarget?.riskLevel || '—' },
          { label: 'Risk score', value: holdTarget?.riskScore != null ? String(holdTarget.riskScore) : '—' },
          { label: 'KYC', value: holdTarget?.kycStatus || '—' },
        ]}
        confirmLabel="Hold Withdrawal"
        onConfirm={handleHoldWithdrawal}
        onCancel={() => setHoldTarget(null)}
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
  const { showToast } = useAdminToast();
  const [gateways, setGateways] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [reconcilingId, setReconcilingId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [error, setError] = useState(null);
  const [providerFilter, setProviderFilter] = useState('ALL');

  const loadGateways = () => {
    adminApiClient.get('/finance/gateways')
      .then((data) => {
        setGateways(data.gateways || []);
      })
      .catch(() => setGateways([]));
  };

  const loadPayments = () => {
    setLoadingPayments(true);
    let url = '/finance/payments?limit=100';
    if (statusFilter !== 'ALL') url += `&status=${encodeURIComponent(statusFilter)}`;
    if (providerFilter !== 'ALL') url += `&provider=${encodeURIComponent(providerFilter)}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;

    adminApiClient.get(url)
      .then((data) => {
        setPayments(data.payments || []);
        setError(null);
      })
      .catch((err) => {
        setPayments([]);
        setError(err.message || 'Failed to load payments');
      })
      .finally(() => setLoadingPayments(false));
  };

  useEffect(() => {
    loadGateways();
    loadPayments();
  }, [statusFilter, providerFilter, search]);

  const handleReconcile = async (orderId, provider = 'CASHFREE') => {
    if (!orderId) return;
    setReconcilingId(orderId);
    try {
      const endpoint = String(provider).toUpperCase() === 'CASHFREE'
        ? `/finance/cashfree/reconcile/${encodeURIComponent(orderId)}`
        : `/finance/razorpay/reconcile/${encodeURIComponent(orderId)}`;
      const res = await adminApiClient.post(endpoint);
      showToast(res.message || `Order ${orderId} reconciled.`, res.success ? 'success' : 'info');
      loadPayments();
    } catch (err) {
      showToast(err.message || 'Reconciliation failed', 'error');
    } finally {
      setReconcilingId(null);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>06 · Payment Gateways & Live Transactions</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          Server-authoritative Cashfree & Razorpay integration, webhook processing status, and real-time transaction ledger.
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.78rem' }}>{error}</p>}
      </div>

      <AdminDataTable
        title="Gateway Configuration Status"
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

      <div style={{ marginTop: '28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Deposit Transactions ({payments.length})</h3>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              className="admin-input"
              placeholder="Search user, order ID, payment ID…"
              style={{ width: '220px' }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <select
              className="admin-input"
              style={{ width: '130px' }}
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
            >
              <option value="ALL">All Gateways</option>
              <option value="CASHFREE">Cashfree</option>
              <option value="RAZORPAY">Razorpay</option>
            </select>

            <select
              className="admin-input"
              style={{ width: '130px' }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">All Statuses</option>
              <option value="PAID">PAID</option>
              <option value="PENDING">PENDING</option>
              <option value="FAILED">FAILED</option>
            </select>

            <button
              type="button"
              className="admin-btn admin-btn--sm"
              onClick={loadPayments}
              disabled={loadingPayments}
            >
              {loadingPayments ? 'Loading…' : '↻ Refresh'}
            </button>
          </div>
        </div>

        <AdminDataTable
          title="Deposit Transactions"
          emptyMessage="No deposit transactions found"
          data={payments}
          columns={[
            {
              header: 'Deposit ID',
              key: 'depositId',
              render: (r) => <span className="admin-text-mono" style={{ fontWeight: 700 }}>{r.depositId}</span>,
            },
            {
              header: 'Provider',
              key: 'provider',
              render: (r) => (
                <span className="admin-badge" style={{
                  background: r.provider === 'CASHFREE' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                  color: r.provider === 'CASHFREE' ? '#3b82f6' : '#10b981',
                  fontWeight: 700,
                  fontSize: '0.72rem',
                }}>
                  {r.provider || 'CASHFREE'}
                </span>
              ),
            },
            {
              header: 'User',
              key: 'userName',
              render: (r) => (
                <div>
                  <div style={{ fontWeight: 600 }}>{r.userName}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted)' }}>{r.userId}</div>
                </div>
              ),
            },
            {
              header: 'Amount',
              key: 'amount',
              render: (r) => <strong style={{ color: r.status === 'PAID' ? '#10b981' : 'var(--admin-text)' }}>{money(r.amount)}</strong>,
            },
            {
              header: 'Status',
              key: 'status',
              render: (r) => <StatusBadge status={r.status} />,
            },
            {
              header: 'Provider Order ID',
              key: 'providerOrderId',
              render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.75rem' }}>{r.providerOrderId || r.razorpayOrderId || r.cfOrderId || '—'}</span>,
            },
            {
              header: 'Payment ID',
              key: 'providerPaymentId',
              render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.75rem' }}>{r.providerPaymentId || r.razorpayPaymentId || '—'}</span>,
            },
            {
              header: 'Webhook',
              key: 'webhookStatus',
              render: (r) => <StatusBadge status={r.webhookStatus} />,
            },
            {
              header: 'Created At',
              key: 'createdAt',
              render: (r) => (r.createdAt ? new Date(r.createdAt).toLocaleString('en-IN') : '—'),
            },
            {
              header: 'Actions',
              key: 'actions',
              sortable: false,
              render: (r) => (
                <div>
                  {r.status !== 'PAID' && (
                    <button
                      type="button"
                      className="admin-btn admin-btn--sm"
                      disabled={reconcilingId === (r.providerOrderId || r.razorpayOrderId)}
                      onClick={() => handleReconcile(r.providerOrderId || r.razorpayOrderId, r.provider)}
                    >
                      {reconcilingId === (r.providerOrderId || r.razorpayOrderId) ? 'Checking…' : 'Reconcile'}
                    </button>
                  )}
                  {r.status === 'PAID' && (
                    <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 700 }}>✓ Verified</span>
                  )}
                </div>
              ),
            },
          ]}
        />
      </div>
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
  if (s === 'DISCREPANCY') return 'DISCREPANCY';
  if (s === 'MEDIUM' || s === 'WARNING' || s === 'DISCREPANCIES_DETECTED') return 'WARNING';
  if (s === 'MISMATCH' || s === 'OPEN') return 'MISMATCH';
  if (s === 'MATCHED' || s === 'RESOLVED' || s === 'HEALTHY_RECONCILED' || s === 'HEALTHY' || s === 'LOW') return 'MATCHED';
  return s || 'WARNING';
}

function FinanceHealthPanel() {
  const [exceptions, setExceptions] = useState([]);
  const [audit, setAudit] = useState(null);
  const [walletBuckets, setWalletBuckets] = useState(null);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);
  const [actingId, setActingId] = useState(null);
  const [resolveTarget, setResolveTarget] = useState(null);
  const { showToast } = useAdminToast();
  const drill = useAdminKpiDrilldown();

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

  const loadBuckets = () => {
    adminApiClient.get('/reconciliation/wallet-buckets')
      .then((data) => {
        if (data?.walletBuckets) setWalletBuckets(data.walletBuckets);
      })
      .catch(() => { /* optional snapshot — show after audit if unavailable */ });
  };

  useEffect(() => {
    load();
    loadBuckets();
  }, []);

  const runAudit = async () => {
    setRunning(true);
    try {
      const result = await adminApiClient.post('/reconciliation/run', {});
      setAudit(result);
      if (result.walletBuckets) setWalletBuckets(result.walletBuckets);
      showToast(
        result.healthStatus === 'HEALTHY' || result.overallStatus === 'HEALTHY_RECONCILED'
          ? 'Reconciliation audit clean.'
          : `Audit ${result.healthStatus || 'flags'} — ${result.totalNewCasesCreated || 0} case(s). No balances auto-repaired.`,
        result.healthStatus === 'HEALTHY' || result.overallStatus === 'HEALTHY_RECONCILED' ? 'success' : 'warning',
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

  const healthStatus = audit?.healthStatus
    || (exceptions.some((e) => String(e.severity || '').toUpperCase() === 'CRITICAL')
      ? 'CRITICAL'
      : (exceptions.some((e) => e.status === 'OPEN') ? 'WARNING' : null));

  const cards = [
    {
      label: 'Health status',
      metric: 'openReconciliation',
      value: healthStatus || audit?.overallStatus || '—',
      flag: healthFlag(null, healthStatus || audit?.overallStatus || (exceptions.length ? 'WARNING' : 'MATCHED')),
    },
    {
      label: 'Overall',
      metric: 'openReconciliation',
      value: audit?.overallStatus || (exceptions.some((e) => e.status === 'OPEN') ? 'OPEN_CASES' : '—'),
      flag: healthFlag(null, audit?.overallStatus || (exceptions.length ? 'WARNING' : 'MATCHED')),
    },
    {
      label: 'Wallet vs Ledger',
      metric: 'Wallet vs Ledger',
      value: audit?.financialResult
        ? `${audit.financialResult.mismatchCount || 0} mismatch / ${audit.financialResult.totalAudited || 0}`
        : 'Run audit',
      flag: healthFlag(null, (audit?.financialResult?.mismatchCount || 0) > 0 ? 'MISMATCH' : 'MATCHED'),
    },
    {
      label: 'Deposits / Payments',
      metric: 'depositFailures',
      value: audit?.paymentResult
        ? `${audit.paymentResult.casesCreated || 0} new cases`
        : 'Run audit',
      flag: healthFlag(null, (audit?.paymentResult?.casesCreated || 0) > 0 ? 'WARNING' : 'MATCHED'),
    },
    {
      label: 'Settlement',
      metric: 'settlementFailed',
      value: audit?.settlementResult
        ? `${audit.settlementResult.casesCreated || 0} new cases`
        : 'Run audit',
      flag: healthFlag(null, (audit?.settlementResult?.casesCreated || 0) > 0 ? 'WARNING' : 'MATCHED'),
    },
  ];

  const bucketCards = walletBuckets
    ? [
        { label: 'Cash', value: money(walletBuckets.cashBalance) },
        { label: 'Winnings', value: money(walletBuckets.winningsBalance) },
        { label: 'Locked', value: money(walletBuckets.lockedDepositBalance) },
        { label: 'Bonus', value: money(walletBuckets.bonusBalance) },
        { label: 'Freebet', value: money(walletBuckets.freebetBalance) },
        { label: 'Reserved', value: money(walletBuckets.reservedWithdrawalBalance) },
        { label: 'Calculated total', value: money(walletBuckets.calculatedWalletTotal) },
      ]
    : [];

  return (
    <div>
      <AdminPageHeader
        title="Finance Health Center"
        subtitle="Wallet↔ledger, deposit, withdrawal, and settlement reconciliation. Flags only — never auto-repairs balances."
        breadcrumbs={[{ label: 'Finance' }, { label: 'Health' }]}
        banner={error ? <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.78rem' }}>{error}</p> : null}
        actions={(
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
        )}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 16 }}>
        {cards.map((c) => (
          <AdminKPI
            key={c.label}
            label={c.label}
            value={c.value}
            accent="#64748b"
            source="Details"
            trendLabel={c.flag}
            onClick={() => drill.openDrilldown(c.metric, c.label)}
          />
        ))}
      </div>
      <AdminKpiDrillDrawer drill={drill} />

      {bucketCards.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800 }}>Wallet bucket snapshot</h3>
            <span style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted)' }}>
              {walletBuckets?.walletCount != null ? `${walletBuckets.walletCount} wallets · ` : ''}
              {walletBuckets?.note || 'Snapshot only — no auto-repair'}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
            {bucketCards.map((c) => (
              <div
                key={c.label}
                style={{
                  border: '1px solid var(--admin-border)',
                  borderRadius: 8,
                  padding: '10px 12px',
                  background: 'var(--admin-surface)',
                }}
              >
                <div style={{ fontSize: '0.68rem', color: 'var(--admin-text-muted)', fontWeight: 700 }}>{c.label}</div>
                <div style={{ marginTop: 4, fontWeight: 800, fontSize: '0.88rem' }}>{c.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

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

const REFUNDABLE_DEPOSIT = new Set(['CAPTURED', 'SUCCESS', 'COMPLETED']);

function DepositsReviewPanel() {
  const [deposits, setDeposits] = useState([]);
  const [error, setError] = useState(null);
  const [refundTarget, setRefundTarget] = useState(null);
  const [processing, setProcessing] = useState(false);
  const { showToast } = useAdminToast();

  const load = () => {
    adminApiClient.get('/finance/deposits?limit=100')
      .then((data) => {
        setDeposits(data.deposits || []);
        setError(data.error || null);
      })
      .catch((err) => {
        setDeposits([]);
        setError(err.message || 'Failed to load deposits');
      });
  };

  useEffect(() => { load(); }, []);

  const handleRefund = async (reason) => {
    if (!refundTarget) return;
    setProcessing(true);
    try {
      await adminApiClient.post(`/finance/deposits/${encodeURIComponent(refundTarget.depositId || refundTarget.id)}/refund`, {
        reason: reason || 'admin_refund',
      });
      showToast(`Refund requested for ${refundTarget.depositId || refundTarget.id}`, 'success');
      load();
    } catch (err) {
      showToast(err.message || 'Refund failed', 'error');
    } finally {
      setProcessing(false);
      setRefundTarget(null);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>06 · Deposits Review</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          Recent deposits from PostgreSQL. Refund uses the existing Razorpay + ledger refund path.
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.78rem' }}>{error}</p>}
      </div>

      <AdminDataTable
        title="Recent Deposits"
        emptyMessage="No deposits found"
        data={deposits}
        onRefresh={load}
        columns={[
          { header: 'Deposit ID', key: 'depositId', render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.76rem' }}>{r.depositId || r.id}</span> },
          { header: 'User', key: 'userId' },
          { header: 'Amount', key: 'amount', render: (r) => money(r.amount) },
          { header: 'Status', key: 'status', render: (r) => <StatusBadge status={r.status} /> },
          {
            header: 'Payment',
            key: 'razorpayPaymentId',
            hideOnMobile: true,
            render: (r) => r.razorpayPaymentId || '—',
          },
          {
            header: 'Created',
            key: 'createdAt',
            render: (r) => (r.createdAt ? new Date(r.createdAt).toLocaleString('en-IN') : '—'),
          },
          {
            header: 'Action',
            key: 'action',
            sortable: false,
            render: (r) => {
              const ok = REFUNDABLE_DEPOSIT.has(String(r.status || '').toUpperCase());
              if (!ok) return <span style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted)' }}>—</span>;
              return (
                <button
                  type="button"
                  className="admin-btn admin-btn--secondary admin-btn--sm"
                  onClick={() => setRefundTarget(r)}
                >
                  Refund
                </button>
              );
            },
          },
        ]}
      />

      <AdminConfirmDialog
        isOpen={!!refundTarget}
        variant="danger"
        icon="↩"
        title={`Refund deposit ${refundTarget?.depositId || refundTarget?.id}?`}
        description="Triggers Razorpay refund and ledger reversal via the existing finance refund engine."
        requireReason
        reasonPlaceholder="Refund reason…"
        reasonDefault="admin_refund"
        details={refundTarget ? [
          { label: 'User', value: refundTarget.userId || '—' },
          { label: 'Amount', value: money(refundTarget.amount) },
          { label: 'Status', value: refundTarget.status || '—' },
        ] : []}
        confirmLabel="Request refund"
        onConfirm={handleRefund}
        onCancel={() => setRefundTarget(null)}
        loading={processing}
      />
    </div>
  );
}

function FinanceControlCenterPanel() {
  const [kpis, setKpis] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    adminApiClient.get('/finance/control-center')
      .then((data) => { setKpis(data.kpis || null); setError(null); })
      .catch((err) => { setError(err.message); setKpis(null); });
  }, []);

  const cards = [
    { label: 'Deposits (24h)', value: kpis?.deposits24h?.total, sub: `${kpis?.deposits24h?.count ?? '—'} tx` },
    { label: 'Pending WD', value: kpis?.pendingWithdrawals?.total, sub: `${kpis?.pendingWithdrawals?.count ?? '—'} req` },
    { label: 'Held WD', value: kpis?.heldWithdrawals?.total, sub: `${kpis?.heldWithdrawals?.count ?? '—'} req` },
    { label: 'Maker/Checker', value: kpis?.pendingMakerChecker, sub: 'pending' },
    { label: 'Recon warnings', value: kpis?.reconciliationWarnings, sub: 'open cases' },
    { label: 'Critical', value: kpis?.criticalIssues, sub: 'recon' },
    { label: 'Failed tx (24h)', value: kpis?.failedTransactions24h, sub: 'transactions' },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>Finance Control Center</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          Server-side KPIs only. Frontend never mutates balances.
        </p>
        {error && <p style={{ color: '#fbbf24' }}>{error}</p>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        {cards.map((c) => (
          <div key={c.label} className="telemetry-card" style={{ padding: 12 }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted)' }}>{c.label}</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, marginTop: 4 }}>
              {c.value == null
                ? '—'
                : (typeof c.value === 'number' && (c.label.includes('Deposits') || c.label.includes('WD'))
                  ? `₹${Number(c.value).toLocaleString()}`
                  : c.value)}
            </div>
            <div style={{ fontSize: '0.7rem', marginTop: 2 }}>{c.sub}</div>
          </div>
        ))}
      </div>
      {kpis?.settlementQueue?.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: '0.95rem' }}>Settlement queue</h3>
          <AdminDataTable
            title="Settlement"
            data={kpis.settlementQueue}
            columns={[
              { header: 'Status', key: 'status' },
              { header: 'Count', key: 'cnt' },
            ]}
          />
        </div>
      )}
    </div>
  );
}

function DailyClosingPanel() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [pack, setPack] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const { showToast } = useAdminToast();

  const load = () => {
    adminApiClient.get(`/finance/daily-closing?date=${encodeURIComponent(date)}`)
      .then((data) => { setPack(data); setError(null); })
      .catch((err) => { setError(err.message); setPack(null); });
  };

  useEffect(() => { load(); }, [date]);

  const act = async (action) => {
    setBusy(true);
    try {
      const body = { date };
      if (action === 'reopen') {
        const reason = window.prompt('Reopen reason (required):');
        if (!reason) return;
        body.reason = reason;
      }
      const data = await adminApiClient.post(`/finance/daily-closing/${action}`, body);
      setPack(data);
      showToast(`Daily closing → ${data.closing?.status}`, 'success');
    } catch (err) {
      showToast(err.message || 'Action failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const lines = pack?.snapshot?.lines || [];
  const status = pack?.closing?.status || '—';

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>Daily Closing</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
            Flag-only pack. Opening/expected closing UNAVAILABLE without historical snapshots. Never auto-repairs.
          </p>
        </div>
        <label style={{ fontSize: '0.78rem' }}>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ display: 'block', marginTop: 4 }} />
        </label>
        <StatusBadge status={status} />
        <button type="button" className="admin-btn admin-btn--sm" disabled={busy} onClick={() => act('review')}>Review</button>
        <button type="button" className="admin-btn admin-btn--sm" disabled={busy} onClick={() => act('sign-off')}>Sign off</button>
        <button type="button" className="admin-btn admin-btn--sm" disabled={busy} onClick={() => act('reopen')}>Reopen</button>
      </div>
      {error && <p style={{ color: '#fbbf24' }}>{error}</p>}
      <AdminDataTable
        title="Day lines (EXPECTED / ACTUAL / DIFF)"
        data={lines}
        emptyMessage="No snapshot"
        columns={[
          { header: 'Metric', key: 'metric' },
          { header: 'Expected', key: 'expected', render: (r) => (r.expected == null ? 'N/A' : Number(r.expected).toLocaleString()) },
          { header: 'Actual', key: 'actual', render: (r) => (r.actual == null ? 'N/A' : Number(r.actual).toLocaleString()) },
          { header: 'Diff', key: 'difference', render: (r) => (r.difference == null ? 'N/A' : Number(r.difference).toLocaleString()) },
          { header: 'Status', key: 'status', render: (r) => <StatusBadge status={r.status} /> },
          { header: 'Note', key: 'note' },
        ]}
      />
    </div>
  );
}

function FinanceAnomaliesPanel() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);
  const [note, setNote] = useState(null);

  useEffect(() => {
    adminApiClient.get('/finance/anomalies?limit=50')
      .then((data) => {
        setRows(data.anomalies || []);
        setNote(data.note || null);
        setError(null);
      })
      .catch((err) => {
        setError(err.message);
        setRows([]);
      });
  }, []);

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>Financial Anomalies</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          Aggregated from reconciliation, high-risk withdrawals, failed transactions, promo abuse.
        </p>
        {note && <p style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>{note}</p>}
        {error && <p style={{ color: '#fbbf24' }}>{error}</p>}
      </div>
      <AdminDataTable
        title="Anomalies"
        data={rows}
        emptyMessage="No open financial anomalies"
        columns={[
          { header: 'Type', key: 'type' },
          { header: 'Severity', key: 'severity', render: (r) => <StatusBadge status={r.severity} /> },
          { header: 'Status', key: 'status' },
          { header: 'Entity', key: 'affectedEntity' },
          { header: 'Detected', key: 'detectedAt', render: (r) => (r.detectedAt ? new Date(r.detectedAt).toLocaleString() : '—') },
          { header: 'Evidence', key: 'evidence', render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.7rem' }}>{JSON.stringify(r.evidence || {}).slice(0, 80)}</span> },
        ]}
      />
    </div>
  );
}

function WalletInvestigationPanel() {
  const [query, setQuery] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [userSuggestions, setUserSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const { showToast } = useAdminToast();

  const loadUserSuggestions = async (searchStr = '') => {
    setSuggestionsLoading(true);
    try {
      const res = await adminApiClient.get(`/finance/users/lookup?q=${encodeURIComponent(searchStr)}`);
      setUserSuggestions(res.users || []);
    } catch {
      setUserSuggestions([]);
    } finally {
      setSuggestionsLoading(false);
    }
  };

  useEffect(() => {
    loadUserSuggestions('');
  }, []);

  const handleQueryChange = (val) => {
    setQuery(val);
    if (val.trim().length >= 1) {
      loadUserSuggestions(val.trim());
      setShowSuggestions(true);
    }
  };

  const investigateTarget = async (searchTarget) => {
    const q = String(searchTarget || '').trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setShowSuggestions(false);
    try {
      const res = await adminApiClient.get(`/finance/investigate?q=${encodeURIComponent(q)}`);
      setData(res);
      setQuery(res.user?.email || res.user?.userId || q);
      showToast(`Wallet investigation loaded for ${res.user?.email || res.user?.userId}`, 'success');
    } catch (err) {
      setError(err.message || 'No matching user or financial record found');
      setData(null);
      showToast(err.message || 'Investigation query failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    if (e) e.preventDefault();
    investigateTarget(query);
  };

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>Wallet Investigation & Financial Timeline</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          Forensic lookup by User (Name, Email, Phone, User ID) or Reference ID (Tx ID, Bet ID, Withdrawal ID, Deposit ID).
        </p>
      </div>

      {/* SEARCH BAR & USER LOOKUP DROPDOWN */}
      <div style={{ position: 'relative', maxWidth: 720, marginBottom: 24 }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 10 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              type="search"
              placeholder="Lookup by user (Name, Email, Phone, usr_...) or Ref (tx_..., bet_..., wd_...)"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onFocus={() => setShowSuggestions(true)}
              className="admin-input"
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, fontSize: '0.9rem' }}
            />
          </div>
          <button type="submit" className="admin-btn admin-btn--primary" disabled={loading || !query.trim()}>
            {loading ? 'Searching…' : 'Investigate'}
          </button>
        </form>

        {/* QUICK USER SUGGESTIONS / AUTOCOMPLETE */}
        {showSuggestions && userSuggestions.length > 0 && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              zIndex: 50,
              background: 'var(--admin-card-bg, #1e293b)',
              border: '1px solid var(--admin-border, #334155)',
              borderRadius: 8,
              boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
              marginTop: 4,
              maxHeight: 280,
              overflowY: 'auto',
            }}
          >
            <div style={{ padding: '6px 12px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--admin-text-muted)', borderBottom: '1px solid var(--admin-border)' }}>
              {suggestionsLoading ? 'Searching users…' : 'MATCHING USERS (Click to Investigate)'}
            </div>
            {userSuggestions.map((u) => (
              <div
                key={u.userId}
                onClick={() => investigateTarget(u.userId)}
                style={{
                  padding: '10px 14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--admin-border-subtle, rgba(255,255,255,0.05))',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                    {u.displayName || u.email}
                    {u.displayName && <span style={{ color: 'var(--admin-text-muted)', fontSize: '0.78rem', marginLeft: 6 }}>({u.email})</span>}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>
                    ID: <span className="admin-text-mono">{u.userId}</span> {u.phone ? `· Phone: ${u.phone}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, color: '#10b981', fontSize: '0.9rem' }}>
                    ₹{u.balance?.toLocaleString('en-IN') ?? 0}
                  </div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--admin-text-muted)' }}>{u.kycStatus || 'NOT_STARTED'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div style={{ padding: '12px 16px', background: '#fee2e2', color: '#991b1b', borderRadius: 8, marginBottom: 20, fontSize: '0.88rem' }}>
          {error}
        </div>
      )}

      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* USER & WALLET SUMMARY */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {/* USER CARD */}
            <div style={{ background: 'var(--admin-card-bg)', border: '1px solid var(--admin-border)', borderRadius: 12, padding: 20 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: '1rem', fontWeight: 700 }}>Target User Profile</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--admin-text-muted)' }}>User ID:</span>
                  <span className="admin-text-mono" style={{ fontWeight: 600 }}>{data.user?.userId}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--admin-text-muted)' }}>Display Name:</span>
                  <span style={{ fontWeight: 600 }}>{data.user?.displayName || data.user?.fullName || '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--admin-text-muted)' }}>Email:</span>
                  <span style={{ fontWeight: 600 }}>{data.user?.email || '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--admin-text-muted)' }}>Phone:</span>
                  <span>{data.user?.phone || '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--admin-text-muted)' }}>KYC Status:</span>
                  <StatusBadge status={data.user?.kycStatus || 'NOT_STARTED'} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--admin-text-muted)' }}>Account Status:</span>
                  <StatusBadge status={data.user?.status || 'ACTIVE'} />
                </div>
              </div>
            </div>

            {/* WALLET BREAKDOWN CARD */}
            <div style={{ background: 'var(--admin-card-bg)', border: '1px solid var(--admin-border)', borderRadius: 12, padding: 20 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: '1rem', fontWeight: 700 }}>Live Wallet Breakdown</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: '0.85rem' }}>
                <div>
                  <div style={{ color: 'var(--admin-text-muted)', fontSize: '0.75rem' }}>CASH BALANCE</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#10b981' }}>{money(data.wallet?.balance)}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--admin-text-muted)', fontSize: '0.75rem' }}>BONUS BALANCE</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#a855f7' }}>{money(data.wallet?.bonusBalance)}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--admin-text-muted)', fontSize: '0.75rem' }}>FREE BET VALUE</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#3b82f6' }}>{money(data.wallet?.freebetBalance)}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--admin-text-muted)', fontSize: '0.75rem' }}>RESERVED WITHDRAWAL</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f59e0b' }}>{money(data.wallet?.reservedBalance)}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--admin-text-muted)', fontSize: '0.75rem' }}>LOCKED DEPOSIT</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#eab308' }}>{money(data.wallet?.lockedDepositBalance)}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--admin-text-muted)', fontSize: '0.75rem' }}>WINNINGS P&L</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--admin-text)' }}>{money(data.wallet?.winningsBalance)}</div>
                </div>
              </div>
            </div>
          </div>

          {/* CHRONOLOGICAL FINANCIAL TIMELINE */}
          <div style={{ background: 'var(--admin-card-bg)', border: '1px solid var(--admin-border)', borderRadius: 12, padding: 20 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 700 }}>
              Chronological Financial Timeline ({data.timeline?.length || 0} events)
            </h3>

            {(!data.timeline || data.timeline.length === 0) ? (
              <p style={{ color: 'var(--admin-text-muted)', fontSize: '0.88rem' }}>No financial transactions found for this user.</p>
            ) : (
              <AdminDataTable
                data={data.timeline}
                emptyMessage="No transaction events"
                columns={[
                  {
                    header: 'Timestamp',
                    key: 'createdAt',
                    render: (r) => (r.createdAt ? new Date(r.createdAt).toLocaleString('en-IN') : '—'),
                  },
                  {
                    header: 'Event & Description',
                    key: 'type',
                    render: (r) => (
                      <div>
                        <strong>{r.type}</strong>
                        <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>{r.description}</div>
                      </div>
                    ),
                  },
                  {
                    header: 'Amount',
                    key: 'amount',
                    render: (r) => {
                      const isCredit = ['DEPOSIT', 'BET_PAYOUT', 'BET_WIN', 'BET_REFUND', 'BET_VOID', 'CASHOUT', 'BONUS_CLAIM', 'REFERRAL_REWARD', 'ADMIN_CREDIT'].includes(r.type);
                      return (
                        <span style={{ fontWeight: 700, color: isCredit ? '#10b981' : '#ef4444' }}>
                          {isCredit ? '+' : '-'}{money(r.amount)}
                        </span>
                      );
                    },
                  },
                  {
                    header: 'Balance After',
                    key: 'balanceAfter',
                    render: (r) => (r.balanceAfter != null ? money(r.balanceAfter) : '—'),
                  },
                  {
                    header: 'Status',
                    key: 'status',
                    render: (r) => <StatusBadge status={r.status} />,
                  },
                  {
                    header: 'Reference',
                    key: 'id',
                    render: (r) => (
                      <span className="admin-text-mono" style={{ fontSize: '0.75rem' }}>
                        {r.id}
                        {r.utr ? ` · UTR: ${r.utr}` : ''}
                      </span>
                    ),
                  },
                ]}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ReconciliationDashboardPanel() {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const { showToast } = useAdminToast();

  const loadOverview = () => {
    setLoading(true);
    adminApiClient.get('/finance/reconciliation-overview')
      .then((data) => {
        setOverview(data);
      })
      .catch((err) => {
        showToast(err.message || 'Failed to load reconciliation overview', 'error');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadOverview();
  }, []);

  const runReconciliationScan = async () => {
    setScanning(true);
    try {
      const res = await adminApiClient.post('/finance/reconcile', {});
      setScanResult(res);
      showToast('Read-only reconciliation scan completed', 'success');
      loadOverview();
    } catch (err) {
      showToast(err.message || 'Reconciliation scan failed', 'error');
    } finally {
      setScanning(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>Read-Only Financial Reconciliation Dashboard</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
            Authoritative double-entry ledger audit. Non-mutating: never alters balances or deletes records.
          </p>
        </div>
        <button
          type="button"
          className="admin-btn admin-btn--primary"
          disabled={scanning}
          onClick={runReconciliationScan}
        >
          {scanning ? 'Running Read-Only Scan…' : 'Run Read-Only Reconciliation Scan'}
        </button>
      </div>

      {/* KPI METRIC CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
        <div style={{ background: 'var(--admin-card-bg)', border: '1px solid var(--admin-border)', borderRadius: 10, padding: 16 }}>
          <div style={{ color: 'var(--admin-text-muted)', fontSize: '0.75rem', fontWeight: 700 }}>TOTAL ACTIVE WALLETS</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: 4 }}>{overview?.totalWallets ?? '—'}</div>
        </div>

        <div style={{ background: 'var(--admin-card-bg)', border: '1px solid var(--admin-border)', borderRadius: 10, padding: 16 }}>
          <div style={{ color: 'var(--admin-text-muted)', fontSize: '0.75rem', fontWeight: 700 }}>STORED CASH BALANCE SUM</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#10b981', marginTop: 4 }}>{money(overview?.totalCashBalance)}</div>
        </div>

        <div style={{ background: 'var(--admin-card-bg)', border: '1px solid var(--admin-border)', borderRadius: 10, padding: 16 }}>
          <div style={{ color: 'var(--admin-text-muted)', fontSize: '0.75rem', fontWeight: 700 }}>BONUS BALANCE SUM</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#a855f7', marginTop: 4 }}>{money(overview?.totalBonusBalance)}</div>
        </div>

        <div style={{ background: 'var(--admin-card-bg)', border: '1px solid var(--admin-border)', borderRadius: 10, padding: 16 }}>
          <div style={{ color: 'var(--admin-text-muted)', fontSize: '0.75rem', fontWeight: 700 }}>RESERVED WITHDRAWAL SUM</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f59e0b', marginTop: 4 }}>{money(overview?.totalReservedBalance)}</div>
        </div>

        <div style={{ background: 'var(--admin-card-bg)', border: '1px solid var(--admin-border)', borderRadius: 10, padding: 16 }}>
          <div style={{ color: 'var(--admin-text-muted)', fontSize: '0.75rem', fontWeight: 700 }}>NEGATIVE BALANCE WALLETS</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: overview?.negativeBalanceWalletsCount === 0 ? '#10b981' : '#ef4444', marginTop: 4 }}>
            {overview?.negativeBalanceWalletsCount ?? 0}
          </div>
        </div>

        <div style={{ background: 'var(--admin-card-bg)', border: '1px solid var(--admin-border)', borderRadius: 10, padding: 16 }}>
          <div style={{ color: 'var(--admin-text-muted)', fontSize: '0.75rem', fontWeight: 700 }}>ORPHAN LEDGER ENTRIES</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: overview?.orphanLedgerCount === 0 ? '#10b981' : '#ef4444', marginTop: 4 }}>
            {overview?.orphanLedgerCount ?? 0}
          </div>
        </div>
      </div>

      {/* RECONCILIATION SCAN REPORT */}
      {scanResult && (
        <div style={{ background: 'var(--admin-card-bg)', border: '1px solid var(--admin-border)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '1.1rem', fontWeight: 700 }}>Latest Scan Report</h3>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: '0.88rem' }}>
            <div><strong>Status:</strong> {scanResult.status || 'OK'}</div>
            <div><strong>Wallets Scanned:</strong> {scanResult.walletsReconciled || scanResult.totalWallets || overview?.totalWallets}</div>
            <div><strong>Discrepancies Detected:</strong> {scanResult.discrepanciesCount || 0}</div>
            <div><strong>Timestamp:</strong> {new Date().toLocaleTimeString()}</div>
          </div>
        </div>
      )}
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
    if (subModule === 'investigation') return <WalletInvestigationPanel />;
    if (subModule === 'reconciliation') return <ReconciliationDashboardPanel />;
    if (subModule === 'ledger') {
      return (
        <LedgerPanel
          focusEntityId={focusEntityId}
          focusEntityType={focusEntityType}
          onFocusConsumed={onFocusConsumed}
        />
      );
    }
    if (subModule === 'control-center') return <FinanceControlCenterPanel />;
    if (subModule === 'daily-closing') return <DailyClosingPanel />;
    if (subModule === 'anomalies') return <FinanceAnomaliesPanel />;
    if (subModule === 'finance-health') return <FinanceHealthPanel />;
    if (subModule === 'legacy-ledger') return <LegacyLedgerPanel />;
    if (subModule === 'payment-gateways') return <PaymentGatewaysView />;
    if (subModule === 'deposits-review') return <DepositsReviewPanel />;
    return <MakerCheckerPanel />;
  }, [subModule, focusEntityId, focusEntityType, onFocusConsumed]);

  return view;
}

