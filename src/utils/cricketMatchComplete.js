import { getMatchMaxBalls, isTestMatch } from './cricketFormat.js';

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

function parseBalls(overs) {
  const str = String(overs ?? '0');
  const parts = str.split('.');
  const whole = parseInt(parts[0], 10) || 0;
  const ball = parseInt(parts[1], 10) || 0;
  return whole * 6 + ball;
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
  if ((Number(ld.inningsId) || 0) >= 2) return true;
  if (Number(ld.chaseRuns) > 0 || Number(ld.chaseWickets) > 0) return true;
  if (Number(ld.score2) > 0 || Number(ld.wickets2) > 0) return true;
  if (parseRuns(match?.team1?.runs ?? match?.score1) > 0 && parseRuns(match?.team2?.runs ?? match?.score2) > 0) {
    return true;
  }
  if (ld.chaseOvers && ld.chaseOvers !== '0' && ld.chaseOvers !== '0.0') return true;
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
  let chaseRuns = parseRuns(ld.chaseRuns ?? ld.score2);
  let chaseWickets = parseWickets(ld.chaseWickets ?? ld.wickets2, 0);
  let chaseBalls = parseBalls(ld.chaseOvers || ld.overs2 || (Number(ld.inningsId) >= 2 ? ld.overs : '0'));

  if (firstRuns <= 0 && team1Runs > 0 && team2Runs > 0) {
    const chaseName = String(ld.chaseTeamName || '');
    const firstName = String(ld.firstTeamName || '');
    const t1 = String(match.team1?.name || match.team1 || '');
    const t2 = String(match.team2?.name || match.team2 || '');
    const chaseIsTeam1 = chaseName && t1 && t1.toLowerCase().includes(chaseName.toLowerCase().slice(0, 6));
    const firstIsTeam2 = firstName && t2 && t2.toLowerCase().includes(firstName.toLowerCase().slice(0, 6));
    if (chaseIsTeam1 || firstIsTeam2) {
      firstRuns = team2Runs;
      firstWickets = team2Wkts;
      chaseRuns = team1Runs;
      chaseWickets = team1Wkts;
    } else {
      firstRuns = team1Runs;
      firstWickets = team1Wkts;
      chaseRuns = team2Runs;
      chaseWickets = team2Wkts;
    }
  } else if (firstRuns <= 0) {
    firstRuns = team1Runs;
    firstWickets = team1Wkts || firstWickets;
  }

  if (chaseRuns <= 0) {
    chaseRuns = parseRuns(ld.chaseRuns) || team2Runs;
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

  const withoutToss = text.replace(/won the toss/g, ' ');
  if (
    /\b(won by|have won|won with|won the match)\b/.test(text)
    || /\b(beat|defeated)\b/.test(text)
    || /match over|match completed|completed match|target reached/.test(text)
    || /\bwon\b/.test(withoutToss)
  ) {
    return true;
  }
  if (/need\s+0\s+(?:more\s+)?runs/.test(text)) return true;

  const ld = match.liveDetails || {};
  if (ld.runsRequired != null && Number(ld.runsRequired) <= 0 && isSecondInningsStarted(match, ld)) {
    return true;
  }

  if (!isSecondInningsStarted(match, ld)) return false;

  const { firstRuns, chaseRuns, chaseWickets, chaseBalls } = firstAndChaseScores(match);
  const test = isTestMatch(match) || (ld.testInnings?.length > 2);
  if (test && Number(ld.inningsId) !== 4 && !/need\s+0/.test(text)) {
    return false;
  }

  if (firstRuns > 0 && chaseRuns >= firstRuns + 1) return true;
  if (chaseWickets >= 10) return true;

  const maxBalls = getMatchMaxBalls(match);
  if (maxBalls && chaseBalls >= maxBalls && firstRuns > 0) return true;

  return false;
}
