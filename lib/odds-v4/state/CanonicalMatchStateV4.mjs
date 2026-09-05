/**
 * OddsEngineV4 — immutable match state contract.
 */

export function createCanonicalMatchStateV4(input = {}) {
  if (!input || typeof input !== 'object') {
    throw new Error('CanonicalMatchStateV4: input must be a non-null object');
  }

  const required = [
    'matchId', 'sport', 'format', 'status',
    'team1', 'team2',
    'currentInnings', 'battingTeamId', 'bowlingTeamId',
    'ballsPerInnings', 'ballsCompleted', 'ballsRemaining',
  ];
  for (const field of required) {
    if (input[field] === undefined || input[field] === null) {
      throw new Error(`CanonicalMatchStateV4: missing required field '${field}'`);
    }
  }

  const team = (t) => Object.freeze({
    id: String(t.id),
    name: String(t.name),
    shortName: t.shortName ? String(t.shortName) : undefined,
    runs: Number(t.runs) || 0,
    wickets: Number(t.wickets) || 0,
    balls: Number(t.balls) || 0,
  });

  return Object.freeze({
    matchId: String(input.matchId),
    sport: String(input.sport || 'cricket'),
    format: String(input.format),
    status: String(input.status),
    phase: String(input.phase || 'UNKNOWN'),
    team1: team(input.team1),
    team2: team(input.team2),
    currentInnings: Number(input.currentInnings) || 1,
    battingTeamId: String(input.battingTeamId),
    bowlingTeamId: String(input.bowlingTeamId),
    target: input.target == null ? null : Number(input.target),
    runsRequired: input.runsRequired == null ? null : Number(input.runsRequired),
    ballsPerInnings: Number(input.ballsPerInnings),
    ballsCompleted: Number(input.ballsCompleted) || 0,
    ballsRemaining: Number(input.ballsRemaining) || 0,
    wicketsInHand: Number(input.wicketsInHand ?? (10 - (Number(input.battingWickets) || 0))),
    battingRuns: Number(input.battingRuns) || 0,
    battingWickets: Number(input.battingWickets) || 0,
    firstInningsRuns: input.firstInningsRuns == null ? null : Number(input.firstInningsRuns),
    firstInningsWickets: input.firstInningsWickets == null ? null : Number(input.firstInningsWickets),
    firstInningsBalls: input.firstInningsBalls == null ? null : Number(input.firstInningsBalls),
    batter1: input.batter1 || null,
    batter2: input.batter2 || null,
    bowler: input.bowler || null,
    ballFeedAgeMs: Number(input.ballFeedAgeMs) || 0,
    hasBallFeed: Boolean(input.hasBallFeed),
    hasNamedBatters: Boolean(input.hasNamedBatters),
    formatConfidence: String(input.formatConfidence || 'high'),
    providerOdds: input.providerOdds || null,
    league: input.league ? String(input.league) : null,
    providerTimestamp: Number(input.providerTimestamp) || Date.now(),
    stateVersion: Number(input.stateVersion) || 1,
    sourceMatch: input.sourceMatch || null,
  });
}
