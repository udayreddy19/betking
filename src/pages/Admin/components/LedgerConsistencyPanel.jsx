import React, { useState, useEffect } from 'react';
import { adminApiClient } from '../api/adminApiClient';

export default function LedgerConsistencyPanel() {
  const [auditData, setAuditData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchLedgerAudit = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminApiClient.get('/reconciliation/ledger-consistency');
      setAuditData(res.audit);
    } catch (err) {
      setError(err.message || 'Failed to run ledger consistency audit');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLedgerAudit();
  }, []);

  return (
    <div className="admin-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--admin-text)', margin: 0 }}>
            💰 Double-Entry Ledger Invariant Health
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--admin-text-muted)', margin: '4px 0 0' }}>
            Audits the fundamental equation: ∑(Wallet Balances) = ∑(Ledger Credits) - ∑(Ledger Debits)
          </p>
        </div>

        <button
          type="button"
          className="admin-btn admin-btn--secondary"
          onClick={fetchLedgerAudit}
          disabled={loading}
        >
          {loading ? 'Auditing…' : '↻ Run Live Audit'}
        </button>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#ef4444', fontSize: '0.84rem' }}>
          {error}
        </div>
      )}

      {auditData && (
        <>
          {/* Top Status Banner */}
          <div style={{
            padding: '16px 20px',
            borderRadius: '10px',
            background: auditData.isHealthy ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${auditData.isHealthy ? '#10b981' : '#ef4444'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.05rem', color: auditData.isHealthy ? '#10b981' : '#ef4444' }}>
                {auditData.isHealthy ? '✅ Ledger Invariant Validated & Consistent' : '⚠️ Balance Discrepancy Detected'}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--admin-text-muted)', marginTop: '4px' }}>
                Execution Time: {auditData.executionTimeMs}ms · Audited at {new Date(auditData.auditedAt).toLocaleString()}
              </div>
            </div>
            <span style={{
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '0.82rem',
              fontWeight: 800,
              background: auditData.isHealthy ? '#10b981' : '#ef4444',
              color: '#fff',
            }}>
              {auditData.status}
            </span>
          </div>

          {/* Metric Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            <div style={{ padding: '14px', borderRadius: '10px', background: 'var(--admin-panel-alt, rgba(255,255,255,0.03))', border: '1px solid var(--admin-border)' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--admin-text-dim)', textTransform: 'uppercase' }}>Total Wallets</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--admin-text)', marginTop: '4px' }}>
                {auditData.totalWallets?.toLocaleString()}
              </div>
            </div>
            <div style={{ padding: '14px', borderRadius: '10px', background: 'var(--admin-panel-alt, rgba(255,255,255,0.03))', border: '1px solid var(--admin-border)' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--admin-text-dim)', textTransform: 'uppercase' }}>Total Wallet Sum</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#3b82f6', marginTop: '4px' }}>
                ₹{auditData.totalWalletBalanceSum?.toLocaleString()}
              </div>
            </div>
            <div style={{ padding: '14px', borderRadius: '10px', background: 'var(--admin-panel-alt, rgba(255,255,255,0.03))', border: '1px solid var(--admin-border)' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--admin-text-dim)', textTransform: 'uppercase' }}>Negative Balances</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 800, color: auditData.negativeBalanceWallets === 0 ? '#10b981' : '#ef4444', marginTop: '4px' }}>
                {auditData.negativeBalanceWallets}
              </div>
            </div>
            <div style={{ padding: '14px', borderRadius: '10px', background: 'var(--admin-panel-alt, rgba(255,255,255,0.03))', border: '1px solid var(--admin-border)' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--admin-text-dim)', textTransform: 'uppercase' }}>Ledger Entries</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--admin-text)', marginTop: '4px' }}>
                {auditData.ledgerEntriesAudited?.toLocaleString()}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
