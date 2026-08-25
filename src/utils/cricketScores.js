import { normalizeCricbuzzOvers, oversToBalls } from './oversUtils.js';
import { normalizeMatchOvers, oversToBallsForMatch } from './cricketFormat.js';

/** Wickets in a single innings cannot exceed 10 (except test multi-day formats). */
export function clampInningsWickets(wickets, match) {
  const w = Number(wickets) || 0;
  if (w <= 0) return 0;
  const format = String(
    match?.liveDetails?.matchFormat
    || match?.matchType
    || match?.format
    || '',
  ).toLowerCase();
  if (/test/.test(format)) return w;
  return Math.min(w, 10);
}

function scoreEntry(token, runs, wickets, overs, match) {
  const normalized = match ? normalizeMatchOvers(overs ?? '0.0', match) : normalizeCricbuzzOvers(overs ?? '0.0');
  return {
    token: token || '',
    runs: runs ?? 0,
    wickets: clampInningsWickets(wickets, match),
    overs: normalized,
    balls: match ? oversToBallsForMatch(overs ?? '0.0', match) : oversToBalls(overs ?? '0.0'),
  };
}

function normalizeTeamToken(name = '') {
  return String(name)
    .toLowerCase()
    .replace(/\(women\)|\bwomen\b|\bw\b$/gi, 'w')
    .replace(/\(men\)|\bmen\b/gi, 'm')
    .replace(/[^a-z0-9]/g, '');
}

