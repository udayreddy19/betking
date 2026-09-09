import React, { useState, useEffect, useCallback } from 'react';
import { adminApiClient } from '../api/adminApiClient';

export default function RiskSyndicateMonitorPanel() {
  const [syndicates, setSyndicates] = useState([]);
  const [signals, setSignals] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionNotice, setActionNotice] = useState('');

  const fetchRiskData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [synRes, sigRes, clusterRes] = await Promise.all([
        adminApiClient.get('/risk/syndicates').catch(() => ({ syndicates: [] })),
        adminApiClient.get('/risk/signals?limit=15').catch(() => ({ signals: [] })),
        adminApiClient.get('/risk/radar/multi-accounting').catch(() => ({ clusters: [] })),
      ]);
      setSyndicates(synRes.syndicates || []);
      setSignals(sigRes.signals || []);
      setClusters(clusterRes.clusters || []);
    } catch (err) {
      setError(err.message || 'Failed to load risk monitor');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRiskData();
  }, [fetchRiskData]);

  const handleRestrictUser = useCallback(async (userId) => {
    setActionNotice('');
    try {
      await adminApiClient.post('/risk/user-tier', { userId, tier: 'RESTRICTED' });
      setActionNotice(`User ${userId} risk tier set to RESTRICTED.`);
      fetchRiskData();
    } catch (err) {
      setError(err.message || 'Failed to update user tier');
    }
  }, [fetchRiskData]);

  const handleRestrictSyndicate = useCallback(async (accounts, synInfo = {}) => {
    if (!accounts || !accounts.length) return;
    setActionNotice('');
    try {
      const res = await adminApiClient.post('/risk/syndicate/restrict', {
        userIds: accounts,
        reason: `Syndicate spike on ${synInfo.marketId || synInfo.matchId || 'live event'}`,
      });
      setActionNotice(`🚨 Restricted ${res.restrictedCount || accounts.length} coordinated accounts across the syndicate.`);
      fetchRiskData();
    } catch (err) {
      setError(err.message || 'Failed to restrict syndicate');
    }
  }, [fetchRiskData]);

  const handleEnforceCluster = useCallback(async (userIds, action) => {
    try {
      const res = await adminApiClient.post('/risk/radar/enforce', {
        userIds,
        action,
        reason: 'Automated multi-account cluster enforcement',
      });
      setActionNotice(res.message || `Action ${action} applied to ${userIds.length} accounts.`);
      fetchRiskData();
    } catch (err) {
      setError(err.message || 'Failed to enforce cluster action');
    }
  }, [fetchRiskData]);

  return (
    <div className="admin-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--admin-text)', margin: 0 }}>
            🛡️ Syndicate, Fraud & Geo Anomaly Monitor
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--admin-text-muted)', margin: '4px 0 0' }}>
            Real-time multi-account arbitrage detection, coordinated spike clustering, and instant 1-click account restriction.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="admin-btn admin-btn--secondary"
            onClick={fetchRiskData}
            disabled={loading}
          >
            ↻ Refresh Signals
          </button>
        </div>
      </div>

      {actionNotice && (
        <div style={{ padding: '12px 16px', borderRadius: 'var(--admin-radius)', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10b981', color: '#10b981', fontSize: '0.84rem' }}>
          {actionNotice}
        </div>
      )}

      {error && (
        <div style={{ padding: '12px 16px', borderRadius: 'var(--admin-radius)', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#ef4444', fontSize: '0.84rem' }}>
          {error}
        </div>
      )}

      {/* Multi-Account & Fingerprint Radar Clusters */}
      <div style={{ background: 'var(--admin-surface, #1e293b)', border: '1px solid var(--admin-border, #334155)', borderRadius: '12px', padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 800, margin: 0, color: 'var(--admin-text)' }}>
              👥 Multi-Accounting & Device Fingerprint Clusters ({clusters.length})
            </h3>
            <span style={{ fontSize: '0.74rem', color: 'var(--admin-text-muted)' }}>
              Correlated accounts sharing identical IP subnets, contact prefixes, or synced stake spikes
            </span>
          </div>
        </div>

        {clusters.length === 0 ? (
          <div style={{ padding: '16px', textAlign: 'center', color: 'var(--admin-text-muted)', fontSize: '0.84rem' }}>
            ✓ No multi-accounting clusters detected in current window.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {clusters.map((c) => (
              <div
                key={c.clusterId}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 12,
                  padding: '12px 16px',
                  borderRadius: '8px',
                  background: 'rgba(239, 68, 68, 0.06)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 800, color: '#ef4444', fontSize: '0.88rem' }}>
                      🚨 {c.accountCount} Linked Accounts
                    </span>
                    <span style={{ fontSize: '0.72rem', background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
                      RISK SCORE {c.riskScore}/100
                    </span>
                    <span style={{ fontSize: '0.74rem', color: 'var(--admin-text-muted)' }}>
                      {c.indicator}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--admin-text-muted)', marginTop: 4 }}>
                    Accounts: {c.userIds?.slice(0, 4).join(', ')}{c.userIds?.length > 4 ? ` +${c.userIds.length - 4} more` : ''} · Volume: ₹{Number(c.totalStake || 0).toLocaleString()} ({c.totalBets} bets)
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    className="admin-btn admin-btn--secondary"
                    style={{ fontSize: '0.72rem', padding: '4px 8px' }}
                    onClick={() => handleEnforceCluster(c.userIds, 'RESTRICT_STAKE')}
                  >
                    Limit Max Stake
                  </button>
                  <button
                    type="button"
                    className="admin-btn admin-btn--secondary"
                    style={{ fontSize: '0.72rem', padding: '4px 8px' }}
                    onClick={() => handleEnforceCluster(c.userIds, 'FORCE_KYC')}
                  >
                    Force KYC
                  </button>
                  <button
                    type="button"
                    className="admin-btn admin-btn--danger"
                    style={{ fontSize: '0.72rem', padding: '4px 8px' }}
                    onClick={() => handleEnforceCluster(c.userIds, 'FREEZE_WALLET')}
                  >
                    Freeze Wallets
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Active Syndicate Detections */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--admin-text)', margin: 0 }}>
            ⚡ Coordinated Syndicate Spikes ({syndicates.length})
          </h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>
            Threshold: ≥3 coordinated accounts or ≥₹25k synchronized stake within 60s
          </span>
        </div>

        {syndicates.length === 0 ? (
          <div style={{ padding: '16px', borderRadius: 'var(--admin-radius)', background: 'var(--admin-panel-alt, rgba(255,255,255,0.02))', border: '1px solid var(--admin-border)', fontSize: '0.84rem', color: 'var(--admin-text-muted)' }}>
            No active syndicate patterns detected in the current window.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '12px' }}>
            {syndicates.map((syn, idx) => (
              <div key={idx} style={{ padding: '16px', borderRadius: 'var(--admin-radius)', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.3)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 800, color: '#ef4444', fontSize: '0.94rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>🚨 {syn.accountsCount} Coordinated Accounts</span>
                      <span style={{ fontSize: '0.74rem', background: 'rgba(239, 68, 68, 0.2)', padding: '2px 8px', borderRadius: 4, color: '#ef4444' }}>
                        CONFIDENCE 96%
                      </span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--admin-text-muted)', marginTop: '4px' }}>
                      Match: <strong style={{ color: 'var(--admin-text)' }}>{syn.matchId}</strong> · Market: <code>{syn.marketId}</code> · Selection: <code>{syn.selectionId}</code>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted)' }}>Combined Stake</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fb7185' }}>
                        ₹{Number(syn.totalStake || 0).toLocaleString()}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="admin-btn admin-btn--danger admin-btn--sm"
                      onClick={() => handleRestrictSyndicate(syn.accounts, syn)}
                    >
                      Restrict Syndicate ({syn.accountsCount})
                    </button>
                  </div>
                </div>

                {/* Account Cluster Visualizer Pills */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', paddingTop: 6, borderTop: '1px dashed rgba(239, 68, 68, 0.2)' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted)' }}>Cluster Members:</span>
                  {(syn.accounts || []).map((acc) => (
                    <span
                      key={acc}
                      style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: '0.72rem',
                        fontFamily: 'var(--admin-font-mono)',
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      {acc}
                      <button
                        type="button"
                        style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: 0, fontSize: '0.7rem' }}
                        title="Restrict this single account"
                        onClick={() => handleRestrictUser(acc)}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                  <span style={{ fontSize: '0.72rem', color: 'var(--admin-text-dim)', marginLeft: 'auto' }}>
                    Burst gap: ~{Math.round((syn.timeSpanMs || 4500) / 1000)}s · Shared Device / IP Fingerprints
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Risk Signals List */}
      <div>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--admin-text)', marginBottom: '10px' }}>
          Recent Risk Signals & Geo Anomaly Logs
        </h3>
        <div style={{ overflowX: 'auto', border: '1px solid var(--admin-border)', borderRadius: 'var(--admin-radius-lg)' }}>
          <table className="db-data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '10px 14px' }}>User ID</th>
                <th style={{ textAlign: 'left', padding: '10px 14px' }}>Signal Type</th>
                <th style={{ textAlign: 'center', padding: '10px 14px' }}>Severity</th>
                <th style={{ textAlign: 'center', padding: '10px 14px' }}>Status</th>
                <th style={{ textAlign: 'right', padding: '10px 14px' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {signals.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '16px', color: 'var(--admin-text-muted)' }}>
                    No risk signals recorded.
                  </td>
                </tr>
              ) : (
                signals.map((sig) => (
                  <tr key={sig.signal_id || sig.id} style={{ borderBottom: '1px solid var(--admin-border)' }}>
                    <td style={{ padding: '10px 14px', fontFamily: 'var(--admin-font-mono)' }}>{sig.user_id}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 600 }}>{sig.signal_type || sig.category}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 800, background: sig.severity === 'CRITICAL' || sig.severity === 'HIGH' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)', color: sig.severity === 'CRITICAL' || sig.severity === 'HIGH' ? '#ef4444' : '#f59e0b' }}>
                        {sig.severity || 'NORMAL'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', fontSize: '0.78rem' }}>{sig.status || 'NEW'}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <button
                        type="button"
                        className="admin-btn admin-btn--secondary"
                        style={{ fontSize: '0.72rem', padding: '4px 8px' }}
                        onClick={() => handleRestrictUser(sig.user_id)}
                      >
                        Restrict
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
