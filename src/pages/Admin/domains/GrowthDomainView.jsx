import React, { useState, useEffect } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';

export default function GrowthDomainView() {
  const [promos, setPromos] = useState([]);

  useEffect(() => {
    adminApiClient.get('/growth/promotions')
      .then((data) => setPromos(data.promotions || []))
      .catch(() => {
        setPromos([
          { id: 'p-101', name: 'TNPL 100% Deposit Bonus', code: 'TNPL100', bonusPct: 100, maxBonus: 5000, claims: 142, status: 'ACTIVE' },
          { id: 'p-102', name: 'IPL SRL Risk-Free Bet', code: 'SRLFREE', bonusPct: 50, maxBonus: 2000, claims: 89, status: 'ACTIVE' },
          { id: 'p-103', name: 'VIP Loyalty Cashback 10%', code: 'VIPCASH', bonusPct: 10, maxBonus: 10000, claims: 24, status: 'ACTIVE' },
        ]);
      });
  }, []);

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>08 · Growth, Campaigns & VIP Loyalty Systems</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
          Promotions engine, bonus code dispatch, affiliate referral management, and VIP tier eligibility.
        </p>
      </div>

      <AdminDataTable
        title="Active Sportsbook Campaigns & Bonus Rules"
        data={promos}
        columns={[
          { header: 'Promo ID', key: 'id' },
          { header: 'Campaign Name', key: 'name' },
          { header: 'Promo Code', key: 'code' },
          { header: 'Bonus %', key: 'bonusPct', render: (r) => `${r.bonusPct}%` },
          { header: 'Max Bonus', key: 'maxBonus', render: (r) => `₹${r.maxBonus.toLocaleString()}` },
          { header: 'Total Claims', key: 'claims' },
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
