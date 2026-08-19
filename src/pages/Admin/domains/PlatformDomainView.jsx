import React, { useState, useEffect } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import { useAdminToast } from '../components/AdminToastContext';

export default function PlatformDomainView({ subModule = 'feature-flags' }) {
  const [apiKeys, setApiKeys] = useState([]);
  const [featureFlags, setFeatureFlags] = useState([]);
  const [error, setError] = useState(null);
  const { showToast } = useAdminToast();

  useEffect(() => {
    let cancelled = false;
    adminApiClient.get('/platform/apikeys')
      .then((data) => {
        if (cancelled) return;
        setApiKeys(data.keys || []);
        setFeatureFlags(data.flags || []);
        setError(data.note || null);
      })
      .catch((err) => {
        if (cancelled) return;
        setApiKeys([]);
        setFeatureFlags([]);
        setError(err.message || 'Failed to load platform config');
      });
    return () => { cancelled = true; };
  }, []);

  const toggleFlag = (flagKey) => {
    const current = featureFlags.find((f) => f.key === flagKey);
    const nextEnabled = !(current?.enabled);
    setFeatureFlags((prev) => prev.map((f) => (f.key === flagKey ? { ...f, enabled: nextEnabled } : f)));
    adminApiClient.post('/platform/flags/toggle', { key: flagKey, enabled: nextEnabled })
      .then(() => showToast(`Flag ${flagKey} → ${nextEnabled ? 'ENABLED' : 'DISABLED'}`, 'success'))
      .catch((err) => {
        setFeatureFlags((prev) => prev.map((f) => (f.key === flagKey ? { ...f, enabled: !nextEnabled } : f)));
        showToast(err.message || 'Flag toggle failed', 'error');
      });
  };

  const heading = subModule === 'api-keys'
    ? '11 · Developer API Keys'
    : '11 · System Feature Flags';
  const hint = subModule === 'api-keys'
    ? 'Registered developer API keys from the platform tables.'
    : 'Sport enable flags and runtime toggles from admin config.';

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>{heading}</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
          {hint}
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#fbbf24', fontSize: '0.82rem' }}>{error}</p>}
      </div>

      {subModule === 'feature-flags' && (
        <div style={{ marginBottom: '24px', padding: '20px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '12px' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '1.05rem' }}>System Feature Flags</h3>
          <div style={{ display: 'grid', gap: '12px' }}>
            {featureFlags.length === 0 && (
              <p style={{ color: 'var(--color-text-muted)', margin: 0 }}>No flags loaded.</p>
            )}
            {featureFlags.map((flag) => (
              <div key={flag.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--color-panel)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                <div>
                  <strong style={{ fontSize: '0.9rem' }}>{flag.key}</strong>
                  <p style={{ margin: '2px 0 0', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>{flag.description}</p>
                </div>
                <button
                  type="button"
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
      )}

      {subModule === 'api-keys' && (
        <AdminDataTable
          title="Developer API Keys"
          emptyMessage="No API keys registered"
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
      )}
    </div>
  );
}
