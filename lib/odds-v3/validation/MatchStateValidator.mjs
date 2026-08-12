/**
 * OddsEngineV3 — MatchStateValidator
 * 
 * Validates a CanonicalMatchState before any pricing occurs.
 * Returns { valid: true } or { valid: false, reason: string }.
 * 
 * Also detects DETERMINED states (match already decided).
 */

import { getFormatRules } from '../format/CricketFormatRules.mjs';

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid
 * @property {string} [reason]
 * @property {boolean} [determined]       - true if match outcome is already decided
 * @property {string}  [winnerId]         - team id of winner if determined
 * @property {string}  [determinedReason] - human-readable determination reason
 */

/**
 * Validates the canonical match state.
 * @param {import('../models/CanonicalMatchState.mjs').CanonicalMatchState} state
 * @returns {ValidationResult}
 */
export function validateMatchState(state) {
  if (!state) return inv('state is null or undefined');

  // Sport
  if (state.sport !== 'CRICKET') return inv(`unsupported sport: ${state.sport}`);

  // Format
  const rules = getFormatRules(state.format);
  if (!rules) return inv(`unsupported format: ${state.format}`);

  // Status
  if (!['LIVE', 'COMPLETED', 'SCHEDULED'].includes(state.status)) {
    return inv(`invalid status: ${state.status}`);
  }

  // Team validation
  if (!state.team1?.id || !state.team2?.id) return inv('team ids missing');
  if (state.team1.id === state.team2.id) return inv('team1 and team2 have same id');

  // Numeric ranges — runs
  if (!isNonNegInt(state.team1.runs)) return inv(`team1.runs invalid: ${state.team1.runs}`);
  if (!isNonNegInt(state.team2.runs)) return inv(`team2.runs invalid: ${state.team2.runs}`);

  // Numeric ranges — wickets
  if (!isIntInRange(state.team1.wickets, 0, rules.maxWickets)) return inv(`team1.wickets out of range: ${state.team1.wickets}`);
  if (!isIntInRange(state.team2.wickets, 0, rules.maxWickets)) return inv(`team2.wickets out of range: ${state.team2.wickets}`);

  // Numeric ranges — balls
  if (!isNonNegInt(state.team1.balls)) return inv(`team1.balls invalid: ${state.team1.balls}`);
  if (!isNonNegInt(state.team2.balls)) return inv(`team2.balls invalid: ${state.team2.balls}`);

  // Innings
  if (state.currentInnings !== 1 && state.currentInnings !== 2) {
    return inv(`currentInnings must be 1 or 2, got: ${state.currentInnings}`);
  }

  // Batting/bowling team must be one of team1/team2
  const teamIds = [state.team1.id, state.team2.id];
  if (!teamIds.includes(state.battingTeamId)) return inv(`battingTeamId '${state.battingTeamId}' is not team1 or team2`);
  if (!teamIds.includes(state.bowlingTeamId)) return inv(`bowlingTeamId '${state.bowlingTeamId}' is not team1 or team2`);
  if (state.battingTeamId === state.bowlingTeamId) return inv('battingTeamId and bowlingTeamId are identical');

  // Balls arithmetic
  if (!isNonNegInt(state.ballsPerInnings)) return inv(`ballsPerInnings invalid: ${state.ballsPerInnings}`);
  if (!isNonNegInt(state.ballsCompleted)) return inv(`ballsCompleted invalid: ${state.ballsCompleted}`);
  if (!isNonNegInt(state.ballsRemaining)) return inv(`ballsRemaining invalid: ${state.ballsRemaining}`);
  if (state.ballsCompleted + state.ballsRemaining !== state.ballsPerInnings) {
    return inv(`ballsCompleted(${state.ballsCompleted}) + ballsRemaining(${state.ballsRemaining}) != ballsPerInnings(${state.ballsPerInnings})`);
  }

  // Innings 2 specific validations
  if (state.currentInnings === 2) {
    if (state.target == null) return inv('innings 2 requires target');
    if (state.runsRequired == null) return inv('innings 2 requires runsRequired');
    if (!Number.isFinite(state.target) || state.target < 1) return inv(`target invalid: ${state.target}`);

    // Resolve batting team score
    const battingTeam = state.battingTeamId === state.team1.id ? state.team1 : state.team2;
    const expectedRequired = state.target - battingTeam.runs;

    if (state.runsRequired !== expectedRequired) {
      return inv(`runsRequired(${state.runsRequired}) != target(${state.target}) - battingTeamRuns(${battingTeam.runs}) = ${expectedRequired}`);
    }

    // DETERMINATION: target reached or surpassed
    if (battingTeam.runs >= state.target) {
      return det(state.battingTeamId, `${battingTeam.name} reached target ${state.target}`);
    }

    // DETERMINATION: all out or no balls remaining
    if (state.ballsRemaining === 0 || battingTeam.wickets >= rules.maxWickets) {
      return det(state.bowlingTeamId, `${battingTeam.name} failed to reach target: ${battingTeam.runs}/${battingTeam.wickets} (${state.ballsCompleted} balls)`);
    }

    // DETERMINATION: mathematically impossible (need more than max possible)
    // In cricket the theoretical max per ball is ~6 (excluding extras for simplicity)
    const maxPossible = state.ballsRemaining * 6;
    if (state.runsRequired > maxPossible + 1) {
      // +1 grace for extras, but if impossible even with all sixes + extras
    }
  }

  // stateVersion and providerTimestamp
  if (!Number.isFinite(state.stateVersion)) return inv(`stateVersion invalid: ${state.stateVersion}`);
  if (!Number.isFinite(state.providerTimestamp)) return inv(`providerTimestamp invalid: ${state.providerTimestamp}`);

  return { valid: true };
}

// --- Helpers ---

function inv(reason) {
  return { valid: false, reason };
}

function det(winnerId, reason) {
  return { valid: true, determined: true, winnerId, determinedReason: reason };
}

function isNonNegInt(n) {
  return Number.isFinite(n) && n >= 0 && Number.isInteger(n);
}

function isIntInRange(n, min, max) {
  return Number.isFinite(n) && Number.isInteger(n) && n >= min && n <= max;
}
