import React, { useState, useEffect, useCallback } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import { useAdminToast } from '../components/AdminToastContext';
import { StatusBadge } from '../components/AdminBadge';
import AdminCard from '../components/AdminCard';
import DatabaseInspector from '../../../components/DatabaseInspector/DatabaseInspector';

const SUGGESTED_PRODUCT_FLAGS = [
  { flagKey: 'oddsyra_srl_ui', name: 'SRL', description: 'All SRL matches, Sports SRL chip, and /srl page for players' },
  { flagKey: 'oddsyra_t10_ui', name: 'T10', description: 'All T10 matches (ECS, Abu Dhabi T10, German Super League, etc.) for players' },
  { flagKey: 'new_admin_ui', name: 'New Admin UI', description: 'Gradual rollout for modernized Admin shell' },
  { flagKey: 'referral_system_ui', name: 'Referral UX', description: 'Refer & Earn surfaces' },
  { flagKey: 'promotion_engine_ui', name: 'Promotions UX', description: 'Campaign / free-bet UI' },
  { flagKey: 'responsible_gaming_ui', name: 'Responsible Gaming UI', description: 'Enhanced RG controls' },
  { flagKey: 'notification_center', name: 'Notification Center', description: 'Unified in-app notifications' },
  { flagKey: 'crm_segments', name: 'CRM Segments', description: 'CRM segmentation admin' },
  { flagKey: 'analytics_v2', name: 'Analytics V2', description: 'Expanded analytics dashboard' },
  { flagKey: 'experimental_ux', name: 'Experimental UX', description: 'Non-production UX experiments' },
];

function withProductFlagMeta(flag) {
  const key = flag.flagKey || flag.flag_key;
  const suggested = SUGGESTED_PRODUCT_FLAGS.find((f) => f.flagKey === key);
  if (!suggested) return flag;
  return { ...flag, name: suggested.name, description: suggested.description };
}
export default function PlatformDomainView({ subModule = 'feature-flags' }) {
  const [apiKeys, setApiKeys] = useState([]);
  const [featureFlags, setFeatureFlags] = useState([]);
  const [storeFlags, setStoreFlags] = useState([]);
  const [storeError, setStoreError] = useState(null);
  const [error, setError] = useState(null);
  const { showToast } = useAdminToast();

  const loadFeatureStore = useCallback(() => {
    adminApiClient.get('/platform/feature-store')
      .then((data) => {
        setStoreFlags(data.flags || []);
        setStoreError(null);
      })
      .catch((err) => {
        setStoreFlags([]);
        setStoreError(err.message || 'Data unavailable');
      });
  }, []);

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
    if (subModule === 'feature-flags') loadFeatureStore();
    return () => { cancelled = true; };
  }, [subModule, loadFeatureStore]);

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

  const upsertStoreFlag = (flag, enabled) => {
    const meta = withProductFlagMeta(flag);
    adminApiClient.post('/platform/feature-store/upsert', {
      flagKey: meta.flagKey || meta.flag_key,
      name: meta.name,
      description: meta.description,
      enabled,
      rolloutPercentage: meta.rollout_percentage ?? meta.rolloutPercentage ?? 100,
      reason: enabled ? 'Admin enable' : 'Admin disable',
    })
      .then(() => {
        showToast(`${meta.flagKey || meta.flag_key} → ${enabled ? 'ENABLED' : 'DISABLED'}`, 'success');
        loadFeatureStore();
      })
      .catch((err) => showToast(err.message || 'Feature store update failed', 'error'));
  };

  if (subModule === 'database-tables') {
    return <DatabaseInspector />;
  }

  const heading = subModule === 'api-keys'
    ? 'Developer API Keys'
    : 'System Viewer Flags';
  const hint = subModule === 'api-keys'
    ? 'Registered developer API keys from the platform tables.'
    : 'Sport and product toggles apply to the live user app within ~30s. Disable OddsYra SRL to hide SRL matches and the /srl page for players.';

  const knownKeys = new Set(storeFlags.map((f) => f.flag_key));
  const missingSuggested = SUGGESTED_PRODUCT_FLAGS.filter((f) => !knownKeys.has(f.flagKey));

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <h2 className="admin-page-header__title">{heading}</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          {hint}
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#fbbf24', fontSize: '0.78rem' }}>{error}</p>}
      </div>

      {subModule === 'feature-flags' && (
        <>
          <AdminCard title="Sport / Runtime Config Flags" accent="#6366f1" style={{ marginBottom: '20px' }}>
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
                    disabled={!!flag.readOnly}
                    title={flag.readOnly ? 'Display only — not a runtime toggle' : undefined}
                    className={`admin-btn admin-btn--sm ${flag.enabled ? 'admin-btn--success' : 'admin-btn--secondary'}`}
                  >
                    {flag.readOnly
                      ? `Value ${flag.value ?? '—'}%`
                      : (flag.enabled ? '● ENABLED' : '○ DISABLED')}
                  </button>
                </div>
              ))}
            </div>
          </AdminCard>

          <AdminCard title="Enterprise Feature Store" accent="#34d399" style={{ marginBottom: '20px' }}>
            {storeError && (
              <p style={{ color: '#f87171', margin: '0 0 12px', fontSize: '0.78rem' }}>
                Data unavailable: {storeError}
              </p>
            )}
            {!storeError && storeFlags.length === 0 && (
              <p style={{ color: 'var(--admin-text-muted)', margin: '0 0 12px' }}>
                No feature-store rows yet. Seed a product flag below (disabled by default).
              </p>
            )}
            <div style={{ display: 'grid', gap: '8px' }}>
              {storeFlags.map((flag) => {
                const meta = withProductFlagMeta(flag);
                return (
                <div
                  key={flag.flag_key}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 16px',
                    background: 'var(--admin-bg)',
                    borderRadius: 'var(--admin-radius-sm)',
                    border: '1px solid var(--admin-border)',
                  }}
                >
                  <div>
                    <strong className="admin-text-mono" style={{ fontSize: '0.84rem' }}>{flag.flag_key}</strong>
                    <p style={{ margin: '3px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.76rem' }}>
                      {meta.name} · rollout {flag.rollout_percentage ?? 100}% · {flag.environment || 'all'}
                    </p>
                    {meta.description && (
                      <p style={{ margin: '2px 0 0', color: 'var(--admin-text-dim)', fontSize: '0.72rem' }}>{meta.description}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => upsertStoreFlag(flag, !flag.enabled)}
                    className={`admin-btn admin-btn--sm ${flag.enabled ? 'admin-btn--success' : 'admin-btn--secondary'}`}
                  >
                    {flag.enabled ? '● ENABLED' : '○ DISABLED'}
                  </button>
                </div>
                );
              })}
            </div>

            {missingSuggested.length > 0 && (
              <div style={{ marginTop: '16px' }}>
                <p style={{ margin: '0 0 8px', fontSize: '0.78rem', color: 'var(--admin-text-muted)' }}>
                  Suggested product flags (create disabled — does not grant privileges):
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {missingSuggested.map((flag) => (
                    <button
                      key={flag.flagKey}
                      type="button"
                      className="admin-btn admin-btn--secondary admin-btn--sm"
                      onClick={() => upsertStoreFlag(flag, false)}
                    >
                      + {flag.flagKey}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </AdminCard>
        </>
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
