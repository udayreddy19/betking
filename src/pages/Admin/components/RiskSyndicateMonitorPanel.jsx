import React, { useState, useEffect } from 'react';
import { adminApiClient } from '../api/adminApiClient';

export default function RiskSyndicateMonitorPanel() {
  const [syndicates, setSyndicates] = useState([]);
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionNotice, setActionNotice] = useState('');

  const fetchRiskData = async () => {
    setLoading(true);
    setError('');
    try {
      const [synRes, sigRes] = await Promise.all([
        adminApiClient.get('/risk/syndicates').catch(() => ({ syndicates: [] })),
        adminApiClient.get('/risk/signals?limit=15').catch(() => ({ signals: [] })),
      ]);
      setSyndicates(synRes.syndicates || []);
      setSignals(sigRes.signals || []);
    } catch (err) {
      setError(err.message || 'Failed to load risk monitor');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRiskData();
  }, []);

  const handleRestrictUser = async (userId) => {
    setActionNotice('');
    try {
      await adminApiClient.post('/risk/user-tier', { userId, tier: 'RESTRICTED' });
      setActionNotice(`User ${userId} risk tier set to RESTRICTED.`);
      fetchRiskData();
    } catch (err) {
      setError(err.message || 'Failed to update user tier');
    }
  };

  return (
    <div className="admin-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--admin-text)', margin: 0 }}>
            🛡️ Syndicate, Fraud & Geo Anomaly Monitor
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--admin-text-muted)', margin: '4px 0 0' }}>
            Real-time multi-account arbitrage detection, impossible travel speed, and AML velocity monitoring.
          </p>
        </div>

        <button
          type="button"
          className="admin-btn admin-btn--secondary"
          onClick={fetchRiskData}
          disabled={loading}
        >
          ↻ Refresh Signals
        </button>
      </div>

      {actionNotice && (
        <div style={{ padding: '12px 16px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10b981', color: '#10b981', fontSize: '0.84rem' }}>
          {actionNotice}
        </div>
      )}

      {error && (
        <div style={{ padding: '12px 16px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#ef4444', fontSize: '0.84rem' }}>
          {error}
        </div>
      )}

      {/* Active Syndicate Detections */}
      <div>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--admin-text)', marginBottom: '10px' }}>
          ⚡ Coordinated Syndicate Spikes ({syndicates.length})
        </h3>
        {syndicates.length === 0 ? (
          <div style={{ padding: '16px', borderRadius: '8px', background: 'var(--admin-panel-alt, rgba(255,255,255,0.02))', border: '1px solid var(--admin-border)', fontSize: '0.84rem', color: 'var(--admin-text-muted)' }}>
            No active syndicate patterns detected in the current window.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {syndicates.map((syn, idx) => (
              <div key={idx} style={{ padding: '14px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 800, color: '#ef4444', fontSize: '0.88rem' }}>
                    🚨 {syn.accountsCount} Coordinated Accounts · Total Stake ₹{Number(syn.totalStake || 0).toLocaleString()}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--admin-text-muted)', marginTop: '4px' }}>
                    Match: {syn.matchId} · Market: {syn.marketId} · Selection: {syn.selectionId}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--admin-text-dim)', marginTop: '2px' }}>
                    Accounts: {syn.accounts?.join(', ')}
                  </div>
                </div>
                <button
                  type="button"
                  className="admin-btn admin-btn--secondary"
                  style={{ fontSize: '0.76rem' }}
                  onClick={() => syn.accounts?.forEach(handleRestrictUser)}
                >
                  Restrict All
                </button>
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
        <div style={{ overflowX: 'auto', border: '1px solid var(--admin-border)', borderRadius: '10px' }}>
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
