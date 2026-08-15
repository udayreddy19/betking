import React, { useState, useEffect, useMemo } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import { useAdminToast } from '../components/AdminToastContext';

function money(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `₹${Number(n).toLocaleString()}`;
}

export default function BettingDomainView({ subModule = 'bets-registry' }) {
  const [bets, setBets] = useState([]);
  const [error, setError] = useState(null);
  const { showToast } = useAdminToast();

  const load = () => {
    adminApiClient.get('/betting/bets')
      .then((data) => {
        setBets(data.bets || []);
        setError(data.note || null);
      })
      .catch((err) => {
        setBets([]);
        setError(err.message || 'Failed to load bets');
      });
  };

  useEffect(() => { load(); }, []);

  const handleSettle = (bet, outcome) => {
    adminApiClient.post('/betting/settle', { betId: bet.id, outcome })
      .then((res) => {
        showToast(`Bet ${bet.id} settled as ${res.status || outcome}.`, 'success');
        load();
      })
      .catch((err) => showToast(err.message || 'Settlement failed', 'error'));
  };

  const filtered = useMemo(() => {
    if (subModule === 'settlement-engine') {
      return bets.filter((b) => {
        const s = String(b.status || '').toUpperCase();
        return s === 'OPEN' || s === 'PENDING';
      });
    }
    if (subModule === 'cashout-reconciliation') {
      return bets.filter((b) => String(b.status || '').toUpperCase().includes('CASHOUT') || String(b.selection || '').toLowerCase().includes('cashout'));
    }
    return bets;
  }, [bets, subModule]);

  const titles = {
    'bets-registry': ['05 · All Bets Registry', 'Bet registry from PostgreSQL.', 'Bet Registry'],
    'settlement-engine': ['05 · Idempotent Settlement', 'Open/pending bets ready for manual settlement.', 'Settlement Queue'],
    'cashout-reconciliation': ['05 · Cashout Reconciliation', 'Cashout-related bets for reconciliation review.', 'Cashout Desk'],
  };
  const [heading, hint, tableTitle] = titles[subModule] || titles['bets-registry'];

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
        emptyMessage="No bets in this view"
        data={filtered}
        columns={[
          { header: 'Bet ID', key: 'id' },
          { header: 'User ID', key: 'userId' },
          { header: 'Match / Event', key: 'match' },
          { header: 'Selection', key: 'selection' },
          { header: 'Stake (₹)', key: 'stake', render: (r) => money(r.stake) },
          { header: 'Odds', key: 'odds', render: (r) => (r.odds != null ? Number(r.odds).toFixed(2) : '—') },
          { header: 'Potential Payout', key: 'payout', render: (r) => money(r.payout) },
          {
            header: 'Bet Status',
            key: 'status',
            render: (r) => {
              const s = String(r.status || '');
              const won = s.includes('WON');
              const open = s === 'OPEN' || s === 'PENDING';
              return (
                <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700, background: won ? 'rgba(16, 185, 129, 0.2)' : (open ? 'rgba(59, 130, 246, 0.2)' : 'rgba(239, 68, 68, 0.2)'), color: won ? '#10b981' : (open ? '#60a5fa' : '#ef4444') }}>
                  {s}
                </span>
              );
            },
          },
          {
            header: 'Settlement Actions',
            key: 'actions',
            sortable: false,
            render: (r) => {
              const s = String(r.status || '');
              const open = s === 'OPEN' || s === 'PENDING';
              return open ? (
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button type="button" onClick={() => handleSettle(r, 'WIN')} style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--admin-border, var(--color-border))', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', cursor: 'pointer', fontSize: '0.75rem' }}>
                    Settle Win
                  </button>
                  <button type="button" onClick={() => handleSettle(r, 'LOSS')} style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--admin-border, var(--color-border))', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', cursor: 'pointer', fontSize: '0.75rem' }}>
                    Settle Loss
                  </button>
                </div>
              ) : <span style={{ color: 'var(--admin-text-muted)', fontSize: '0.78rem' }}>Settled</span>;
            },
          },
        ]}
      />
    </div>
  );
}
