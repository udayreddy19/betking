import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import { useAdminToast } from '../components/AdminToastContext';
import { useAdminRole, hasPermission, PERMISSIONS } from '../permissions/AdminRBACGate';
import { StatusBadge } from '../components/AdminBadge';
import AdminConfirmDialog from '../components/AdminConfirmDialog';
import AdminFilterBar, { FilterSelect, FilterSearch } from '../components/AdminFilterBar';

function money(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `₹${Number(n).toLocaleString()}`;
}

function isOpenStatus(status) {
  const s = String(status || '').toUpperCase();
  return s === 'OPEN' || s === 'PENDING' || s === 'ACCEPTED';
}

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending / Open / Accepted' },
  { value: 'WON', label: 'Won' },
  { value: 'LOST', label: 'Lost' },
  { value: 'VOID', label: 'Void' },
  { value: 'CASHED_OUT', label: 'Cashed out' },
];

const TYPE_OPTIONS = [
  { value: '', label: 'All bet types' },
  { value: 'SINGLE', label: 'Single' },
  { value: 'ACCUMULATOR', label: 'Accumulator' },
  { value: 'PARLAY', label: 'Parlay' },
  { value: 'SYSTEM', label: 'System' },
];

export default function BettingDomainView({
  subModule = 'bets-registry',
  focusEntityId = null,
  focusEntityType = null,
  onFocusConsumed = null,
}) {
  const [bets, setBets] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState(subModule === 'settlement-engine' ? 'pending' : '');
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [highlightId, setHighlightId] = useState(null);
  const [settlingId, setSettlingId] = useState(null);
  const [declareConfirm, setDeclareConfirm] = useState(null);
  const { showToast } = useAdminToast();
  const { activeRole } = useAdminRole();
  const canSettle = hasPermission(activeRole, PERMISSIONS.SETTLE_BETS);

  useEffect(() => {
    if (subModule === 'settlement-engine') setStatusFilter('pending');
    else if (subModule === 'cashout-reconciliation') setStatusFilter('CASHED_OUT');
    else setStatusFilter('');
    setTypeFilter('');
    setSearch('');
    setSearchDraft('');
    setHighlightId(null);
  }, [subModule]);

  useEffect(() => {
    if (!focusEntityId) return undefined;
    const type = String(focusEntityType || 'bet').toLowerCase();
    if (type && !['bet', 'bets', ''].includes(type)) return undefined;
    setSearch(String(focusEntityId));
    setSearchDraft(String(focusEntityId));
    setHighlightId(String(focusEntityId));
    onFocusConsumed?.();
    return undefined;
  }, [focusEntityId, focusEntityType, onFocusConsumed]);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('limit', '300');
    if (statusFilter === 'pending') params.set('pendingOnly', '1');
    else if (statusFilter) params.set('status', statusFilter);
    if (typeFilter) params.set('betType', typeFilter);
    if (search.trim()) params.set('q', search.trim());

    adminApiClient.get(`/betting/bets?${params.toString()}`)
      .then((data) => {
        setBets(data.bets || []);
        setError(data.note || null);
      })
      .catch((err) => {
        setBets([]);
        setError(err.message || 'Failed to load bets');
      })
      .finally(() => setLoading(false));
  }, [statusFilter, typeFilter, search]);

  useEffect(() => { load(); }, [load]);

  const handleDeclare = async () => {
    if (!declareConfirm) return;
    const { bet, outcome } = declareConfirm;
    setSettlingId(bet.id);
    try {
      const res = await adminApiClient.post('/betting/settle', {
        betId: bet.id,
        outcome,
        reason: `Admin declare ${outcome} (${subModule})`,
      });
      showToast(`Bet ${bet.id} → ${res.outcome || outcome}${res.status === 'ALREADY_SETTLED' ? ' (already settled)' : ''}`, 'success');
      load();
    } catch (err) {
      showToast(err.message || 'Declare failed', 'error');
    } finally {
      setSettlingId(null);
      setDeclareConfirm(null);
    }
  };

  const openDeclare = (bet, outcome) => {
    if (!canSettle) {
      showToast('Your role cannot declare bet outcomes.', 'error');
      return;
    }
    setDeclareConfirm({ bet, outcome });
  };

  const filtered = useMemo(() => {
    let list = bets;
    if (subModule === 'cashout-reconciliation') {
      list = bets.filter((b) => {
        const s = String(b.status || '').toUpperCase();
        return s.includes('CASH') || String(b.selection || '').toLowerCase().includes('cashout');
      });
    }
    if (highlightId) {
      const hit = list.filter((b) => String(b.id) === String(highlightId));
      if (hit.length) return hit;
    }
    return list;
  }, [bets, subModule, highlightId]);

  const openCount = filtered.filter((b) => isOpenStatus(b.status)).length;

  const titles = {
    'bets-registry': ['All Bets', 'Browse every bet type and status. Declare open bets to WON / LOST / VOID.', 'Bet Registry'],
    'settlement-engine': ['Pending & Declare', 'Open, pending, and accepted bets — declare any outcome manually.', 'Pending Desk'],
    'cashout-reconciliation': ['Cashout Reconciliation', 'Cashout-related bets for reconciliation review.', 'Cashout Desk'],
  };
  const [heading, hint, tableTitle] = titles[subModule] || titles['bets-registry'];

  const outcomeLabel = declareConfirm?.outcome === 'WON' ? 'Win' : declareConfirm?.outcome === 'LOST' ? 'Loss' : 'Void (refund)';
  const outcomeVariant = declareConfirm?.outcome === 'WON' ? 'success' : declareConfirm?.outcome === 'LOST' ? 'danger' : 'warning';
  const outcomeIcon = declareConfirm?.outcome === 'WON' ? '🏆' : declareConfirm?.outcome === 'LOST' ? '❌' : '↩️';

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '16px' }}>
        <h2 className="admin-page-header__title">{heading}</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          {hint}
          {loading ? ' Loading…' : ` · ${filtered.length} shown · ${openCount} open`}
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.78rem' }}>{error}</p>}
        {!canSettle && (
          <p style={{ margin: '8px 0 0', color: '#fbbf24', fontSize: '0.78rem' }}>
            View only — Trading / Finance / Operations / Super Admin can declare outcomes.
          </p>
        )}
      </div>

      {/* Filter Bar */}
      <AdminFilterBar label="Filters">
        <FilterSelect
          value={statusFilter}
          onChange={setStatusFilter}
          options={STATUS_OPTIONS}
          placeholder=""
        />
        <FilterSelect
          value={typeFilter}
          onChange={setTypeFilter}
          options={TYPE_OPTIONS}
          placeholder=""
        />
        <FilterSearch
          value={searchDraft}
          onChange={setSearchDraft}
          placeholder="Search bet / user / match / market"
          style={{ flex: 1 }}
        />
        <button type="button" className="admin-btn admin-btn--primary admin-btn--sm" onClick={() => setSearch(searchDraft)}>
          Search
        </button>
        <button type="button" className="admin-btn admin-btn--secondary admin-btn--sm" onClick={load}>
          ↻ Refresh
        </button>
      </AdminFilterBar>

      {/* Data Table */}
      <AdminDataTable
        title={tableTitle}
        emptyMessage="No bets in this view"
        data={filtered}
        loading={loading}
        onRefresh={load}
        columns={[
          { header: 'Bet ID', key: 'id', render: (r) => (
            <span
              className="admin-text-mono"
              style={{
                fontSize: '0.76rem',
                fontWeight: highlightId && String(r.id) === String(highlightId) ? 800 : 400,
                color: highlightId && String(r.id) === String(highlightId) ? '#2563eb' : undefined,
              }}
            >
              {r.id}
            </span>
          ) },
          {
            header: 'User',
            key: 'userName',
            render: (r) => (
              <span title={r.userId || ''}>{r.userName || r.userId || '—'}</span>
            ),
          },
          { header: 'Match', key: 'match' },
          { header: 'Market', key: 'market' },
          { header: 'Type', key: 'betType' },
          { header: 'Selection', key: 'selection' },
          { header: 'Stake', key: 'stake', render: (r) => <span style={{ fontWeight: 700 }}>{money(r.stake)}</span> },
          { header: 'Odds', key: 'odds', render: (r) => (r.odds != null ? Number(r.odds).toFixed(2) : '—') },
          { header: 'Payout', key: 'payout', render: (r) => money(r.payout) },
          { header: 'Placed', key: 'date' },
          {
            header: 'Status',
            key: 'status',
            render: (r) => <StatusBadge status={r.status} />,
          },
          {
            header: 'Declare',
            key: 'actions',
            sortable: false,
            render: (r) => {
              const open = isOpenStatus(r.status);
              if (!open) {
                return (
                  <span style={{ color: 'var(--admin-text-muted)', fontSize: '0.73rem', fontVariantNumeric: 'tabular-nums' }}>
                    {r.settledAt || 'Settled'}
                  </span>
                );
              }
              if (!canSettle) {
                return <span style={{ color: 'var(--admin-text-dim)', fontSize: '0.73rem' }}>No access</span>;
              }
              const busy = settlingId === r.id;
              return (
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  <button type="button" disabled={busy} className="admin-btn admin-btn--success admin-btn--sm" onClick={() => openDeclare(r, 'WON')}>
                    Win
                  </button>
                  <button type="button" disabled={busy} className="admin-btn admin-btn--danger admin-btn--sm" onClick={() => openDeclare(r, 'LOST')}>
                    Lose
                  </button>
                  <button type="button" disabled={busy} className="admin-btn admin-btn--secondary admin-btn--sm" onClick={() => openDeclare(r, 'VOID')} style={{ color: '#fbbf24' }}>
                    Void
                  </button>
                </div>
              );
            },
          },
        ]}
      />

      {/* Declare Outcome Confirm */}
      <AdminConfirmDialog
        isOpen={!!declareConfirm}
        variant={outcomeVariant}
        icon={outcomeIcon}
        title={`Declare bet as ${outcomeLabel}?`}
        description={declareConfirm?.outcome === 'VOID'
          ? 'The stake will be refunded to the user\'s wallet. This action is logged and irreversible.'
          : declareConfirm?.outcome === 'WON'
            ? 'The payout will be credited to the user\'s wallet immediately. This action is logged and irreversible.'
            : 'The user\'s stake is forfeited. This action is logged and irreversible.'}
        details={declareConfirm ? [
          { label: 'Bet ID', value: declareConfirm.bet.id },
          { label: 'User', value: declareConfirm.bet.userName || declareConfirm.bet.userId || '—' },
          { label: 'Match', value: declareConfirm.bet.match || '—' },
          { label: 'Market', value: declareConfirm.bet.market || '—' },
          { label: 'Selection', value: declareConfirm.bet.selection || '—' },
          { label: 'Stake', value: money(declareConfirm.bet.stake) },
          { label: 'Potential Payout', value: money(declareConfirm.bet.payout) },
        ] : []}
        confirmLabel={`Declare ${outcomeLabel}`}
        onConfirm={handleDeclare}
        onCancel={() => setDeclareConfirm(null)}
        loading={!!settlingId}
      />
    </div>
  );
}
