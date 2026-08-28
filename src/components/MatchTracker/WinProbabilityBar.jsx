import React from 'react';
import { calculateWinProbability } from '../../utils/winProbabilityCalculator';

export default function WinProbabilityBar({ match }) {
  if (!match) return null;
  const probs = calculateWinProbability(match);
  const t1Name = match.team1?.shortName || match.team1?.name || 'Team 1';
  const t2Name = match.team2?.shortName || match.team2?.name || 'Team 2';

  return (
    <div style={{ padding: '12px 16px', background: 'rgba(30, 41, 59, 0.7)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', fontSize: '0.78rem', fontWeight: 800 }}>
        <div style={{ color: '#38bdf8' }}>
          {t1Name} <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{probs.team1Prob}%</span>
        </div>
        <div style={{ color: 'var(--color-text-muted, #94a3b8)', fontSize: '0.7rem', textTransform: 'uppercase' }}>
          Win Probability
        </div>
        <div style={{ color: '#a855f7' }}>
          <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{probs.team2Prob}%</span> {t2Name}
        </div>
      </div>

      <div style={{ height: '8px', width: '100%', background: '#0f172a', borderRadius: '4px', overflow: 'hidden', display: 'flex' }}>
        <div
          style={{
            width: `${probs.team1Prob}%`,
            background: 'linear-gradient(90deg, #0284c7, #38bdf8)',
            transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
        <div
          style={{
            width: `${probs.team2Prob}%`,
            background: 'linear-gradient(90deg, #c084fc, #9333ea)',
            transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
      </div>

      {probs.runsNeeded != null && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#94a3b8', marginTop: '6px' }}>
          <span>Need {probs.runsNeeded} from {probs.ballsRemaining} balls</span>
          <span>Req. RR: <strong style={{ color: '#f59e0b' }}>{probs.rrr}</strong></span>
        </div>
      )}
    </div>
  );
}
