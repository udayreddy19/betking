import React, { useState, useEffect } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';

export default function PlatformDomainView() {
  const [apiKeys, setApiKeys] = useState([]);
  const [featureFlags, setFeatureFlags] = useState([
    { key: 'ENABLE_RAZORPAY_PAYOUTS', description: 'Automatic withdrawal payout via Razorpay API', enabled: true },
    { key: 'ENABLE_SRL_SIMULATION', description: 'IPL SRL Virtual Cricket Simulation Engine', enabled: true },
    { key: 'ENABLE_MAKER_CHECKER_WITHDRAWAL', description: 'Enforce Finance Admin secondary approval for > ₹10,000', enabled: true },
  ]);

  useEffect(() => {
    adminApiClient.get('/platform/apikeys')
      .then((data) => setApiKeys(data.keys || []))
      .catch(() => {
        setApiKeys([
          { id: 'key-01', name: 'Sportsbook Production API', prefix: 'bk_live_9f82...', scope: 'FULL_READ_WRITE', createdAt: '2026-01-01', status: 'ACTIVE' },
          { id: 'key-02', name: 'Razorpay Payment Gateway Webhook Key', prefix: 'bk_rzp_3a11...', scope: 'WEBHOOK_PAYOUT', createdAt: '2026-01-10', status: 'ACTIVE' },
        ]);
      });
  }, []);

  const toggleFlag = (flagKey) => {
    setFeatureFlags((prev) =>
      prev.map((f) => (f.key === flagKey ? { ...f, enabled: !f.enabled } : f))
    );
    adminApiClient.post('/platform/flags/toggle', { key: flagKey })
      .catch(() => {});
  };

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>11 · Platform Developer Infrastructure & Feature Flags</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
          API key rotation, webhook signature verification, tenant configuration, and real-time feature flags.
        </p>
      </div>

      <div style={{ marginBottom: '24px', padding: '20px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '12px' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: '1.05rem' }}>System Feature Flags</h3>
        <div style={{ display: 'grid', gap: '12px' }}>
          {featureFlags.map((flag) => (
            <div key={flag.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--color-panel)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
              <div>
                <strong style={{ fontSize: '0.9rem' }}>{flag.key}</strong>
                <p style={{ margin: '2px 0 0', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>{flag.description}</p>
              </div>
              <button
                onClick={() => toggleFlag(flag.key)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  background: flag.enabled ? '#10b981' : '#6b7280',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                }}
              >
                {flag.enabled ? 'ENABLED' : 'DISABLED'}
              </button>
            </div>
          ))}
        </div>
      </div>

      <AdminDataTable
        title="Developer API Keys & Service Credentials"
        data={apiKeys}
        columns={[
          { header: 'Key ID', key: 'id' },
          { header: 'Key Name', key: 'name' },
          { header: 'Key Prefix', key: 'prefix' },
          { header: 'Scopes', key: 'scope' },
          { header: 'Created Date', key: 'createdAt' },
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