function teamInitials(name = '') {
  return String(name)
    .replace(/[()]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function teamNameMatches(teamName, token) {
  if (!teamName || !token) return false;
  const team = normalizeTeamToken(teamName);
  const hint = normalizeTeamToken(token);
  if (!team || !hint) return false;
  if (team === hint) return true;
  if (team.includes(hint) || hint.includes(team)) return true;
  const initials = teamInitials(teamName);
  const hintInitials = teamInitials(token);
  if (initials && (initials === hint || hint === initials || initials === hintInitials)) return true;
  const team5 = team.slice(0, 5);
  const hint5 = hint.slice(0, 5);
  return team5.length >= 3 && hint5.length >= 3 && (team.startsWith(hint5) || hint.startsWith(team5));
}

export function pickPositiveScore(primary, fallback, lastResort = 0) {
  const p = primary == null ? null : Number(primary);
  const f = fallback == null ? null : Number(fallback);
  if (p != null && Number.isFinite(p) && p > 0) return p;
  if (f != null && Number.isFinite(f) && f > 0) return f;
  if (p != null && Number.isFinite(p)) return p;
  if (f != null && Number.isFinite(f)) return f;
  return lastResort;
}

function pickEntryForTeam(entries, teamName) {
  return entries.find((entry) => entry.token && teamNameMatches(teamName, entry.token)) || null;
}

/** Feed copied the batting score onto both teams (often still labelled innings 2). */
export function looksLikeMirroredFirstInnings(match, ld = {}) {
  const text = String(ld.commentary || ld.minute || ld.period || match?.time || '');
  const firstInningsLabel = /first\s+innings/i.test(text) && !/second\s+innings/i.test(text);

  const t1 = Number(match?.team1?.runs ?? ld.score1 ?? ld.runs ?? 0);
  const t2 = Number(match?.team2?.runs ?? ld.score2 ?? 0);
  const w1 = Number(match?.team1?.wickets ?? ld.wickets1 ?? ld.wickets ?? 0);
  const w2 = Number(match?.team2?.wickets ?? ld.wickets2 ?? ld.chaseWickets ?? 0);
  const sameScore = t1 > 0 && t1 === t2;
  const sameWkts = w1 === w2;

  const firstRuns = Number(ld.firstRuns);
  const chaseRuns = Number(ld.chaseRuns);
  const distinctTotals = Number.isFinite(firstRuns) && firstRuns > 0
    && Number.isFinite(chaseRuns)
    && firstRuns !== chaseRuns;

  const firstOvers = String(ld.firstOvers || '');
  const chaseOvers = String(ld.chaseOvers || '');
  const distinctOvers = firstOvers
    && chaseOvers
    && firstOvers !== '0.0'
    && chaseOvers !== '0.0'
    && firstOvers !== chaseOvers;

  if (distinctTotals || distinctOvers) return false;
  if (firstInningsLabel) return true;
  if (!sameScore) return false;
  if (sameWkts && w1 > 10) return true;
  if (ld.chaseTeamName && Number(ld.chaseRuns) > 0 && Number(ld.firstRuns) > 0 && Number(ld.firstRuns) !== Number(ld.chaseRuns)) {
    return false;
  }
  return sameWkts || w2 === 0 || Number(ld.score2) === t1;
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
  const mirroredFirst = looksLikeMirroredFirstInnings(match, ld);

  // 2nd Innings ONLY with explicit chase signals — never score2/wickets2 alone
  const hasSecondInningsData = !mirroredFirst && (
    (Number(ld.inningsId) >= 2)
    || Number(ld.chaseRuns) > 0
    || Number(ld.chaseWickets) > 0
    || (ld.chaseOvers != null && ld.chaseOvers !== '0.0' && ld.chaseOvers !== '0' && ld.chaseOvers !== '')
    || Boolean(needMatch && (Number(ld.firstRuns) > 0 || Number(needMatch[2]) === 0))
    || (
      Number(match?.team1?.runs) > 0
      && Number(match?.team2?.runs) > 0
      && Number(match.team1.runs) !== Number(match.team2.runs)
    )
  );

  if (hasSecondInningsData) {
    let chaseTeam = ld.chaseTeamName;

    if (needMatch) {
      if (!chaseTeam && needMatch[1]) chaseTeam = needMatch[1].trim();
    }

    const firstTeam = ld.firstTeamName || (teamNameMatches(team1Name, chaseTeam) ? team2Name : team1Name);
    const firstFromMatch = teamNameMatches(team1Name, firstTeam)
      ? pickPositiveScore(match?.team1?.runs, match?.score1, 0)
      : pickPositiveScore(match?.team2?.runs, match?.score2, 0);
    const firstRuns = pickPositiveScore(
      ld.firstRuns,
      teamNameMatches(team1Name, firstTeam) ? ld.score1 : (teamNameMatches(team2Name, firstTeam) ? ld.score2 : null),
      firstFromMatch,
    );
    const firstWickets = pickPositiveScore(
      ld.firstWickets,
      teamNameMatches(team1Name, firstTeam) ? ld.wickets1 : ld.wickets2,
      teamNameMatches(team1Name, firstTeam) ? match?.team1?.wickets : match?.team2?.wickets,
    );
    const firstOvers = [
      ld.firstOvers,
      firstRuns > 0 && teamNameMatches(team1Name, firstTeam) ? ld.overs : null,
      firstRuns > 0 ? ld.overs2 : null,
      teamNameMatches(team1Name, firstTeam) ? match?.team1?.overs : match?.team2?.overs,
    ].find((value) => value != null && value !== '' && value !== 0 && value !== '0' && value !== '0.0')
      || '0.0';

    const chaseTeamObj = teamNameMatches(team1Name, chaseTeam || ld.chaseTeamName)
      ? match?.team1
      : match?.team2;
    const chaseRuns = Math.max(
      pickPositiveScore(
        ld.chaseRuns,
        ld.score2,
        pickPositiveScore(
          Number(ld.inningsId) >= 2 ? ld.runs : null,
          teamNameMatches(team1Name, chaseTeam || ld.chaseTeamName)
            ? pickPositiveScore(match?.team1?.runs, match?.score1, 0)
            : pickPositiveScore(match?.team2?.runs, match?.score2, 0),
        ),
      ),
      Number(chaseTeamObj?.runs) || 0,
    );
    const chaseWickets = clampInningsWickets(
      pickPositiveScore(ld.chaseWickets, ld.wickets2, chaseTeamObj?.wickets),
      match,
    );
    const chaseOvers = [ld.chaseOvers, ld.overs2, Number(ld.inningsId) >= 2 ? ld.overs : null, chaseTeamObj?.overs]
      .find((value) => value != null && value !== '' && value !== 0 && value !== '0' && value !== '0.0')
      || '0.0';

    const firstScore = scoreEntry(firstTeam, firstRuns, firstWickets, firstOvers, match);
    const chaseScore = scoreEntry(chaseTeam || team2Name, chaseRuns, chaseWickets, chaseOvers, match);

    const isTeam1Chasing = teamNameMatches(team1Name, chaseTeam || ld.chaseTeamName);
    return {
      team1: isTeam1Chasing ? chaseScore : firstScore,
      team2: isTeam1Chasing ? firstScore : chaseScore,
    };
  }

  // 1st Innings: Team batting first gets current runs/wickets, opponent team stays 0/0
  let firstTeam = ld.firstTeamName || team1Name;
  // Without firstTeamName, prefer the side that is actually scoring (away batting first)
  if (!ld.firstTeamName) {
    const t1r = Number(match?.team1?.runs ?? 0) || 0;
    const t2r = Number(match?.team2?.runs ?? ld.score2 ?? 0) || 0;
    if (t2r > 0 && t1r === 0) firstTeam = team2Name;
    else if (t1r > 0) firstTeam = team1Name;
  }
  const isTeam2BattingFirst = teamNameMatches(team2Name, firstTeam);

  const battingScore = scoreEntry(
    firstTeam,
    pickPositiveScore(
      ld.runs,
      ld.firstRuns,
      isTeam2BattingFirst
        ? pickPositiveScore(ld.score2, match?.team2?.runs ?? match?.score2, 0)
        : pickPositiveScore(ld.score1, match?.team1?.runs ?? match?.score1, 0),
    ),
    pickPositiveScore(
      ld.wickets,
      ld.firstWickets,
      isTeam2BattingFirst
        ? pickPositiveScore(ld.wickets2, match?.team2?.wickets, 0)
        : pickPositiveScore(ld.wickets1, match?.team1?.wickets, 0),
    ),
    ld.overs || ld.firstOvers || (isTeam2BattingFirst ? match?.team2?.overs : match?.team1?.overs) || '0.0',
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

export function isEmptyOversValue(value) {
  return value == null || value === '' || value === 0 || value === '0' || value === '0.0';
}

export function isCricketSecondInnings(match, ld = {}) {
  // Test match: only innings 4 is a "chase"
  if (ld.testInnings?.length > 0 || /test/i.test(ld.matchFormat || match?.matchFormat || '')) {
    return (ld.inningsId ?? 0) === 4;
  }

  if (looksLikeMirroredFirstInnings(match, ld)) return false;

  const inningsId = Number(ld.inningsId) || 0;
  if (inningsId >= 2) return true;

  const chaseProgress = Number(ld.chaseRuns) > 0 || Number(ld.chaseWickets) > 0;

  // Explicit first innings: only upgrade on real chase progress or both team cards scored
  if (inningsId === 1) {
    if (chaseProgress) return true;
    if (Number(match?.team1?.runs) > 0 && Number(match?.team2?.runs) > 0) return true;
    return false;
  }

  if (chaseProgress) return true;

  if (match?.matchState !== 'in' && !match?.isLive) return false;

  const chaseOversStarted = ld.chaseOvers && ld.chaseOvers !== '0.0' && ld.chaseOvers !== '0';
  if (chaseOversStarted && Number(ld.chaseBallNbr) > 0) return true;

  if (ld.chaseTeamName && ld.firstTeamName && Number(ld.chaseRuns) > 0) return true;

  if (Number(match?.team1?.runs) > 0 && Number(match?.team2?.runs) > 0) return true;

  return false;
}

/**
 * Resolve Test match team scores from testInnings[] — sums each team's runs across all their innings.
 */
function resolveTestMatchTeamScores(match, ld) {
  const team1Name = match?.team1?.name || '';
  const team2Name = match?.team2?.name || '';
  const testInnings = ld.testInnings || [];

  // batTeam is often an ICC code (SL, IND) — use teamNameMatches, not raw substring/slice.
  const team1Innings = testInnings.filter((i) => teamNameMatches(team1Name, i.batTeam || i.team || ''));
  const team2Innings = testInnings.filter((i) => teamNameMatches(team2Name, i.batTeam || i.team || ''));

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

export function resolveCricketTossText(match, extraState) {
  if (!match) return null;
  const isCricket = match.sport === 'cricket' || match.sport === 'virtual-cricket' || !match.sport;
  if (!isCricket) return null;

  const t = match.toss
    || match.liveDetails?.toss
    || match.matchHeader?.toss
    || extraState?.toss
    || match.matchHeader?.tossResults;
  if (t && typeof t === 'object' && (t.tossWinnerName || t.winnerName) && !t.winner) {
    const winner = t.tossWinnerName || t.winnerName;
    const raw = String(t.decision || '').toLowerCase();
    const decision = raw.includes('bowl') ? 'bowl' : raw.includes('bat') ? 'bat' : t.decision;
    if (winner && decision) return `${winner} won the toss & elected to ${decision}`;
    if (winner) return `${winner} won the toss`;
  }
  if (typeof t === 'string' && t.trim()) return t.trim();
  if (t && typeof t === 'object') {
    const winner = t.winnerName || t.winner || t.teamWinnerName;
    const decision = t.decision || t.decisionChoice;
    if (winner && decision) {
      return `${winner} won the toss & elected to ${String(decision).toLowerCase()}`;
    }
    if (winner) return `${winner} won the toss`;
  }

  const comm = extraState?.commentary || match.liveDetails?.commentary || '';
  if (/won the toss|opt(?:ed)? to (?:bat|bowl)|elected to/i.test(comm)) return comm;
  return null;
}
