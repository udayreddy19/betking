import React, { useState, useEffect } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';

function money(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `₹${Number(n).toLocaleString()}`;
}

export default function GrowthDomainView() {
  const [promos, setPromos] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    adminApiClient.get('/growth/promotions')
      .then((data) => {
        if (cancelled) return;
        setPromos(data.promotions || []);
        setError(data.note || null);
      })
      .catch((err) => {
        if (cancelled) return;
        setPromos([]);
        setError(err.message || 'Failed to load promotions');
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>08 · Growth, Campaigns & VIP Loyalty Systems</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
          Promotions from PostgreSQL. Empty list means no campaigns configured yet.
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.82rem' }}>{error}</p>}
      </div>

      <AdminDataTable
        title="Sportsbook Campaigns & Bonus Rules"
        emptyMessage="No promotions configured"
        data={promos}
        columns={[
          { header: 'Promo ID', key: 'id' },
          { header: 'Campaign Name', key: 'name' },
          { header: 'Promo Code', key: 'code' },
          { header: 'Type', key: 'type', render: (r) => r.type || '—' },
          { header: 'Bonus %', key: 'bonusPct', render: (r) => (r.bonusPct != null ? `${r.bonusPct}%` : '—') },
          { header: 'Max Bonus', key: 'maxBonus', render: (r) => money(r.maxBonus) },
          { header: 'Claims', key: 'claims' },
          {
            header: 'Status',
            key: 'status',
            render: (r) => (
              <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700, background: 'rgba(16, 185, 129, 0.2)', color: '#10b981' }}>
                {r.status}
              </span>
            ),
          },
        ]}
      />
    </div>
  );
}
