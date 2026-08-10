/**
 * Match State Integrity Engine — Validation & Verification Guard
 * Verifies live match state transitions, score monotonicity, player affiliations, and overs bounds.
 */

import { isPlaceholderPlayerName } from '../src/utils/cricketPlayers.js';

export function validateMatchStateTransition(currentState, newState) {
  const errors = [];
  const warnings = [];

  if (!newState) {
    return { isValid: false, errors: ['New match state is null or undefined'] };
  }

  // 1. Match Version Integrity Check
  if (currentState && newState.matchVersion != null && currentState.matchVersion != null) {
    if (newState.matchVersion < currentState.matchVersion) {
      errors.push(`Stale state version update rejected: new version (${newState.matchVersion}) < current version (${currentState.matchVersion})`);
    }
  }

  // 2. Score Monotonicity Check for Cricket
  if (currentState?.liveDetails && newState?.liveDetails) {
    const prevRuns = currentState.liveDetails.runs ?? 0;
    const currRuns = newState.liveDetails.runs ?? 0;
    const prevWkts = currentState.liveDetails.wickets ?? 0;
    const currWkts = newState.liveDetails.wickets ?? 0;

    if (currRuns < prevRuns && !newState.allowScoreRevision) {
      warnings.push(`Score anomaly detected: runs dropped from ${prevRuns} to ${currRuns}`);
    }
    if (currWkts < prevWkts && !newState.allowScoreRevision) {
      errors.push(`Wicket state corruption rejected: wickets dropped from ${prevWkts} to ${currWkts}`);
    }
  }

  // 3. Player Affiliation & Role Validation
  const ld = newState.liveDetails || {};
  const batTeam = ld.battingTeam || newState.team1?.name || newState.team1;
  const bowlTeam = ld.bowlingTeam || newState.team2?.name || newState.team2;

  if (ld.bowler) {
    const bowlerName = typeof ld.bowler === 'object' ? ld.bowler.name : ld.bowler;
    if (bowlerName && (bowlerName === batTeam || bowlerName === bowlTeam)) {
      errors.push(`Invalid bowler state: team name '${bowlerName}' cannot be assigned as player name`);
    }
  }

  // 4. Over Bounds Check
  if (ld.overs) {
    const parts = String(ld.overs).split('.');
    const balls = parseInt(parts[1], 10) || 0;
    if (balls > 6) {
      errors.push(`Invalid ball count in over: ${ld.overs} (balls in over cannot exceed 6)`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

export function sanitizeMatchState(match) {
  if (!match) return null;

  const ld = match.liveDetails || {};
  let cleanedBowler = ld.bowler;

  if (typeof cleanedBowler === 'object' && cleanedBowler?.name) {
    cleanedBowler = cleanedBowler.name;
  }

  const team1Str = String(match.team1?.name || match.team1 || '');
  const team2Str = String(match.team2?.name || match.team2 || '');

  if (isPlaceholderPlayerName(cleanedBowler) || cleanedBowler === team1Str || cleanedBowler === team2Str) {
    cleanedBowler = null;
  }

  return {
    ...match,
    liveDetails: {
      ...ld,
      bowler: cleanedBowler,
    },
  };
}
