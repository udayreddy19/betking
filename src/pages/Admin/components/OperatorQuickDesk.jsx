import React, { useCallback, useEffect, useState } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import { useAdminToast } from './AdminToastContext';
import EmergencyControlsPanel from './EmergencyControlsPanel';

/**
 * Compact operator control strip for Control Tower / Ops Status.
 * Surfaces product mode, settlement recovery, recon triage, and emergency switches.
 */
export default function OperatorQuickDesk({ onNavigate }) {
  const { showToast } = useAdminToast();
  const [products, setProducts] = useState(null);
  const [settlement, setSettlement] = useState(null);
  const [recon, setRecon] = useState(null);
  const [score, setScore] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => {
    Promise.all([
      adminApiClient.get('/products').catch(() => null),
      adminApiClient.get('/settlement/failed').catch(() => ({ failedJobs: [] })),
      adminApiClient.get('/reconciliation/exceptions/open-summary?limit=5').catch(() => null),
      adminApiClient.get('/ops/production-score').catch(() => null),
    ]).then(([prod, failed, openSum, sc]) => {
      setProducts(prod?.config || prod || null);
      setSettlement({
        failed: (failed?.failedJobs || []).length,
      });
      setRecon(openSum);
      setScore(sc);
    });
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 45_000);
    return () => clearInterval(t);
  }, [load]);

  const run = async (key, fn, okMsg) => {
    setBusy(key);
    try {
      const res = await fn();
      showToast(okMsg(res) || 'Done', 'success');
      load();
    } catch (err) {
      showToast(err.message || 'Action failed', 'error');
    } finally {
      setBusy(null);
    }
  };

  const bettingOn = products?.bettingEnabled !== false && products?.betting_enabled !== false;
  const spOn = Boolean(products?.softwarePlatformEnabled || products?.software_platform_enabled);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 10,
          padding: '12px 14px',
          borderRadius: 10,
          border: '1px solid var(--admin-border)',
          background: 'rgba(15, 23, 42, 0.04)',
        }}
      >
        <Metric
          label="Public mode"
          value={spOn ? 'Software Platform' : (bettingOn ? 'Sportsbook' : 'Wallet-only')}
          warn={spOn || !bettingOn}
        />
        <Metric label="Failed settlement jobs" value={settlement?.failed ?? '—'} warn={(settlement?.failed || 0) > 0} />
        <Metric label="OPEN recon" value={recon?.openCount ?? '—'} warn={(recon?.openCount || 0) > 0} />
        <Metric
          label="Wallet"
          value={products?.walletEnabled === false || products?.wallet_enabled === false ? 'OFF' : 'ON'}
        />
        <Metric
          label="Ops score"
          value={score?.score != null ? `${score.score}/100 (${score.grade || '—'})` : '—'}
          warn={score?.score != null && score.score < 90}
        />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button
          type="button"
          className="admin-btn admin-btn--sm admin-btn--ghost"
          disabled={busy === 'drain'}
          onClick={() => run(
            'drain',
            () => adminApiClient.post('/settlement/drain', { batchSize: 50, maxBatches: 8 }),
            (r) => `Drain: processed ${r.result?.processed ?? 0}, settled ${r.result?.settled ?? 0}`,
          )}
        >
          {busy === 'drain' ? 'Draining…' : 'Drain settlement'}
        </button>
        <button
          type="button"
          className="admin-btn admin-btn--sm admin-btn--ghost"
          disabled={busy === 'retry'}
          onClick={() => run(
            'retry',
            () => adminApiClient.post('/settlement/retry-failed', {}),
            (r) => `Retry queued: ${r.retried ?? r.count ?? r.result?.retried ?? 0}`,
          )}
        >
          {busy === 'retry' ? 'Retrying…' : 'Retry failed jobs'}
        </button>
        <button
          type="button"
          className="admin-btn admin-btn--sm admin-btn--ghost"
          disabled={busy === 'stale'}
          onClick={() => {
            if (!window.confirm('Resolve OPEN recon flags that recheck healthy? Balances unchanged.')) return;
            run(
              'stale',
              () => adminApiClient.post('/reconciliation/exceptions/resolve-stale', { confirm: true, dryRun: false }),
              (r) => `Resolved ${r.count || 0} stale flag(s)`,
            );
          }}
        >
          {busy === 'stale' ? 'Resolving…' : 'Resolve stale recon'}
        </button>
        <button
          type="button"
          className="admin-btn admin-btn--sm admin-btn--secondary"
          onClick={() => onNavigate?.({ domainId: 'platform', subModuleId: 'product-config' })}
        >
          Product toggles
        </button>
        <button
          type="button"
          className="admin-btn admin-btn--sm admin-btn--secondary"
          onClick={() => onNavigate?.({ domainId: 'finance', subModuleId: 'finance-health' })}
        >
          Finance health
        </button>
        <button
          type="button"
          className="admin-btn admin-btn--sm admin-btn--secondary"
          onClick={() => onNavigate?.({ domainId: 'operations', subModuleId: 'settlement-queue' })}
        >
          Settlement queue
        </button>
        <button
          type="button"
          className="admin-btn admin-btn--sm"
          onClick={load}
        >
          Refresh
        </button>
      </div>

      <EmergencyControlsPanel
        compact
        title="Emergency switches"
        typesToShow={['GLOBAL_BETTING_PAUSE', 'CASHOUT_PAUSE', 'DEPOSITS_PAUSE', 'WITHDRAWALS_PAUSE']}
      />
    </div>
  );
}

function Metric({ label, value, warn }) {
  return (
    <div>
      <div style={{ fontSize: '0.68rem', color: 'var(--admin-text-muted)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: '0.95rem', color: warn ? '#f59e0b' : 'inherit' }}>{value}</div>
    </div>
  );
}
