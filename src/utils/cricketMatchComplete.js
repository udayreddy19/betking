import { getMatchMaxBalls, isTestMatch, oversToBallsForMatch } from './cricketFormat.js';
import { teamNameMatches } from './cricketScores.js';

function parseRuns(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  const str = String(value);
  const match = str.match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function parseWickets(value, fallback = 0) {
  const str = String(value ?? '');
  const slash = str.match(/\d+\s*\/\s*(\d+)/);
  if (slash) return Number(slash[1]);
  const num = Number(value);
  if (Number.isFinite(num) && num >= 0 && !str.includes('/')) return num;
  return fallback;
}

function parseBalls(overs, match) {
  return oversToBallsForMatch(overs ?? '0', match);
}

function whichTeam(label, t1Name, t2Name) {
  if (!label) return null;
  const m1 = teamNameMatches(t1Name, label);
  const m2 = teamNameMatches(t2Name, label);
  if (m1 && !m2) return 1;
  if (m2 && !m1) return 2;
  const l = String(label).toLowerCase().trim();
  if (String(t1Name).toLowerCase().trim() === l) return 1;
  if (String(t2Name).toLowerCase().trim() === l) return 2;
  return null;
}

function statusText(match) {
  const ld = match?.liveDetails || {};
  return [
    match?.status,
    match?.liveStatus,
    match?.time,
    match?.result,
    match?.matchHeader?.status,
    match?.matchHeader?.stateTitle,
    ld.commentary,
    ld.minute,
    ld.status,
  ].filter(Boolean).join(' ').toLowerCase();
}

function isCricketSport(match) {
  const sport = String(match?.sport || 'cricket').toLowerCase();
  return !sport || sport === 'cricket' || sport === 'virtual-cricket';
}

function isSecondInningsStarted(match, ld) {
  const inningsId = Number(ld.inningsId) || 0;
  if (inningsId >= 2) return true;
  const chaseProgress = Number(ld.chaseRuns) > 0 || Number(ld.chaseWickets) > 0;
  const bothTeamsScored = parseRuns(match?.team1?.runs ?? match?.score1 ?? ld.score1) > 0
    && parseRuns(match?.team2?.runs ?? match?.score2) > 0;

  if (inningsId === 1) {
    if (chaseProgress) return true;
    if (bothTeamsScored) return true;
    return false;
  }
  if (chaseProgress) return true;
  // Named chase with overs clock (incl. "0.0") — not chaseTeamName / overs2 alone
  if (ld.chaseTeamName && ld.chaseOvers != null && String(ld.chaseOvers).trim() !== '') {
    return true;
  }
  if (ld.chaseOvers != null
    && String(ld.chaseOvers).trim() !== ''
    && ld.chaseOvers !== '0'
    && ld.chaseOvers !== '0.0'
    && parseRuns(ld.firstRuns) > 0) {
    return true;
  }
  if (bothTeamsScored) return true;
  if (/need\s+\d+\s+runs|chasing|target/i.test(String(ld.commentary || ''))) {
    return parseRuns(ld.firstRuns) > 0 || parseRuns(match?.score1) > 0;
  }
  return false;
}

function firstAndChaseScores(match) {
  const ld = match.liveDetails || {};
  const team1Runs = parseRuns(match.team1?.runs ?? match.score1 ?? ld.score1);
  const team2Runs = parseRuns(match.team2?.runs ?? match.score2 ?? ld.score2);
  const team1Wkts = parseWickets(match.team1?.wickets ?? match.score1, parseWickets(ld.wickets1, 0));
  const team2Wkts = parseWickets(match.team2?.wickets ?? match.score2, parseWickets(ld.wickets2, ld.chaseWickets ?? 0));

  let firstRuns = parseRuns(ld.firstRuns);
  let firstWickets = parseWickets(ld.firstWickets, 0);
  // Prefer explicit chase fields — never treat team-aligned score2 as chase by default.
  let chaseRuns = parseRuns(ld.chaseRuns);
  let chaseWickets = parseWickets(ld.chaseWickets, 0);
  let chaseBalls = 0;
  if (ld.chaseOvers != null && String(ld.chaseOvers).trim() !== '') {
    chaseBalls = parseBalls(ld.chaseOvers, match);
  } else if (ld.overs2 != null && String(ld.overs2).trim() !== '') {
    chaseBalls = parseBalls(ld.overs2, match);
  } else if (Number(ld.inningsId) >= 2) {
    // At chase start (0/0), do not treat leftover first-innings overs as chase exhaustion.
    if (chaseRuns === 0 && chaseWickets === 0) {
      chaseBalls = 0;
    } else {
      chaseBalls = parseBalls(ld.overs || '0', match);
    }
  }

  const maxBallsForFormat = getMatchMaxBalls(match) || 120;
  if (chaseRuns === 0 && chaseWickets === 0 && chaseBalls >= maxBallsForFormat) {
    chaseBalls = 0;
  }

  if (firstRuns <= 0 && team1Runs > 0 && team2Runs > 0) {
    const t1 = String(match.team1?.name || match.team1 || '');
    const t2 = String(match.team2?.name || match.team2 || '');
    const chaseSide = whichTeam(ld.chaseTeamName, t1, t2);
    const firstSide = whichTeam(ld.firstTeamName, t1, t2);
    if (chaseSide === 1 || firstSide === 2) {
      firstRuns = team2Runs;
      firstWickets = team2Wkts;
      chaseRuns = team1Runs;
      chaseWickets = team1Wkts;
    } else if (chaseSide === 2 || firstSide === 1) {
      firstRuns = team1Runs;
      firstWickets = team1Wkts;
      chaseRuns = team2Runs;
      chaseWickets = team2Wkts;
    } else {
      // Unlabeled team-aligned: finished/fuller innings is first; the other is chase.
      const maxBalls = getMatchMaxBalls(match) || 120;
      const t1Balls = parseBalls(match.team1?.overs || ld.overs1 || '0', match);
      const t2Balls = parseBalls(match.team2?.overs || ld.overs2 || ld.overs || '0', match);
      const t1Done = t1Balls >= maxBalls || team1Wkts >= 10;
      const t2Done = t2Balls >= maxBalls || team2Wkts >= 10;
      if (t2Done && !t1Done) {
        firstRuns = team2Runs;
        firstWickets = team2Wkts;
        chaseRuns = team1Runs;
        chaseWickets = team1Wkts;
        chaseBalls = t1Balls;
      } else {
        firstRuns = team1Runs;
        firstWickets = team1Wkts;
        chaseRuns = team2Runs;
        chaseWickets = team2Wkts;
        chaseBalls = t2Balls || chaseBalls;
      }
    }
  } else if (firstRuns <= 0) {
    firstRuns = team1Runs;
    firstWickets = team1Wkts || firstWickets;
  }

  if (chaseRuns <= 0 && ld.chaseRuns == null) {
    // Only fall back to team2 when we still have no chase total after mapping
    chaseRuns = team2Runs;
  }

  return { firstRuns, firstWickets, chaseRuns, chaseWickets, chaseBalls };
}

/**
 * True when a limited-overs cricket match has a result, even if the feed still says Live.
 * Innings break is not complete. Tests only complete on an explicit result string or 4th-innings finish.
 */
export function isCricketMatchCompleted(match) {
  if (!match || !isCricketSport(match)) return false;

  const text = statusText(match);
  if (/innings\s*break/.test(text)) return false;

  // Only true match-result phrases — not commentary like "won the race" / "beat the bat" / "won the review".
  const withoutToss = text.replace(/won the toss/g, ' ');
  if (
    /\b(won by|won with|won the match|match won|have won by|has won by)\b/.test(withoutToss)
    || /\b(defeated)\b/.test(withoutToss)
    || /\bbeat\s+[A-Z(]/.test(withoutToss)
    || /match over|match completed|completed match|target reached|chase (?:complete|successful)/i.test(text)
  ) {
    return true;
  }
  if (/need\s+0\s+(?:more\s+)?runs/.test(text)) return true;

  const ld = match.liveDetails || {};
  const test = isTestMatch(match) || (ld.testInnings?.length > 2);

  // Ignore stale runsRequired<=0 unless the chase score actually reached/passed first innings.
  // Never apply this limited-overs heuristic to Tests (4th innings target ≠ 1st innings + 1).
  if (!test && ld.runsRequired != null && Number(ld.runsRequired) <= 0 && isSecondInningsStarted(match, ld)) {
    const { firstRuns, chaseRuns } = firstAndChaseScores(match);
    if (firstRuns > 0 && chaseRuns >= firstRuns + 1) return true;
  }

  if (!isSecondInningsStarted(match, ld)) return false;

  // Tests only complete on explicit result language / need-0 above — not score heuristics.
  if (test) return false;

  const { firstRuns, chaseRuns, chaseWickets, chaseBalls } = firstAndChaseScores(match);

  if (firstRuns > 0 && chaseRuns >= firstRuns + 1) return true;
  if (chaseWickets >= 10) return true;

  const maxBalls = getMatchMaxBalls(match);
  if (maxBalls && chaseBalls >= maxBalls && firstRuns > 0) return true;

  return false;
}
