import React, { useCallback, useEffect, useState } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import { useAdminToast } from '../components/AdminToastContext';
import AdminCard from '../components/AdminCard';

function formatWhen(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  } catch {
    return String(value);
  }
}

export default function ProductConfigurationPanel() {
  const { showToast } = useAdminToast();
  const [walletEnabled, setWalletEnabled] = useState(true);
  const [bettingEnabled, setBettingEnabled] = useState(true);
  const [saved, setSaved] = useState({ walletEnabled: true, bettingEnabled: true });
  const [meta, setMeta] = useState({ updatedAt: null, updatedBy: null });
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      adminApiClient.get('/products'),
      adminApiClient.get('/products/history').catch(() => ({ history: [] })),
    ])
      .then(([config, hist]) => {
        const w = config.walletEnabled !== false;
        const b = config.bettingEnabled !== false;
        setWalletEnabled(w);
        setBettingEnabled(b);
        setSaved({ walletEnabled: w, bettingEnabled: b });
        setMeta({ updatedAt: config.updatedAt, updatedBy: config.updatedBy });
        setHistory(hist.history || []);
        setError(null);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load product configuration');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const dirty = walletEnabled !== saved.walletEnabled || bettingEnabled !== saved.bettingEnabled;

  const confirmDisable = (product, nextOn) => {
    if (nextOn) return true;
    const label = product === 'wallet' ? 'Wallet' : 'Betting';
    return window.confirm(
      `Are you sure you want to disable ${label}?\n\n`
      + `Existing users will no longer be able to access ${label} functionality.\n`
      + 'Historical data will NOT be deleted.\n\nContinue?',
    );
  };

  const toggleWallet = () => {
    const next = !walletEnabled;
    if (!confirmDisable('wallet', next)) return;
    setWalletEnabled(next);
  };

  const toggleBetting = () => {
    const next = !bettingEnabled;
    if (!confirmDisable('betting', next)) return;
    setBettingEnabled(next);
  };

  const save = () => {
    if (!dirty) return;
    if (!walletEnabled && !bettingEnabled) {
      const ok = window.confirm(
        'Both Wallet and Betting will be disabled.\n\n'
        + 'Users will see a “Currently Unavailable” page.\n'
        + 'Admins will still be able to access this panel.\n\nContinue?',
      );
      if (!ok) return;
    }
    setSaving(true);
    adminApiClient.put('/products', { walletEnabled, bettingEnabled })
      .then((data) => {
        const w = data.walletEnabled !== false;
        const b = data.bettingEnabled !== false;
        setWalletEnabled(w);
        setBettingEnabled(b);
        setSaved({ walletEnabled: w, bettingEnabled: b });
        setMeta({ updatedAt: data.updatedAt, updatedBy: data.updatedBy });
        showToast('Product configuration saved', 'success');
        load();
      })
      .catch((err) => showToast(err.message || 'Save failed', 'error'))
      .finally(() => setSaving(false));
  };

  if (loading) {
    return <AdminCard title="Product Configuration"><p>Loading…</p></AdminCard>;
  }

  return (
    <div className="product-config-panel">
      <AdminCard title="Product Configuration">
        {error && <p style={{ color: 'var(--danger, #c0392b)' }}>{error}</p>}
        <p style={{ marginBottom: '1.25rem', color: 'var(--text-secondary, #666)', fontSize: '0.9rem' }}>
          Independently enable or disable Wallet and Betting. Disabling turns off user access only —
          it does not delete bets, wallet records, or historical data. Background settlement and
          payment webhooks continue for in-flight operations.
        </p>

        <div style={{ display: 'grid', gap: '1rem', maxWidth: 520 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1rem 1.1rem',
              borderRadius: 12,
              border: '1px solid var(--border-subtle, #e5e7eb)',
              background: 'var(--surface, #fafafa)',
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>Wallet</div>
              <div style={{ fontSize: '0.85rem', marginTop: 4 }}>
                Status:{' '}
                <span style={{ color: walletEnabled ? '#15803d' : '#b91c1c', fontWeight: 600 }}>
                  {walletEnabled ? '● Enabled' : '● Disabled'}
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#666', marginTop: 4 }}>
                Add money, withdraw, bank accounts, transactions
              </div>
            </div>
            <button type="button" className="admin-btn" onClick={toggleWallet}>
              {walletEnabled ? 'Disable' : 'Enable'}
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1rem 1.1rem',
              borderRadius: 12,
              border: '1px solid var(--border-subtle, #e5e7eb)',
              background: 'var(--surface, #fafafa)',
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>Betting</div>
              <div style={{ fontSize: '0.85rem', marginTop: 4 }}>
                Status:{' '}
                <span style={{ color: bettingEnabled ? '#15803d' : '#b91c1c', fontWeight: 600 }}>
                  {bettingEnabled ? '● Enabled' : '● Disabled'}
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#666', marginTop: 4 }}>
                Sports, markets, odds, bet slip, my bets (OddsYra)
              </div>
            </div>
            <button type="button" className="admin-btn" onClick={toggleBetting}>
              {bettingEnabled ? 'Disable' : 'Enable'}
            </button>
          </div>
        </div>

        <div style={{ marginTop: '1.25rem', fontSize: '0.85rem', color: '#555' }}>
          <div>Last updated: {formatWhen(meta.updatedAt)}</div>
          <div>Changed by: {meta.updatedBy || '—'}</div>
        </div>

        <div style={{ marginTop: '1.25rem' }}>
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            disabled={!dirty || saving}
            onClick={save}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          {dirty && (
            <button
              type="button"
              className="admin-btn"
              style={{ marginLeft: 8 }}
              disabled={saving}
              onClick={() => {
                setWalletEnabled(saved.walletEnabled);
                setBettingEnabled(saved.bettingEnabled);
              }}
            >
              Reset
            </button>
          )}
        </div>
      </AdminCard>

      <AdminCard title="Change history" style={{ marginTop: '1rem' }}>
        {history.length === 0 ? (
          <p style={{ color: '#666', fontSize: '0.9rem' }}>No configuration changes recorded yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table" style={{ width: '100%', fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th>Date/Time</th>
                  <th>Admin</th>
                  <th>Wallet</th>
                  <th>Betting</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id}>
                    <td>{formatWhen(row.createdAt)}</td>
                    <td>{row.changedBy || '—'}</td>
                    <td>{row.walletEnabled ? 'ON' : 'OFF'}</td>
                    <td>{row.bettingEnabled ? 'ON' : 'OFF'}</td>
                    <td>{row.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>
    </div>
  );
}
