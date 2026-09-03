import React from 'react';
import LiveMatchGraphicWidget from '../../../components/LiveMatchGraphicWidget/LiveMatchGraphicWidget';

/**
 * Same live tracker / scorecard / lineups the sportsbook shows users.
 */
export default function AdminVerifyLiveMatch({ match }) {
  if (!match?.id && !match?.matchId) {
    return (
      <p style={{ margin: 0, color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
        Live match feed is not in cache for this bet yet. Re-run verify after the fixture appears on live scores.
      </p>
    );
  }

  const widgetMatch = {
    ...match,
    id: match.id || match.matchId,
    matchId: match.matchId || match.id,
  };

  return (
    <div className="admin-verify-live">
      <div style={{
        fontSize: '0.72rem',
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: 'var(--admin-text-muted)',
        marginBottom: 8,
      }}>
        Match · live score & lineups
      </div>
      <LiveMatchGraphicWidget match={widgetMatch} />
    </div>
  );
}
