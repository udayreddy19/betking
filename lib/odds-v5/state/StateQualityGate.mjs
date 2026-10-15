/**
 * StateQualityGate — refuse/suspend pricing when live cricket state is not bettable.
 * Does not invent missing chase fields; prefers SUSPEND over flat books.
 */

function upper(v) {
  return String(v || '').toUpperCase();
}

function isTestFormat(format) {
  const f = upper(format);
  return f.includes('TEST') || f.includes('FIRST_CLASS');
}

function feedAgeMs(state) {
  const ts = state?.timestamp || state?.lastUpdated || state?.feedTimestamp || state?.updatedAt;
  if (!ts) return null;
  const t = new Date(ts).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Date.now() - t);
}

/**
 * @param {object} state Canonical-ish match state
 * @param {{ maxFeedAgeMs?: number }} [opts]
 * @returns {{ ok: boolean, action: 'OPEN'|'SUSPEND', reasons: string[], phase: string|null, feedAgeMs: number|null }}
 */
export function evaluateStateQuality(state, opts = {}) {
  const reasons = [];
  const maxFeedAgeMs = Number(opts.maxFeedAgeMs) > 0 ? Number(opts.maxFeedAgeMs) : 90_000;
  const status = upper(state?.status);
  const format = state?.format;
  const age = feedAgeMs(state);

  if (!state || typeof state !== 'object') {
    return { ok: false, action: 'SUSPEND', reasons: ['missing_state'], phase: null, feedAgeMs: null };
  }

  if (!format || upper(format) === 'UNKNOWN') {
    reasons.push('format_uncertain');
  }

  if (!state.team1?.id || !state.team2?.id) {
    reasons.push('teams_incomplete');
  }

  if (status === 'LIVE' || state?.isLive) {
    if (age != null && age > maxFeedAgeMs) {
      reasons.push('feed_stale');
    }

    const innings = Number(state.currentInnings);
    if (!(innings === 1 || innings === 2)) {
      reasons.push('innings_unknown');
    }

    const battingOk = state.battingTeamId === state.team1?.id || state.battingTeamId === state.team2?.id;
    if (!battingOk) {
      reasons.push('batting_side_unknown');
    }

    // Chase (2nd innings): require target + runsRequired; ballsRemaining required except Test.
    if (innings === 2) {
      const target = Number(state.target);
      const need = Number(state.runsRequired);
      if (!(target > 0) || !(need >= 0)) {
        reasons.push('chase_target_incomplete');
      }
      if (!isTestFormat(format)) {
        const balls = Number(state.ballsRemaining);
        if (!(balls > 0) && balls !== 0) {
          reasons.push('balls_remaining_missing');
        }
      }
    }

    // Innings 1 limited-overs: need ballsRemaining for resource MW.
    if (innings === 1 && !isTestFormat(format)) {
      const balls = Number(state.ballsRemaining);
      if (!(balls >= 0) || !Number.isFinite(balls)) {
        reasons.push('balls_remaining_missing');
      }
    }

    // Score consistency light check
    const t1 = Number(state.team1?.runs);
    const t2 = Number(state.team2?.runs);
    if ((Number.isFinite(t1) && t1 < 0) || (Number.isFinite(t2) && t2 < 0)) {
      reasons.push('scores_inconsistent');
    }
  }

  const ok = reasons.length === 0;
  let phase = null;
  if (status === 'SCHEDULED' || status === 'UPCOMING') phase = 'prematch';
  else if (Number(state.currentInnings) === 1) phase = 'innings1';
  else if (Number(state.currentInnings) === 2) phase = 'chase';
  else if (status === 'LIVE') phase = 'live';

  return {
    ok,
    action: ok ? 'OPEN' : 'SUSPEND',
    reasons,
    phase,
    feedAgeMs: age,
  };
}

export function shouldSuspendForQuality(state, opts = {}) {
  const gate = evaluateStateQuality(state, opts);
  return gate.action === 'SUSPEND';
}
