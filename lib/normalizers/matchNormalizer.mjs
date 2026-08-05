/**
 * Master Match Normalizer
 * Enforces a single, unified JSON structure across ALL sports & providers.
 */

export function normalizeStandardMatch(rawMatch = {}, providerName = 'gateway') {
  const sport = String(rawMatch.sport || 'cricket').toLowerCase();

  const isLive = rawMatch.isLive || rawMatch.matchState === 'in' || String(rawMatch.status).toUpperCase() === 'LIVE';
  const isPost = rawMatch.matchState === 'post' || String(rawMatch.status).toUpperCase() === 'FINISHED';

  let status = 'SCHEDULED';
  if (isLive) status = 'LIVE';
  else if (isPost) status = 'FINISHED';

  const homeTeamName = rawMatch.team1?.name || rawMatch.homeTeam?.name || 'Home Team';
  const awayTeamName = rawMatch.team2?.name || rawMatch.awayTeam?.name || 'Away Team';

  const homeShort = rawMatch.team1?.shortName || rawMatch.homeTeam?.shortName || homeTeamName.slice(0, 3).toUpperCase();
  const awayShort = rawMatch.team2?.shortName || rawMatch.awayTeam?.shortName || awayTeamName.slice(0, 3).toUpperCase();

  const ld = rawMatch.liveDetails || rawMatch.score || {};

  return {
    matchId: String(rawMatch.id || rawMatch.matchId || `gwy_${Date.now()}`),
    sport,
    competition: rawMatch.league || rawMatch.seriesName || rawMatch.competition || 'International League',
    status,
    homeTeam: {
      id: rawMatch.team1?.id || rawMatch.homeTeam?.id || `tm_${homeShort.toLowerCase()}`,
      name: homeTeamName,
      shortName: homeShort,
      logo: rawMatch.team1?.logo || rawMatch.homeTeam?.logo || null,
    },
    awayTeam: {
      id: rawMatch.team2?.id || rawMatch.awayTeam?.id || `tm_${awayShort.toLowerCase()}`,
      name: awayTeamName,
      shortName: awayShort,
      logo: rawMatch.team2?.logo || rawMatch.awayTeam?.logo || null,
    },
    score: {
      home: ld.runs ?? ld.score1 ?? ld.home ?? 0,
      away: ld.score2 ?? ld.away ?? 0,
      wickets: ld.wickets ?? 0,
      overs: ld.overs ?? '0.0',
      period: ld.period || rawMatch.time || (status === 'LIVE' ? 'In Progress' : 'Scheduled'),
    },
    events: rawMatch.events || [],
    statistics: rawMatch.statistics || {},
    players: rawMatch.players || [],
    venue: {
      name: rawMatch.venue?.name || 'Main Stadium',
      city: rawMatch.venue?.city || 'Host City',
    },
    provider: providerName,
    lastUpdated: new Date().toISOString(),
  };
}
