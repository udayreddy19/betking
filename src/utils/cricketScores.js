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
  const team1Name = match?.team1?.name || match?.team1 || '';
  const team2Name = match?.team2?.name || match?.team2 || '';

  // Test match: resolve from testInnings[]
  if (ld.testInnings?.length > 0) {
    return resolveTestMatchTeamScores(match, ld);
  }

  const commentaryStr = ld.commentary || '';
  const needMatch = commentaryStr.match(/(?:([A-Za-z\s]+)\s+)?need\s+(\d+)\s+runs?/i);
  
  // 2nd Innings ONLY if we have explicit 2nd innings score fields or explicit chase commentary with firstRuns
  const hasSecondInningsData = (ld.inningsId ?? 0) >= 2
    || (ld.firstRuns != null && ld.chaseRuns != null)
    || ((ld.score1 != null || ld.runs != null) && (ld.score2 != null && ld.score2 > 0))
    || (ld.firstTeamName && ld.chaseTeamName && ld.chaseRuns != null)
    || (ld.wickets2 != null && ld.wickets2 > 0)
    || (ld.overs2 != null && ld.overs2 !== '0.0' && ld.overs2 !== '0')
    || Boolean(needMatch && ld.firstRuns != null);

  if (hasSecondInningsData) {
    let chaseTeam = ld.chaseTeamName;
    let targetRuns = null;

    if (needMatch) {
      if (!chaseTeam && needMatch[1]) chaseTeam = needMatch[1].trim();
      targetRuns = parseInt(needMatch[2], 10);
    }

    const firstTeam = ld.firstTeamName || (teamNameMatches(team1Name, chaseTeam) ? team2Name : team1Name);
    const firstRuns = ld.firstRuns ?? ld.score1 ?? ld.runs ?? (targetRuns ? targetRuns - 1 : 0);
    const firstWickets = ld.firstWickets ?? ld.wickets ?? (targetRuns ? 10 : 0);
    const firstOvers = ld.firstOvers || ld.overs || '0.0';

    const chaseRuns = ld.chaseRuns ?? ld.score2 ?? 0;
    const chaseWickets = ld.chaseWickets ?? ld.wickets2 ?? 0;
    const chaseOvers = ld.chaseOvers || ld.overs2 || '0.0';

    const firstScore = scoreEntry(firstTeam, firstRuns, firstWickets, firstOvers, match);
    const chaseScore = scoreEntry(chaseTeam || team2Name, chaseRuns, chaseWickets, chaseOvers, match);

    const isTeam1Chasing = teamNameMatches(team1Name, chaseTeam || ld.chaseTeamName);
    return {
      team1: isTeam1Chasing ? chaseScore : firstScore,
      team2: isTeam1Chasing ? firstScore : chaseScore,
    };
  }

  // 1st Innings: Team batting first gets current runs/wickets, opponent team stays 0/0
  const firstTeam = ld.firstTeamName || team1Name;
  const isTeam2BattingFirst = teamNameMatches(team2Name, firstTeam);

  const battingScore = scoreEntry(
    firstTeam,
    ld.runs ?? ld.firstRuns ?? 0,
    ld.wickets ?? ld.firstWickets ?? 0,
    ld.overs ?? ld.firstOvers ?? '0.0',
    match,
  );
  const idleScore = scoreEntry(
    isTeam2BattingFirst ? team1Name : team2Name,
    0,
    0,
    '0.0',
    match,
  );

  return {
    team1: isTeam2BattingFirst ? idleScore : battingScore,
    team2: isTeam2BattingFirst ? battingScore : idleScore,
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

  // Test match: only innings 4 is a "chase"
  if (ld.testInnings?.length > 0 || /test/i.test(ld.matchFormat || match?.matchFormat || '')) {
    return (ld.inningsId ?? 0) === 4;
  }

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

/**
 * Resolve Test match team scores from testInnings[] — sums each team's runs across all their innings.
 */
function resolveTestMatchTeamScores(match, ld) {
  const team1Name = match?.team1?.name || '';
  const team2Name = match?.team2?.name || '';
  const testInnings = ld.testInnings || [];

  const team1Innings = testInnings.filter((i) => {
    const bt = (i.batTeam || '').toLowerCase();
    return bt.includes(team1Name.toLowerCase().slice(0, 4)) || team1Name.toLowerCase().includes(bt.slice(0, 4));
  });
  const team2Innings = testInnings.filter((i) => {
    const bt = (i.batTeam || '').toLowerCase();
    return bt.includes(team2Name.toLowerCase().slice(0, 4)) || team2Name.toLowerCase().includes(bt.slice(0, 4));
  });

  // Use latest innings overs/wickets for display, but sum runs
  const team1Latest = team1Innings[team1Innings.length - 1];
  const team2Latest = team2Innings[team2Innings.length - 1];

  const t1Score = scoreEntry(
    team1Name,
    team1Innings.reduce((s, i) => s + i.runs, 0),
    team1Latest?.wickets ?? 0,
    team1Latest?.overs ?? '0.0',
    match,
  );
  const t2Score = scoreEntry(
    team2Name,
    team2Innings.reduce((s, i) => s + i.runs, 0),
    team2Latest?.wickets ?? 0,
    team2Latest?.overs ?? '0.0',
    match,
  );

  // Attach individual innings for UI consumption
  t1Score.innings = team1Innings;
  t2Score.innings = team2Innings;

  return { team1: t1Score, team2: t2Score };
}
