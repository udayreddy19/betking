import React, { useCallback, useEffect, useState } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import { publishLocalProductConfig, syncPublicProductShell } from '../../../context/ProductContext';
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

/**
 * Instant toggles — Software Platform + Betting only (mutually exclusive).
 * Enabling one disables the other. Wallet stays on in the background.
 */
export default function ProductConfigurationPanel() {
  const { showToast } = useAdminToast();
  const [bettingEnabled, setBettingEnabled] = useState(true);
  const [softwareEnabled, setSoftwareEnabled] = useState(false);
  const [softwareName, setSoftwareName] = useState('');
  const [softwareNameDraft, setSoftwareNameDraft] = useState('');
  const [meta, setMeta] = useState({ updatedAt: null, updatedBy: null });
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      adminApiClient.get('/products'),
      adminApiClient.get('/products/history').catch(() => ({ history: [] })),
    ])
      .then(async ([cfg, hist]) => {
        let config = cfg;
        // Use EFFECTIVE flags for exclusivity — never bettingStored (stays true under PG/software).
        let b = config.bettingEnabled === true;
        let sw = config.softwarePlatformEnabled === true;
        // Only heal the illegal both-ON case. Do not auto-flip both-OFF (causes public thrash).
        if (sw && b) {
          try {
            const fixed = await adminApiClient.put('/products', {
              walletEnabled: true,
              bettingEnabled: false,
              pgReviewMode: false,
              softwarePlatformEnabled: true,
              softwarePlatformName: String(config.softwarePlatformName || '').trim(),
            });
            b = fixed.bettingEnabled === true;
            sw = fixed.softwarePlatformEnabled === true;
            setMeta({ updatedAt: fixed.updatedAt, updatedBy: fixed.updatedBy });
            const published = publishLocalProductConfig({
              walletEnabled: true,
              bettingEnabled: b,
              pgReviewMode: false,
              softwarePlatformEnabled: sw,
              softwarePlatformName: String(fixed.softwarePlatformName || config.softwarePlatformName || '').trim(),
              updatedAt: fixed.updatedAt,
            });
            await syncPublicProductShell(published);
            config = { ...config, ...fixed };
          } catch {
            setMeta({ updatedAt: config.updatedAt, updatedBy: config.updatedBy });
          }
        } else {
          setMeta({ updatedAt: config.updatedAt, updatedBy: config.updatedBy });
        }
        const name = String(config.softwarePlatformName || '').trim();
        setBettingEnabled(b);
        setSoftwareEnabled(sw);
        setSoftwareName(name);
        // Don't clobber the input while the admin is typing.
        const active = typeof document !== 'undefined' ? document.activeElement : null;
        const editingName = active && active.getAttribute?.('data-software-name-input') === '1';
        if (!editingName) setSoftwareNameDraft(name);
        setHistory(hist.history || []);
        setError(null);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load product configuration');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const persist = useCallback(async (body, successMsg) => {
    setBusy(true);
    try {
      const data = await adminApiClient.put('/products', body);
      const b = data.bettingStored !== undefined
        ? data.bettingStored !== false
        : data.bettingEnabled !== false;
      const sw = data.softwarePlatformEnabled === true;
      const name = String(data.softwarePlatformName || '').trim();
      setBettingEnabled(b);
      setSoftwareEnabled(sw);
      setSoftwareName(name);
      setSoftwareNameDraft(name);
      setMeta({ updatedAt: data.updatedAt, updatedBy: data.updatedBy });
      const published = publishLocalProductConfig({
        walletEnabled: true,
        bettingEnabled: b,
        pgReviewMode: false,
        softwarePlatformEnabled: sw,
        softwarePlatformName: name,
        updatedAt: data.updatedAt,
      });
      // Refresh nginx cookie immediately so public tabs / next open hit the right SPA.
      await syncPublicProductShell(published);
      showToast(successMsg, 'success');
      adminApiClient.get('/products/history').then((hist) => {
        setHistory(hist.history || []);
      }).catch(() => {});
      return data;
    } catch (err) {
      showToast(err.message || 'Update failed', 'error');
      load();
      throw err;
    } finally {
      setBusy(false);
    }
  }, [load, showToast]);

  const toggleSoftware = async () => {
    const next = !softwareEnabled;
    const ok = window.confirm(
      next
        ? 'Enable Software Platform?\n\nBetting will turn OFF.\n'
          + 'The PUBLIC site switches to the software platform. /admin stays here (/console for software admin).\n'
          + 'Saved immediately.\n\nContinue?'
        : 'Disable Software Platform?\n\nBetting will turn ON and the public site returns to OddsYra sportsbook.\n'
          + 'Saved immediately.\n\nContinue?',
    );
    if (!ok) return;
    // Mutual exclusion: Software ON ⇒ Betting OFF; Software OFF ⇒ Betting ON
    await persist(
      {
        walletEnabled: true,
        bettingEnabled: !next,
        pgReviewMode: false,
        softwarePlatformEnabled: next,
        softwarePlatformName: softwareNameDraft,
      },
      next
        ? `Software Platform ON${softwareNameDraft.trim() ? ` as “${softwareNameDraft.trim()}”` : ''} — Betting OFF`
        : 'Software Platform OFF — Betting ON (sportsbook restored)',
    );
  };

  const saveSoftwareName = async () => {
    const nextName = softwareNameDraft.trim();
    if (nextName === softwareName) {
      showToast('No name change to save', 'info');
      return;
    }
    await persist(
      {
        walletEnabled: true,
        bettingEnabled,
        pgReviewMode: false,
        softwarePlatformEnabled: softwareEnabled,
        softwarePlatformName: nextName,
      },
      nextName
        ? `Software Platform name saved as “${nextName}”`
        : 'Software Platform name cleared',
    );
  };

  const toggleBetting = async () => {
    const next = !bettingEnabled;
    const ok = window.confirm(
      next
        ? 'Enable Betting?\n\nSoftware Platform will turn OFF and the public site becomes OddsYra sportsbook.\n'
          + 'Saved immediately.\n\nContinue?'
        : 'Disable Betting?\n\nSoftware Platform will turn ON and the public site becomes the software platform.\n'
          + 'Saved immediately.\n\nContinue?',
    );
    if (!ok) return;
    // Mutual exclusion: Betting ON ⇒ Software OFF; Betting OFF ⇒ Software ON
    await persist(
      {
        walletEnabled: true,
        bettingEnabled: next,
        pgReviewMode: false,
        softwarePlatformEnabled: !next,
        softwarePlatformName: softwareNameDraft,
      },
      next
        ? 'Betting ON — Software Platform OFF'
        : `Betting OFF — Software Platform ON${softwareNameDraft.trim() ? ` as “${softwareNameDraft.trim()}”` : ''}`,
    );
  };

  if (loading) {
    return <AdminCard title="Product Configuration"><p>Loading…</p></AdminCard>;
  }

  return (
    <div className="product-config-panel">
      <AdminCard title="Product Configuration">
        {error && <p style={{ color: 'var(--danger, #c0392b)' }}>{error}</p>}
        <p style={{ marginBottom: '1.25rem', color: 'var(--text-secondary, #666)', fontSize: '0.9rem' }}>
          Toggles save immediately. Only one mode is active at a time — enabling one disables the other.
        </p>

        <div style={{ display: 'grid', gap: '1rem', maxWidth: 560 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1rem 1.1rem',
              borderRadius: 12,
              border: softwareEnabled ? '2px solid #2563eb' : '1px solid var(--border-subtle, #e5e7eb)',
              background: softwareEnabled ? '#eff6ff' : 'var(--surface, #fafafa)',
            }}
          >
            <div style={{ flex: 1, minWidth: 0, marginRight: '1rem' }}>
              <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>Software Platform</div>
              <div style={{ fontSize: '0.85rem', marginTop: 4 }}>
                Status:{' '}
                <span style={{ color: softwareEnabled ? '#1d4ed8' : '#b91c1c', fontWeight: 600 }}>
                  {softwareEnabled
                    ? `● ON — public site shows ${softwareName || 'Software Platform'}`
                    : '● OFF — public site is OddsYra sportsbook'}
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#666', marginTop: 4 }}>
                /admin always stays here. Software admin UI lives at /console.
              </div>
              <label
                style={{
                  display: 'block',
                  marginTop: '0.85rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: '#334155',
                }}
              >
                Display name (shown when Software Platform is ON)
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: 6, alignItems: 'center' }}>
                  <input
                    type="text"
                    data-software-name-input="1"
                    value={softwareNameDraft}
                    onChange={(e) => setSoftwareNameDraft(e.target.value.slice(0, 120))}
                    placeholder="e.g. Acme Software"
                    maxLength={120}
                    disabled={busy}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      padding: '0.55rem 0.7rem',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      fontSize: '0.95rem',
                    }}
                  />
                  <button
                    type="button"
                    className="admin-btn"
                    onClick={saveSoftwareName}
                    disabled={busy || softwareNameDraft.trim() === softwareName}
                  >
                    Save name
                  </button>
                </div>
              </label>
              {softwareEnabled && (
                <div style={{ fontSize: '0.8rem', color: '#1d4ed8', marginTop: 6, fontWeight: 600 }}>
                  Currently showing: {softwareName || 'Software Platform'}
                </div>
              )}
            </div>
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              onClick={toggleSoftware}
              disabled={busy}
              aria-pressed={softwareEnabled}
            >
              {busy ? 'Saving…' : (softwareEnabled ? 'Turn OFF' : 'Turn ON')}
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1rem 1.1rem',
              borderRadius: 12,
              border: bettingEnabled ? '2px solid #16a34a' : '1px solid var(--border-subtle, #e5e7eb)',
              background: bettingEnabled ? '#f0fdf4' : 'var(--surface, #fafafa)',
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>Betting</div>
              <div style={{ fontSize: '0.85rem', marginTop: 4 }}>
                Status:{' '}
                <span style={{ color: bettingEnabled ? '#15803d' : '#b91c1c', fontWeight: 600 }}>
                  {bettingEnabled ? '● ON — public site is OddsYra sportsbook' : '● OFF — Software Platform is active'}
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#666', marginTop: 4 }}>
                Sports, markets, odds, bet slip, my bets
              </div>
            </div>
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              onClick={toggleBetting}
              disabled={busy}
              aria-pressed={bettingEnabled}
            >
              {busy ? 'Saving…' : (bettingEnabled ? 'Turn OFF' : 'Turn ON')}
            </button>
          </div>
        </div>

        <div style={{ marginTop: '1.25rem', fontSize: '0.85rem', color: '#555' }}>
          <div>Last updated: {formatWhen(meta.updatedAt)}</div>
          <div>Changed by: {meta.updatedBy || '—'}</div>
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
                  <th>Betting</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id}>
                    <td>{formatWhen(row.createdAt)}</td>
                    <td>{row.changedBy || '—'}</td>
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
