import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import { useAdminToast } from '../components/AdminToastContext';
import { useAdminRole, hasPermission, PERMISSIONS } from '../permissions/AdminRBACGate';

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

const filterBarStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '10px',
  marginBottom: '16px',
  alignItems: 'center',
};

const inputStyle = {
  padding: '8px 10px',
  borderRadius: '8px',
  border: '1px solid var(--admin-border, var(--color-border))',
  background: 'var(--admin-surface, #0f172a)',
  color: 'var(--admin-text, #e2e8f0)',
  fontSize: '0.82rem',
  minWidth: '140px',
};

const btnBase = {
  padding: '4px 8px',
  borderRadius: '4px',
  border: '1px solid var(--admin-border, var(--color-border))',
  cursor: 'pointer',
  fontSize: '0.72rem',
  fontWeight: 700,
};

export default function BettingDomainView({ subModule = 'bets-registry' }) {
  const [bets, setBets] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState(subModule === 'settlement-engine' ? 'pending' : '');
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [settlingId, setSettlingId] = useState(null);
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
  }, [subModule]);

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

  const declareBet = (bet, outcome) => {
    if (!canSettle) {
      showToast('Your role cannot declare bet outcomes.', 'error');
      return;
    }
    const label = outcome === 'WON' ? 'Win' : outcome === 'LOST' ? 'Loss' : 'Void (refund)';
    const ok = window.confirm(
      `Declare bet ${bet.id} as ${label}?\n\n`
      + `User: ${bet.userName || bet.userId}\nMatch: ${bet.match}\nMarket: ${bet.market}\n`
      + `Selection: ${bet.selection}\nStake: ${money(bet.stake)}\n\nThis pays or refunds immediately.`,
    );
    if (!ok) return;

    setSettlingId(bet.id);
    adminApiClient.post('/betting/settle', {
      betId: bet.id,
      outcome,
      reason: `Admin declare ${outcome} (${subModule})`,
    })
      .then((res) => {
        showToast(`Bet ${bet.id} → ${res.outcome || outcome}${res.status === 'ALREADY_SETTLED' ? ' (already settled)' : ''}`, 'success');
        load();
      })
      .catch((err) => showToast(err.message || 'Declare failed', 'error'))
      .finally(() => setSettlingId(null));
  };

  const filtered = useMemo(() => {
    if (subModule === 'cashout-reconciliation') {
      return bets.filter((b) => {
        const s = String(b.status || '').toUpperCase();
        return s.includes('CASH') || String(b.selection || '').toLowerCase().includes('cashout');
      });
    }
    return bets;
  }, [bets, subModule]);

  const openCount = filtered.filter((b) => isOpenStatus(b.status)).length;

  const titles = {
    'bets-registry': ['05 · All Bets', 'Browse every bet type and status. Declare open bets to WON / LOST / VOID.', 'Bet Registry'],
    'settlement-engine': ['05 · Pending & Declare', 'Open, pending, and accepted bets — declare any outcome manually.', 'Pending Desk'],
    'cashout-reconciliation': ['05 · Cashout Reconciliation', 'Cashout-related bets for reconciliation review.', 'Cashout Desk'],
  };
  const [heading, hint, tableTitle] = titles[subModule] || titles['bets-registry'];

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>{heading}</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted, var(--color-text-muted))', fontSize: '0.85rem' }}>
          {hint}
          {loading ? ' Loading…' : ` · ${filtered.length} shown · ${openCount} open`}
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.82rem' }}>{error}</p>}
        {!canSettle && (
          <p style={{ margin: '8px 0 0', color: '#fbbf24', fontSize: '0.82rem' }}>
            View only — Trading / Finance / Operations / Super Admin can declare outcomes.
          </p>
        )}
      </div>

      <div style={filterBarStyle}>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={inputStyle}
          aria-label="Status filter"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value || 'all'} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={inputStyle}
          aria-label="Bet type filter"
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value || 'all-types'} value={o.value}>{o.label}</option>
          ))}
        </select>
        <input
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') setSearch(searchDraft); }}
          placeholder="Search bet / user / match / market"
          style={{ ...inputStyle, minWidth: '220px', flex: 1 }}
        />
        <button
          type="button"
          onClick={() => setSearch(searchDraft)}
          style={{ ...btnBase, background: 'rgba(59, 130, 246, 0.2)', color: '#93c5fd', padding: '8px 12px' }}
        >
          Search
        </button>
        <button
          type="button"
          onClick={load}
          style={{ ...btnBase, background: 'rgba(148, 163, 184, 0.15)', color: '#cbd5e1', padding: '8px 12px' }}
        >
          Refresh
        </button>
      </div>

      <AdminDataTable
        title={tableTitle}
        emptyMessage="No bets in this view"
        data={filtered}
        columns={[
          { header: 'Bet ID', key: 'id' },
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
          { header: 'Stake', key: 'stake', render: (r) => money(r.stake) },
          { header: 'Odds', key: 'odds', render: (r) => (r.odds != null ? Number(r.odds).toFixed(2) : '—') },
          { header: 'Payout', key: 'payout', render: (r) => money(r.payout) },
          { header: 'Placed', key: 'date' },
          {
            header: 'Status',
            key: 'status',
            render: (r) => {
              const s = String(r.status || '');
              const won = s === 'WON';
              const open = isOpenStatus(s);
              const voided = s === 'VOID' || s === 'REFUNDED';
              const color = won ? '#10b981' : open ? '#60a5fa' : voided ? '#fbbf24' : '#ef4444';
              const bg = won ? 'rgba(16, 185, 129, 0.2)' : open ? 'rgba(59, 130, 246, 0.2)' : voided ? 'rgba(251, 191, 36, 0.2)' : 'rgba(239, 68, 68, 0.2)';
              return (
                <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700, background: bg, color }}>
                  {s}
                </span>
              );
            },
          },
          {
            header: 'Declare',
            key: 'actions',
            sortable: false,
            render: (r) => {
              const open = isOpenStatus(r.status);
              if (!open) {
                return (
                  <span style={{ color: 'var(--admin-text-muted)', fontSize: '0.75rem' }}>
                    {r.settledAt || 'Settled'}
                  </span>
                );
              }
              if (!canSettle) {
                return <span style={{ color: 'var(--admin-text-muted)', fontSize: '0.75rem' }}>No access</span>;
              }
              const busy = settlingId === r.id;
              return (
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => declareBet(r, 'WON')}
                    style={{ ...btnBase, background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', opacity: busy ? 0.5 : 1 }}
                  >
                    Win
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => declareBet(r, 'LOST')}
                    style={{ ...btnBase, background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', opacity: busy ? 0.5 : 1 }}
                  >
                    Lose
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => declareBet(r, 'VOID')}
                    style={{ ...btnBase, background: 'rgba(251, 191, 36, 0.15)', color: '#fbbf24', opacity: busy ? 0.5 : 1 }}
                  >
                    Void
                  </button>
                </div>
              );
            },
          },
        ]}
      />
    </div>
  );
}
