/**
 * Extract match-card winner odds from an OddsEngineV4 snapshot.
 */

export function extractMatchWinnerOddsV4(snapshot, match = {}) {
  if (!snapshot || snapshot.status === 'INVALID_STATE' || snapshot.status === 'SUSPENDED') {
    return { team1: null, team2: null, draw: null, status: snapshot?.status || 'NOT_AVAILABLE' };
  }

  const winner = (snapshot.markets || []).find((m) => m.marketId === 'match_winner');
  if (!winner || winner.status !== 'OPEN') {
    return {
      team1: null,
      team2: null,
      draw: null,
      status: winner?.status || snapshot.status || 'SUSPENDED',
    };
  }

  const t1Name = match.team1?.name || match.team1;
  const t2Name = match.team2?.name || match.team2;
  const sels = winner.selections || [];
  const findSel = (name, idx) => {
    if (name) {
      const hit = sels.find((s) => String(s.name || '').toLowerCase() === String(name).toLowerCase());
      if (hit) return hit;
    }
    return sels[idx] || null;
  };

  const s1 = findSel(t1Name, 0);
  const s2 = findSel(t2Name, 1);
  const o1 = s1?.odds != null && Number(s1.odds) > 1 ? Number(Number(s1.odds).toFixed(2)) : null;
  const o2 = s2?.odds != null && Number(s2.odds) > 1 ? Number(Number(s2.odds).toFixed(2)) : null;

  return {
    team1: o1,
    team2: o2,
    home: o1,
    away: o2,
    draw: null,
    status: 'OPEN',
    oddsVersion: snapshot.oddsVersion,
    stateVersion: snapshot.stateVersion,
    generatedAt: snapshot.generatedAt,
  };
}
