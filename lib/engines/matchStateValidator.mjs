/**
 * Match State Validator (lib/engines/matchStateValidator.mjs)
 * Validates canonical MatchState integrity before market generation or odds pricing.
 * Prevents invalid/contradictory match states from producing active betting odds.
 */

export class MatchStateValidator {
  /**
   * Validates a NormalizedMatchState instance
   */
  validateMatchState(matchState) {
    if (!matchState || !matchState.matchId) {
      return { valid: false, code: 'MATCH_STATE_INVALID', reason: 'Missing match state object or matchId' };
    }

    const currentInnings = matchState.currentInnings;
    const team1Runs = matchState.teams?.team1?.runs || 0;
    const team2Runs = matchState.teams?.team2?.runs || 0;
    const target = matchState.target;
    const runsRequired = matchState.runsRequired;

    // Rule 1: Only 1 or 2 current innings supported for standard cricket matches
    if (currentInnings !== 1 && currentInnings !== 2) {
      return { valid: false, code: 'MATCH_STATE_INVALID', reason: `Invalid currentInnings: ${currentInnings}` };
    }

    // Rule 2: If Team 2 has scored runs or is chasing, currentInnings MUST be 2
    if (currentInnings === 1 && team2Runs > 0) {
      return {
        valid: false,
        code: 'MATCH_STATE_INVALID',
        reason: `Contradiction: Team 2 has scored ${team2Runs} runs but currentInnings is set to 1`,
      };
    }

    // Rule 3: Target consistency in Innings 2
    if (currentInnings === 2) {
      if (team1Runs > 0 && target != null && target <= team1Runs) {
        return {
          valid: false,
          code: 'MATCH_STATE_INVALID',
          reason: `Target ${target} is less than or equal to Team 1 runs ${team1Runs}`,
        };
      }

      if (target != null && runsRequired != null) {
        const expectedRequired = target - team2Runs;
        if (runsRequired !== expectedRequired && expectedRequired >= 0) {
          return {
            valid: false,
            code: 'MATCH_STATE_INVALID',
            reason: `Runs required mismatch: expected ${expectedRequired}, got ${runsRequired}`,
          };
        }
      }
    }

    // Rule 4: Ball count bounds
    if (matchState.formatRules?.maxBalls != null) {
      if (matchState.ballsCompleted > matchState.formatRules.maxBalls + 12) {
        return {
          valid: false,
          code: 'MATCH_STATE_INVALID',
          reason: `Balls completed (${matchState.ballsCompleted}) exceeds max balls (${matchState.formatRules.maxBalls})`,
        };
      }
    }

    return { valid: true };
  }
}

export const matchStateValidator = new MatchStateValidator();
