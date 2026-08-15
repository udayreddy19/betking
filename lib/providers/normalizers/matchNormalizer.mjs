/**
 * Standardized Match Normalizer
 * Converts raw match data from live data providers into canonical match structures.
 */

import { formatTeamShortName } from '../../../src/utils/teamShortName.js';

export function normalizeMatch(rawPayload = {}, sourceProviderId = 'UNKNOWN') {
  const matchId = String(rawPayload.id || rawPayload.matchId || rawPayload.match_id || `match_${Date.now()}`);
  const sport = String(rawPayload.sport || 'CRICKET').toUpperCase();
  
  const rawFormat = String(rawPayload.format || rawPayload.matchType || rawPayload.league || '').toLowerCase();
  const format = rawFormat.includes('hundred') ? 'THE_HUNDRED'
    : rawFormat.includes('test') ? 'TEST'
    : rawFormat.includes('odi') ? 'ODI'
    : rawFormat.includes('t10') ? 'T10'
    : 'T20';

  const rawT1 = rawPayload.team1 || rawPayload.homeTeam || rawPayload.team_a;
  const rawT2 = rawPayload.team2 || rawPayload.awayTeam || rawPayload.team_b;

  const team1Name = typeof rawT1 === 'string' ? rawT1 : (rawT1?.name || rawT1?.teamName || 'Team 1');
  const team2Name = typeof rawT2 === 'string' ? rawT2 : (rawT2?.name || rawT2?.teamName || 'Team 2');

  const team1Id = (typeof rawT1 === 'object' && rawT1?.id) ? rawT1.id : team1Name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const team2Id = (typeof rawT2 === 'object' && rawT2?.id) ? rawT2.id : team2Name.toLowerCase().replace(/[^a-z0-9]/g, '_');

  const isLive = rawPayload.status === 'LIVE' || rawPayload.isLive === true || rawPayload.status === 'IN_PROGRESS';
  const isCompleted = rawPayload.status === 'COMPLETED' || rawPayload.status === 'FINISHED' || rawPayload.isFinished === true;
  const status = isLive ? 'LIVE' : (isCompleted ? 'COMPLETED' : 'SCHEDULED');

  const ballsPerInnings = format === 'THE_HUNDRED' ? 100 : (format === 'TEST' ? 450 : (format === 'ODI' ? 300 : (format === 'T10' ? 60 : 120)));

  return {
    canonicalMatchId: matchId,
    providerId: sourceProviderId,
    providerMatchId: matchId,
    sport,
    format,
    status,
    league: rawPayload.league || rawPayload.competition || 'Cricket League',
    team1: {
      id: team1Id,
      name: team1Name,
      shortName: formatTeamShortName(team1Name, typeof rawT1 === 'object' ? rawT1?.shortName : ''),
      runs: Number((typeof rawT1 === 'object' ? rawT1.runs : null) ?? rawPayload.score1 ?? 0),
      wickets: Number((typeof rawT1 === 'object' ? rawT1.wickets : null) ?? rawPayload.wickets1 ?? 0),
      balls: Number((typeof rawT1 === 'object' ? rawT1.balls : null) ?? 0),
    },
    team2: {
      id: team2Id,
      name: team2Name,
      shortName: formatTeamShortName(team2Name, typeof rawT2 === 'object' ? rawT2?.shortName : ''),
      runs: Number((typeof rawT2 === 'object' ? rawT2.runs : null) ?? rawPayload.score2 ?? 0),
      wickets: Number((typeof rawT2 === 'object' ? rawT2.wickets : null) ?? rawPayload.wickets2 ?? 0),
      balls: Number((typeof rawT2 === 'object' ? rawT2.balls : null) ?? 0),
    },
    currentInnings: Number(rawPayload.currentInnings || 1),
    target: rawPayload.target != null ? Number(rawPayload.target) : null,
    ballsPerInnings,
    stateVersion: Number(rawPayload.stateVersion || 1),
    providerTimestamp: rawPayload.timestamp || Date.now(),
    receivedTimestamp: Date.now(),
  };
}
