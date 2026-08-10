import { useState, useEffect } from 'react';
import { isTestMatch, getTestMatchDayLabel } from '../../utils/cricketFormat';

export default function MatchCountdownTimer({ match, showIcon = true, className = '', style = {} }) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    if (!match) return;

    const updateTimer = () => {
      const isLive = match.isLive || match.matchState === 'in';
      const isTest = isTestMatch(match);
      const testDayLabel = isTest ? getTestMatchDayLabel(match) : null;

      if (isLive) {
        if (isTest && testDayLabel) {
          setTimeLeft(`${testDayLabel}`);
        } else {
          setTimeLeft('');
        }
        return;
      }

      // If scheduled match
      let targetDate = null;
      if (match.startTime) {
        targetDate = new Date(match.startTime);
      } else if (match.matchDate) {
        targetDate = new Date(match.matchDate);
      } else if (match.time && match.time.includes(':')) {
        const timeMatch = match.time.match(/(\d{1,2}):(\d{2})/);
        if (timeMatch) {
          const now = new Date();
          const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(timeMatch[1], 10), parseInt(timeMatch[2], 10));
          if (target.getTime() < now.getTime()) {
            target.setDate(target.getDate() + 1);
          }
          targetDate = target;
        }
      }

      if (!targetDate) {
        // Fallback demo countdown timer (2h 45m 30s)
        const fakeTarget = new Date(Date.now() + (2 * 3600 + 45 * 60 + 30) * 1000);
        targetDate = fakeTarget;
      }

      const diffMs = targetDate.getTime() - Date.now();
      if (diffMs <= 0) {
        setTimeLeft('Starts Imminently');
        return;
      }

      const totalSec = Math.floor(diffMs / 1000);
      const days = Math.floor(totalSec / 86400);
      const hours = Math.floor((totalSec % 86400) / 3600);
      const mins = Math.floor((totalSec % 3600) / 60);
      const secs = totalSec % 60;

      const pad = (n) => String(n).padStart(2, '0');

      if (days > 0) {
        setTimeLeft(`Starts in ${days}d ${pad(hours)}h ${pad(mins)}m ${pad(secs)}s`);
      } else if (hours > 0) {
        setTimeLeft(`Starts in ${pad(hours)}h ${pad(mins)}m ${pad(secs)}s`);
      } else {
        setTimeLeft(`Starts in ${pad(mins)}m ${pad(secs)}s`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [match]);

  if (!timeLeft) return null;

  return (
    <span
      className={`match-countdown-timer-chip ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        background: 'rgba(59, 130, 246, 0.18)',
        color: '#60a5fa',
        border: '1px solid rgba(59, 130, 246, 0.4)',
        padding: '4px 12px',
        borderRadius: '20px',
        fontSize: '0.82rem',
        fontWeight: 800,
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '0.3px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
        ...style,
      }}
    >
      {showIcon && <span>⏱️</span>}
      <span>{timeLeft}</span>
    </span>
  );
}
