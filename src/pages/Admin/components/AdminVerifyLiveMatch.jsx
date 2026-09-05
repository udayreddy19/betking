import React, { useMemo } from 'react';
import LiveMatchGraphicWidget from '../../../components/LiveMatchGraphicWidget/LiveMatchGraphicWidget';
import { useLiveMatches } from '../../../context/LiveSportsContext';
import { findLiveMatch } from '../../../utils/findLiveMatch';

function teamName(team) {
  if (!team) return '';
  return typeof team === 'string' ? team : (team.name || '');
}

function vsHint(match, matchName) {
  if (matchName && /\bvs\.?\b/i.test(matchName)) return matchName;
  const t1 = teamName(match?.team1);
  const t2 = teamName(match?.team2);
  if (t1 && t2) return `${t1} vs ${t2}`;
  return matchName || '';
}

/**
 * Same live tracker the sportsbook shows players — resolved from /api/live-scores,
 * not from the bet placement snapshot (which stays UPCOMING).
 */
export default function AdminVerifyLiveMatch({ match, matchName }) {
  const liveMatches = useLiveMatches();

  const widgetMatch = useMemo(() => {
    const hint = vsHint(match, matchName);
    const fromBoard = findLiveMatch(liveMatches, {
      matchId: match?.id || match?.matchId,
      matchName: hint,
    });
    const resolved = fromBoard || match;
    if (!resolved?.id && !resolved?.matchId) return null;
    return {
      ...resolved,
      id: resolved.id || resolved.matchId,
      matchId: resolved.matchId || resolved.id,
    };
  }, [liveMatches, match, matchName]);

  if (!widgetMatch) {
    return (
      <p style={{ margin: 0, color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
        Live match feed is not in cache for this bet yet. Re-run verify after the fixture appears on live scores.
      </p>
    );
  }

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
        Match · same live board as players
      </div>
      <LiveMatchGraphicWidget match={widgetMatch} />
    </div>
  );
}
