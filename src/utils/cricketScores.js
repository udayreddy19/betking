import { normalizeCricbuzzOvers, oversToBalls } from './oversUtils';
import { normalizeMatchOvers, oversToBallsForMatch } from './cricketFormat';

function normalizeTeamToken(name = '') {
  return String(name)
    .toLowerCase()
    .replace(/\s+W$/, '')
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 5);
}

export function teamNameMatches(teamName, token) {
  if (!teamName || !token) return false;
  const team = normalizeTeamToken(teamName);
  const hint = normalizeTeamToken(token);
  if (!team || !hint) return false;
  return team.includes(hint) || hint.includes(team) || team.startsWith(hint) || hint.startsWith(team);
}

function scoreEntry(token, runs, wickets, overs, match) {
  const normalized = match ? normalizeMatchOvers(overs ?? '0.0', match) : normalizeCricbuzzOvers(overs ?? '0.0');
  return {
    token: token || '',
    runs: runs ?? 0,
    wickets: wickets ?? 0,
    overs: normalized,
    balls: match ? oversToBallsForMatch(overs ?? '0.0', match) : oversToBalls(overs ?? '0.0'),
  };
}

function pickEntryForTeam(entries, teamName) {
  return entries.find((entry) => entry.token && teamNameMatches(teamName, entry.token)) || null;
}

/**
 * Map liveDetails fields onto team1/team2 regardless of chase/first naming.
 */
export function resolveCricketTeamScores(match, ld = {}) {
  const team1Name = match?.team1?.name || '';
  const team2Name = match?.team2?.name || '';

  const entries = [];
  const isSecondInnings = (ld.inningsId ?? 0) > 1
    || (ld.chaseRuns != null && ld.firstRuns != null)
    || (ld.chaseTeamName && ld.firstTeamName);

  if (ld.firstRuns != null || ld.firstTeamName) {
    entries.push(scoreEntry(ld.firstTeamName, ld.firstRuns, ld.firstWickets, ld.firstOvers, match));
  }
  if (isSecondInnings) {
    entries.push(scoreEntry(
      ld.chaseTeamName,
      ld.chaseRuns ?? ld.score2 ?? 0,
      ld.chaseWickets ?? ld.wickets2 ?? 0,
      ld.chaseOvers ?? ld.overs2 ?? '0.0',
      match,
    ));
  }

  if (entries.length === 0) {
    return {
      team1: scoreEntry(team1Name, ld.runs, ld.wickets, ld.overs, match),
      team2: scoreEntry(team2Name, ld.score2, ld.wickets2, ld.overs2, match),
    };
  }

  if (entries.length === 1) {
    const entry = entries[0];
    if (teamNameMatches(team1Name, entry.token)) {
      return {
        team1: { ...entry, token: team1Name },
        team2: scoreEntry(team2Name, 0, 0, '0.0', match),
      };
    }
    if (teamNameMatches(team2Name, entry.token)) {
      return {
        team1: scoreEntry(team1Name, 0, 0, '0.0', match),
        team2: { ...entry, token: team2Name },
      };
    }
    return {
      team1: { ...entry, token: team1Name },
      team2: scoreEntry(team2Name, 0, 0, '0.0', match),
    };
  }

  const team1Entry = pickEntryForTeam(entries, team1Name);
  const team2Entry = pickEntryForTeam(entries, team2Name);
  const used = new Set([team1Entry, team2Entry].filter(Boolean));

  const remaining = entries.filter((entry) => !used.has(entry));
  const fallbackTeam1 = team1Entry || remaining[0] || scoreEntry(team1Name, 0, 0, '0.0', match);
  const fallbackTeam2 = team2Entry || (remaining.length > 1 ? remaining[1] : scoreEntry(team2Name, 0, 0, '0.0', match));

  if (fallbackTeam1 === fallbackTeam2 && entries.length > 1) {
    return {
      team1: { ...entries[0], token: team1Name },
      team2: { ...entries[1], token: team2Name },
    };
  }

  return {
    team1: fallbackTeam1,
    team2: fallbackTeam2,
  };
}

export function flattenCricketTeamScores(scores) {
  return {
    runs: scores.team1.runs,
    wickets: scores.team1.wickets,
    overs: scores.team1.overs,
    score2: scores.team2.runs,
    wickets2: scores.team2.wickets,
    overs2: scores.team2.overs,
  };
}

export function isCricketSecondInnings(match, ld = {}) {
  if (match?.matchState !== 'in' && !match?.isLive) return false;

  if ((ld.inningsId ?? 0) >= 2) return true;

  if (ld.chaseRuns != null && ld.firstRuns != null && (ld.chaseRuns > 0 || ld.chaseOvers || (ld.chaseWickets ?? 0) > 0)) return true;

  if (ld.chaseTeamName && ld.firstTeamName && (ld.chaseRuns > 0 || (ld.chaseBallNbr ?? 0) > 0)) return true;

  const { team1, team2 } = resolveCricketTeamScores(match, ld);
  const team2Played = team2.runs > 0 || team2.wickets > 0 || team2.balls > 0;

  if (team2Played) {
    return true;
  }

  const isOdi = /50|one day|cup|list a/i.test(match?.league || match?.seriesName || '');
  const team1MaxBalls = isOdi ? 300 : 120;
  const team1InningsFinished = team1.wickets >= 10 || team1.balls >= team1MaxBalls;

  return team1InningsFinished && (team2Played || (ld.chaseBallNbr ?? 0) > 0);
}
