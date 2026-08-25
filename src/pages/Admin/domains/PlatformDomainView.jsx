import React, { useState, useEffect } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import { useAdminToast } from '../components/AdminToastContext';
import { StatusBadge } from '../components/AdminBadge';
import AdminCard from '../components/AdminCard';
import DatabaseInspector from '../../../components/DatabaseInspector/DatabaseInspector';

export default function PlatformDomainView({ subModule = 'feature-flags' }) {
  const [apiKeys, setApiKeys] = useState([]);
  const [featureFlags, setFeatureFlags] = useState([]);
  const [error, setError] = useState(null);
  const { showToast } = useAdminToast();

  useEffect(() => {
    if (subModule === 'database-tables') return undefined;
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
  }, [subModule]);

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

  if (subModule === 'database-tables') {
    return <DatabaseInspector />;
  }

  const heading = subModule === 'api-keys'
    ? '11 · Developer API Keys'
    : '11 · System Feature Flags';
  const hint = subModule === 'api-keys'
    ? 'Registered developer API keys from the platform tables.'
    : 'Sport enable flags and runtime toggles from admin config.';

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>{heading}</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          {hint}
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#fbbf24', fontSize: '0.78rem' }}>{error}</p>}
      </div>

      {subModule === 'feature-flags' && (
        <AdminCard title="System Feature Flags" accent="#6366f1" style={{ marginBottom: '20px' }}>
          <div style={{ display: 'grid', gap: '8px' }}>
            {featureFlags.length === 0 && (
              <p style={{ color: 'var(--admin-text-muted)', margin: 0 }}>No flags loaded.</p>
            )}
            {featureFlags.map((flag) => (
              <div
                key={flag.key}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  background: 'var(--admin-bg)',
                  borderRadius: 'var(--admin-radius-sm)',
                  border: '1px solid var(--admin-border)',
                }}
              >
                <div>
                  <strong className="admin-text-mono" style={{ fontSize: '0.84rem', color: 'var(--admin-text)' }}>{flag.key}</strong>
                  <p style={{ margin: '3px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.76rem' }}>{flag.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleFlag(flag.key)}
                  className={`admin-btn admin-btn--sm ${flag.enabled ? 'admin-btn--success' : 'admin-btn--secondary'}`}
                >
                  {flag.enabled ? '● ENABLED' : '○ DISABLED'}
                </button>
              </div>
            ))}
          </div>
        </AdminCard>
      )}

      {subModule === 'api-keys' && (
        <AdminDataTable
          title="Developer API Keys"
          emptyMessage="No API keys registered"
          data={apiKeys}
          columns={[
            { header: 'Key ID', key: 'id', render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.76rem' }}>{r.id}</span> },
            { header: 'Key Name', key: 'name', render: (r) => <span style={{ fontWeight: 700 }}>{r.name}</span> },
            { header: 'Key Prefix', key: 'prefix', render: (r) => <span className="admin-badge admin-badge--neutral">{r.prefix}</span> },
            { header: 'Scopes', key: 'scope' },
            { header: 'Created Date', key: 'createdAt' },
            {
              header: 'Status',
              key: 'status',
              render: (r) => <StatusBadge status={r.status || 'ACTIVE'} />,
            },
          ]}
        />
      )}
    </div>
  );
}
