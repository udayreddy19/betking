import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';

export default function ControlTowerView() {
  const [metrics, setMetrics] = useState({
    activeUsers: 1420,
    openBets: 384,
    liveMatches: 14,
    todayTurnover: 482900,
    ggr: 42100,
    pendingWithdrawals: 12,
    riskAlerts: 3,
    openTickets: 5,
    systemStatus: 'HEALTHY',
  });

  useEffect(() => {
    adminApiClient.get('/control-tower/metrics')
      .then((data) => setMetrics((prev) => ({ ...prev, ...data })))
      .catch((err) => console.warn('Control tower metrics fetch fallback:', err));
  }, []);

  const metricCards = [
    { label: 'Active Users', value: metrics.activeUsers.toLocaleString(), change: '📈 +12% today', color: '#34d399', accentBg: 'rgba(16, 185, 129, 0.15)' },
    { label: 'Today Turnover', value: `₹${metrics.todayTurnover.toLocaleString()}`, change: '💳 Gross Turnover', color: '#60a5fa', accentBg: 'rgba(59, 130, 246, 0.15)' },
    { label: 'Gross Gaming Revenue (GGR)', value: `₹${metrics.ggr.toLocaleString()}`, change: '📊 Hold: 8.7%', color: '#a78bfa', accentBg: 'rgba(139, 92, 246, 0.15)' },
    { label: 'Live Matches', value: metrics.liveMatches, change: '📡 Active feeds', color: '#f472b6', accentBg: 'rgba(236, 72, 153, 0.15)' },
    { label: 'Open Exposure / Bets', value: metrics.openBets, change: '🎟️ Risk Live', color: '#fbbf24', accentBg: 'rgba(245, 158, 11, 0.15)' },
    { label: 'Pending Withdrawals', value: metrics.pendingWithdrawals, change: '⚠️ Action required', color: '#f87171', accentBg: 'rgba(239, 68, 68, 0.15)' },
    { label: 'Risk & Fraud Alerts', value: metrics.riskAlerts, change: '🚨 Critical', color: '#ef4444', accentBg: 'rgba(220, 38, 38, 0.2)' },
    { label: 'Open Support Tickets', value: metrics.openTickets, change: '🎧 SLA: 98%', color: '#22d3ee', accentBg: 'rgba(6, 182, 212, 0.15)' },
  ];

  const recentIncidents = [
    { id: 'INC-901', title: 'Provider Feed Reconnect', severity: 'MEDIUM', status: 'RESOLVED', time: '10 mins ago' },
    { id: 'INC-902', title: 'Withdrawal Webhook Delay (Razorpay)', severity: 'HIGH', status: 'INVESTIGATING', time: '25 mins ago' },
    { id: 'INC-903', title: 'High Exposure Alert on TNPL Match', severity: 'CRITICAL', status: 'ACKNOWLEDGED', time: '40 mins ago' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#fff' }}>01 · Control Tower Executive Operational Center</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.85rem' }}>
            Real-time sportsbook telemetry, exposure monitors, API health, and critical actions.
          </p>
        </div>
        <motion.span
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          style={{ padding: '6px 16px', borderRadius: '20px', background: 'rgba(16, 185, 129, 0.18)', color: '#34d399', fontWeight: 800, fontSize: '0.82rem', border: '1px solid rgba(16, 185, 129, 0.35)', boxShadow: '0 2px 10px rgba(16, 185, 129, 0.2)' }}
        >
          🟢 System Status: {metrics.systemStatus}
        </motion.span>
      </div>

      {/* Animated Key Metrics Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {metricCards.map((card, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.04 }}
            whileHover={{ scale: 1.04, y: -6, boxShadow: `0 12px 28px ${card.accentBg}` }}
            whileTap={{ scale: 0.98 }}
            style={{
              background: 'linear-gradient(135deg, rgba(31, 41, 55, 0.6) 0%, rgba(17, 24, 39, 0.8) 100%)',
              border: '1px solid var(--admin-border)',
              borderRadius: '12px',
              padding: '18px',
              position: 'relative',
              overflow: 'hidden',
              cursor: 'pointer',
              transition: 'border-color 0.2s ease',
            }}
          >
            <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: card.color }} />
            <span style={{ fontSize: '0.74rem', color: 'var(--admin-text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{card.label}</span>
            <div style={{ fontSize: '1.65rem', fontWeight: 900, margin: '8px 0 4px', color: card.color, fontVariantNumeric: 'tabular-nums' }}>{card.value}</div>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--admin-text-muted)' }}>{card.change}</span>
          </motion.div>
        ))}
      </div>

      {/* Incident & Operational Action Feed */}
      <AdminDataTable
        title="Live Operational Alerts & System Incidents"
        data={recentIncidents}
        columns={[
          { header: 'Incident ID', key: 'id' },
          { header: 'Title / Description', key: 'title' },
          {
            header: 'Severity',
            key: 'severity',
            render: (r) => (
              <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '0.74rem', fontWeight: 800, background: r.severity === 'CRITICAL' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)', color: r.severity === 'CRITICAL' ? '#f87171' : '#fbbf24', border: r.severity === 'CRITICAL' ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(245, 158, 11, 0.4)' }}>
                {r.severity}
              </span>
            ),
          },
          { header: 'Status', key: 'status' },
          { header: 'Timestamp', key: 'time' },
        ]}
      />
    </div>
  );
}
