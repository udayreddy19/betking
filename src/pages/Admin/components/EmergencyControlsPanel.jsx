import React, { useCallback, useEffect, useState } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import { useAdminToast } from './AdminToastContext';
import AdminConfirmDialog from './AdminConfirmDialog';

export const EMERGENCY_CONTROL_DEFS = [
  { type: 'GLOBAL_BETTING_PAUSE', label: 'Pause all betting', blocks: 'New live and pre-match bets' },
  { type: 'CASHOUT_PAUSE', label: 'Pause cashout', blocks: 'Early cashout on open bets' },
  { type: 'DEPOSITS_PAUSE', label: 'Pause deposits', blocks: 'New deposit orders' },
  { type: 'WITHDRAWALS_PAUSE', label: 'Pause withdrawals', blocks: 'New withdrawal requests' },
  { type: 'SPORT_PAUSE', label: 'Pause sport book', blocks: 'New bets (sport-wide freeze)' },
  { type: 'MARKET_SUSPENSION', label: 'Freeze all markets', blocks: 'New bets (global market freeze)' },
  { type: 'MAINTENANCE_MODE', label: 'Maintenance mode', blocks: 'Bets, cashout, deposits, withdrawals' },
];

export default function EmergencyControlsPanel({
  title = 'Platform kill switches',
  typesToShow = null,
  compact = false,
  showHistory = false,
}) {
  const { showToast } = useAdminToast();
  const [state, setState] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);

  const defs = typesToShow
    ? EMERGENCY_CONTROL_DEFS.filter((d) => typesToShow.includes(d.type))
    : EMERGENCY_CONTROL_DEFS;

  const load = useCallback(() => {
    adminApiClient.get('/emergency/state')
      .then((data) => {
        setState(data);
        setError(null);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load emergency state');
      });
    if (showHistory) {
      adminApiClient.get('/emergency/history')
        .then((data) => setHistory(data.history || []))
        .catch(() => setHistory([]));
    }
  }, [showHistory]);

  useEffect(() => {
    load();
  }, [load]);

  const activeSet = new Set(
    (state?.activeEmergencies || []).map((row) => String(row.state_type || row.stateType || '').toUpperCase()),
  );

  const runToggle = async (reason) => {
    if (!pending) return;
    if (!reason || reason.trim().length < 5) {
      showToast('Reason must be at least 5 characters', 'error');
      return;
    }
    setBusy(true);
    try {
      const path = pending.active ? '/emergency/deactivate' : '/emergency/activate';
      await adminApiClient.post(path, { stateType: pending.type, reason });
      showToast(
        pending.active ? `${pending.label} lifted` : `${pending.label} is now active`,
        pending.active ? 'success' : 'warning',
      );
      setPending(null);
      load();
    } catch (err) {
      showToast(err.message || 'Emergency action failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        marginBottom: compact ? 16 : 24,
        background: 'var(--admin-card-bg)',
        border: activeSet.size ? '1px solid rgba(239, 68, 68, 0.35)' : '1px solid var(--admin-border)',
        borderRadius: 12,
        padding: compact ? '12px 14px' : '16px 18px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: compact ? 14 : 16, fontWeight: 800 }}>
            {title}
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--admin-text-muted)' }}>
            Enforced on placement, cashout, deposits, and withdrawals. Super Admin / Operations only. Reason is audited.
          </p>
        </div>
        <button type="button" className="admin-btn admin-btn--secondary admin-btn--sm" onClick={load}>
          ↻ Refresh
        </button>
      </div>
      {error && <p style={{ margin: '0 0 10px', color: '#f87171', fontSize: 12 }}>{error}</p>}
      {!state?.isNormal && state?.systemStatus && (
        <p style={{ margin: '0 0 10px', color: '#fbbf24', fontSize: 12, fontWeight: 700 }}>
          Active: {state.systemStatus}
        </p>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        {defs.map((def) => {
          const active = activeSet.has(def.type);
          return (
            <div
              key={def.type}
              style={{
                border: `1px solid ${active ? 'rgba(239, 68, 68, 0.4)' : 'var(--admin-border)'}`,
                borderRadius: 10,
                padding: '10px 12px',
                background: active ? 'rgba(239, 68, 68, 0.08)' : 'var(--admin-surface)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{def.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--admin-text-muted)', marginTop: 2 }}>{def.blocks}</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 800, color: active ? '#ef4444' : '#10b981' }}>
                  {active ? 'ON' : 'OFF'}
                </span>
              </div>
              <button
                type="button"
                className={`admin-btn admin-btn--sm ${active ? 'admin-btn--primary' : 'admin-btn--danger'}`}
                style={{ marginTop: 10, width: '100%' }}
                onClick={() => setPending({ ...def, active })}
              >
                {active ? 'Lift pause' : 'Activate'}
              </button>
            </div>
          );
        })}
      </div>
      {showHistory && history.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 13 }}>Recent emergency actions</h4>
          <div style={{ fontSize: 12, color: 'var(--admin-text-muted)', maxHeight: 180, overflow: 'auto' }}>
            {history.slice(0, 20).map((row, idx) => (
              <div key={row.id || `${row.state_type}-${row.created_at}-${idx}`} style={{ padding: '4px 0', borderBottom: '1px solid var(--admin-border)' }}>
                <span className="admin-text-mono">{row.state_type}</span>
                {' · '}
                {row.action}
                {' · '}
                {row.reason}
              </div>
            ))}
          </div>
        </div>
      )}
      <AdminConfirmDialog
        isOpen={!!pending}
        variant={pending?.active ? 'success' : 'danger'}
        icon={pending?.active ? '▶' : '⛔'}
        title={pending?.active ? `Lift ${pending?.label}` : `Activate ${pending?.label}`}
        description={pending?.active
          ? 'Customers will be able to use this flow again immediately.'
          : `This blocks: ${pending?.blocks}. Existing open bets are not settled.`}
        requireReason
        reasonPlaceholder="Audit reason (min 5 characters)"
        confirmLabel={pending?.active ? 'Lift pause' : 'Activate pause'}
        onConfirm={runToggle}
        onCancel={() => setPending(null)}
        loading={busy}
      />
    </div>
  );
}
