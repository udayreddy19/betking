/**
 * OddsEngineV3 — CanonicalMatchState Model
 * 
 * The single, immutable input contract for OddsEngineV3.
 * Every field is explicitly defined. No optional fallbacks.
 */

/**
 * @typedef {Object} TeamState
 * @property {string} id
 * @property {string} name
 * @property {number} runs
 * @property {number} wickets
 * @property {number} balls
 */

/**
 * @typedef {Object} CanonicalMatchState
 * @property {string} matchId
 * @property {'CRICKET'} sport
 * @property {'THE_HUNDRED'|'T20'} format
 * @property {'LIVE'|'COMPLETED'|'SCHEDULED'} status
 * @property {TeamState} team1
 * @property {TeamState} team2
 * @property {1|2} currentInnings
 * @property {string} battingTeamId
 * @property {string} bowlingTeamId
 * @property {number|null} target
 * @property {number|null} runsRequired
 * @property {number} ballsPerInnings
 * @property {number} ballsCompleted
 * @property {number} ballsRemaining
 * @property {number} providerTimestamp
 * @property {number} stateVersion
 */

/**
 * Creates a validated CanonicalMatchState.
 * Does NOT apply defaults or fallbacks — every field must be explicit.
 */
export function createCanonicalMatchState(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('CanonicalMatchState: input must be a non-null object');
  }

  const required = [
    'matchId', 'sport', 'format', 'status',
    'team1', 'team2',
    'currentInnings', 'battingTeamId', 'bowlingTeamId',
    'ballsPerInnings', 'ballsCompleted', 'ballsRemaining',
    'providerTimestamp', 'stateVersion',
  ];

  for (const field of required) {
    if (input[field] === undefined || input[field] === null) {
      throw new Error(`CanonicalMatchState: missing required field '${field}'`);
    }
  }

  if (!input.team1?.id || !input.team1?.name) {
    throw new Error('CanonicalMatchState: team1 must have id and name');
  }
  if (!input.team2?.id || !input.team2?.name) {
    throw new Error('CanonicalMatchState: team2 must have id and name');
  }

  // Freeze the object to prevent mutation
  const state = Object.freeze({
    matchId: String(input.matchId),
    sport: String(input.sport),
    format: String(input.format),
    status: String(input.status),

    team1: Object.freeze({
      id: String(input.team1.id),
      name: String(input.team1.name),
      runs: Number(input.team1.runs),
      wickets: Number(input.team1.wickets),
      balls: Number(input.team1.balls),
    }),

    team2: Object.freeze({
      id: String(input.team2.id),
      name: String(input.team2.name),
      runs: Number(input.team2.runs),
      wickets: Number(input.team2.wickets),
      balls: Number(input.team2.balls),
    }),

    currentInnings: Number(input.currentInnings),
    battingTeamId: String(input.battingTeamId),
    bowlingTeamId: String(input.bowlingTeamId),

    target: input.target != null ? Number(input.target) : null,
    runsRequired: input.runsRequired != null ? Number(input.runsRequired) : null,

    ballsPerInnings: Number(input.ballsPerInnings),
    ballsCompleted: Number(input.ballsCompleted),
    ballsRemaining: Number(input.ballsRemaining),

    batter1: input.batter1 ? Object.freeze({ ...input.batter1 }) : null,
    batter2: input.batter2 ? Object.freeze({ ...input.batter2 }) : null,
    liveDetails: input.liveDetails ? Object.freeze({ ...input.liveDetails }) : null,
    odds: input.odds ? Object.freeze({ ...input.odds }) : null,

    // Ball-by-ball availability — delivery markets gate on this.
    hasBallFeed: input.hasBallFeed === true ? true : (input.hasBallFeed === false ? false : undefined),
    overHistory: Array.isArray(input.overHistory) ? input.overHistory : (input.liveDetails?.overHistory || undefined),

    providerTimestamp: Number(input.providerTimestamp),
    stateVersion: Number(input.stateVersion),
  });

  return state;
}
