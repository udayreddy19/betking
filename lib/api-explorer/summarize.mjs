/** Sports sample summarizer — never includes raw HTML or provider credentials. */

function teamName(team) {
  if (!team) return null;
  if (typeof team === 'string') return team;
  return team.name || team.shortName || team.id || null;
}

function pickScore(match) {
  if (!match || typeof match !== 'object') return null;
  const live = match.liveDetails || match.score || null;
  if (live && typeof live === 'object') {
    return {
      team1: live.runs ?? live.score1 ?? live.team1Score ?? null,
      team2: live.score2 ?? live.team2Score ?? null,
      overs: live.overs ?? live.overs1 ?? null,
      wickets: live.wickets ?? null,
      period: live.period ?? null,
    };
  }
  if (match.team1Score != null || match.score1 != null) {
    return { team1: match.team1Score ?? match.score1, team2: match.team2Score ?? match.score2 };
  }
  return null;
}

export function summarizeSportsMatches(raw, provider) {
  const list = Array.isArray(raw)
    ? raw
    : (raw?.matches || raw?.data || raw?.live || []);
  const matches = (Array.isArray(list) ? list : []).slice(0, 8).map((m) => ({
    id: m?.id || m?.matchId || m?.eventId || null,
    teams: [teamName(m?.team1), teamName(m?.team2)].filter(Boolean),
    score: pickScore(m),
    status: m?.status || m?.matchState || m?.state || (m?.isLive ? 'LIVE' : null),
    startTime: m?.startTime || m?.startDate || m?.dateTimeGMT || m?.date || null,
    league: m?.league || m?.seriesName || m?.competition || m?.tournament || null,
    provider,
  }));
  return {
    provider,
    matchCount: Array.isArray(list) ? list.length : 0,
    shown: matches.length,
    matches,
  };
}

export function summarizeOddsSnapshot(snapshot, inputState, durationMs, validationErrors = []) {
  const markets = Array.isArray(snapshot?.markets) ? snapshot.markets : [];
  const selections = markets.reduce((n, m) => n + (Array.isArray(m.selections) ? m.selections.length : 0), 0);
  const active = markets.filter((m) => String(m.status || '').toUpperCase() === 'OPEN');
  return {
    engine: snapshot?.engine || 'OddsEngineV3',
    engineVersion: snapshot?.engineVersion || null,
    matchId: snapshot?.matchId,
    sandbox: true,
    status: snapshot?.status,
    stateVersion: snapshot?.stateVersion,
    oddsVersion: snapshot?.oddsVersion,
    generatedAt: snapshot?.generatedAt
      ? new Date(snapshot.generatedAt).toISOString()
      : null,
    marketCount: markets.length,
    activeMarketCount: active.length,
    activeSelectionCount: selections,
    validationErrors,
    generationDurationMs: durationMs,
    pipeline: [
      { step: 'Input CanonicalMatchState', status: 'OK' },
      { step: 'Market Generation', status: 'OK', count: markets.length },
      { step: 'Probability Calculation', status: 'OK' },
      { step: 'Fair Odds', status: 'OK' },
      { step: 'Margin Application', status: 'OK' },
      { step: 'Final OddsSnapshot', status: snapshot?.status || 'OK' },
    ],
    markets: markets.slice(0, 24).map((m) => ({
      marketId: m.marketId,
      marketType: m.marketType,
      status: m.status,
      selections: (m.selections || []).slice(0, 8).map((s) => ({
        name: s.name,
        odds: s.odds,
      })),
    })),
    inputCanonicalMatchState: inputState
      ? {
        matchId: inputState.matchId,
        sport: inputState.sport,
        format: inputState.format,
        status: inputState.status,
        label: 'TEST/SANDBOX — does not affect live betting',
        team1: inputState.team1?.name,
        team2: inputState.team2?.name,
        currentInnings: inputState.currentInnings,
        stateVersion: inputState.stateVersion,
      }
      : null,
  };
}
