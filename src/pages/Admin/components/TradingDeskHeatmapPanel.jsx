import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { adminApiClient } from '../api/adminApiClient';

export default function TradingDeskHeatmapPanel({ matchId = 'live_match_1' }) {
  const [selectedMatchId, setSelectedMatchId] = useState(matchId);
  const [heatmapData, setHeatmapData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const [freezing, setFreezing] = useState(false);

  const fetchHeatmap = async (mId) => {
    setLoading(true);
    setError('');
    try {
      const data = await adminApiClient.get(`/trading/heatmap/${encodeURIComponent(mId || selectedMatchId)}`);
      setHeatmapData(data);
    } catch (err) {
      setError(err.message || 'Failed to load trading heatmap');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHeatmap(selectedMatchId);
  }, [selectedMatchId]);

  const handleQuickFreeze = async (freeze = true) => {
    setFreezing(true);
    setActionNotice('');
    setError('');
    try {
      const endpoint = freeze ? '/operations/freeze-match' : '/operations/thaw-match';
      await adminApiClient.post(endpoint, {
        matchId: selectedMatchId,
        reason: freeze ? 'TRADER_MANUAL_PANIC_FREEZE' : 'TRADER_MANUAL_THAW',
      });
      setActionNotice(freeze ? '🛑 Match market trading FROZEN successfully.' : '🟢 Match market trading RESUMED successfully.');
      fetchHeatmap(selectedMatchId);
    } catch (err) {
      setError(err.message || 'Action failed');
    } finally {
      setFreezing(false);
    }
  };

  return (
    <div className="admin-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--admin-text)', margin: 0 }}>
            🏏 Live Trading Desk & Liability Heatmap
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--admin-text-muted)', margin: '4px 0 0' }}>
            Real-time ball-by-ball run ladder and house exposure modeling.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            className="admin-btn admin-btn--secondary"
            onClick={() => fetchHeatmap(selectedMatchId)}
            disabled={loading}
          >
            ↻ Refresh Heatmap
          </button>
          <button
            type="button"
            className="admin-btn"
            style={{ background: '#ef4444', color: '#fff', fontWeight: 700 }}
            onClick={() => handleQuickFreeze(true)}
            disabled={freezing}
          >
            🛑 1-Click Freeze
          </button>
          <button
            type="button"
            className="admin-btn"
            style={{ background: '#10b981', color: '#fff', fontWeight: 700 }}
            onClick={() => handleQuickFreeze(false)}
            disabled={freezing}
          >
            🟢 Thaw / Resume
          </button>
        </div>
      </div>

      {actionNotice && (
        <div style={{ padding: '12px 16px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10b981', color: '#10b981', fontSize: '0.84rem', fontWeight: 600 }}>
          {actionNotice}
        </div>
      )}

      {error && (
        <div style={{ padding: '12px 16px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#ef4444', fontSize: '0.84rem' }}>
          {error}
        </div>
      )}

      {heatmapData && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          <div style={{ padding: '14px', borderRadius: '10px', background: 'var(--admin-panel-alt, rgba(255,255,255,0.03))', border: '1px solid var(--admin-border)' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--admin-text-dim)', textTransform: 'uppercase' }}>Live Score</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--admin-text)', marginTop: '4px' }}>
              {heatmapData.currentScore || 0} / {heatmapData.currentOvers || 0} ov
            </div>
          </div>
          <div style={{ padding: '14px', borderRadius: '10px', background: 'var(--admin-panel-alt, rgba(255,255,255,0.03))', border: '1px solid var(--admin-border)' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--admin-text-dim)', textTransform: 'uppercase' }}>Total Book Stakes</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#3b82f6', marginTop: '4px' }}>
              ₹{Number(heatmapData.totalStakesCollected || 0).toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {/* Heatmap Ladder Table */}
      <div style={{ overflowX: 'auto', border: '1px solid var(--admin-border)', borderRadius: '10px' }}>
        <table className="db-data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '10px 14px' }}>Projected Target Runs</th>
              <th style={{ textAlign: 'right', padding: '10px 14px' }}>Projected Payout</th>
              <th style={{ textAlign: 'right', padding: '10px 14px' }}>House Net P&L</th>
              <th style={{ textAlign: 'center', padding: '10px 14px' }}>Risk Exposure Zone</th>
            </tr>
          </thead>
          <tbody>
            {heatmapData?.runBuckets?.map((bucket) => {
              const isProfit = bucket.netHousePnL >= 0;
              const zoneBg = bucket.colorZone === 'GREEN_PROFIT'
                ? 'rgba(16, 185, 129, 0.15)'
                : bucket.colorZone === 'RED_HIGH_LIABILITY'
                  ? 'rgba(239, 68, 68, 0.2)'
                  : 'rgba(245, 158, 11, 0.15)';
              const zoneColor = bucket.colorZone === 'GREEN_PROFIT'
                ? '#10b981'
                : bucket.colorZone === 'RED_HIGH_LIABILITY'
                  ? '#ef4444'
                  : '#f59e0b';

              return (
                <tr key={bucket.projectedRuns} style={{ borderBottom: '1px solid var(--admin-border)', background: bucket.isCurrentTrajectory ? 'rgba(99, 102, 241, 0.08)' : 'transparent' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 700 }}>
                    {bucket.projectedRuns} Runs {bucket.isCurrentTrajectory && <span style={{ fontSize: '0.7rem', background: '#6366f1', color: '#fff', padding: '2px 6px', borderRadius: '4px', marginLeft: '6px' }}>Current Trajectory</span>}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--admin-font-mono)' }}>
                    ₹{bucket.projectedPayout.toLocaleString()}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, fontFamily: 'var(--admin-font-mono)', color: isProfit ? '#10b981' : '#ef4444' }}>
                    {isProfit ? '+' : ''}₹{bucket.netHousePnL.toLocaleString()}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                    <span style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 800, background: zoneBg, color: zoneColor }}>
                      {bucket.colorZone.replace('_', ' ')}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
