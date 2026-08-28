import React from 'react';

export default function CricketMomentumBar({ overHistory = [] }) {
  if (!Array.isArray(overHistory) || overHistory.length === 0) return null;

  const recentOvers = overHistory.slice(-8);

  return (
    <div style={{ padding: '12px 14px', background: 'rgba(30, 41, 59, 0.7)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', marginBottom: '12px' }}>
      <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: '8px' }}>
        Recent Overs Momentum
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', height: '54px' }}>
        {recentOvers.map((ov, idx) => {
          const runs = Number(ov.runs || 0);
          const hasWicket = ov.wickets > 0 || (Array.isArray(ov.balls) && ov.balls.some((b) => String(b).toUpperCase().includes('W')));
          const barHeight = Math.max(12, Math.min(48, (runs / 24) * 48));
          const isHighRun = runs >= 12;

          return (
            <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 800, color: hasWicket ? '#ef4444' : isHighRun ? '#10b981' : '#fff' }}>
                {runs}{hasWicket ? 'W' : ''}
              </span>
              <div
                style={{
                  width: '100%',
                  height: `${barHeight}px`,
                  borderRadius: '4px 4px 0 0',
                  background: hasWicket
                    ? '#ef4444'
                    : isHighRun
                      ? 'linear-gradient(180deg, #10b981, #059669)'
                      : 'linear-gradient(180deg, #38bdf8, #0284c7)',
                  transition: 'height 0.3s',
                }}
              />
              <span style={{ fontSize: '0.62rem', color: '#64748b' }}>Ov {ov.overNum || ov.over || idx + 1}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
