import { oversToBallsForMatch } from './cricketFormat.js';
import { isCricketMatchCompleted } from './cricketMatchComplete.js';

const COMPLETED_TIME_HINTS = [
  'completed',
  'full time',
  'match over',
  'result',
  'won by',
  'finished',
];

const UPCOMING_TIME_HINTS = [
  'scheduled',
  'tomorrow',
  'kickoff tonight',
  'upcoming',
  'tip-off',
  'centre court',
  'season opener',
  'semi-final',
  'quarter-final',
  'preview',
];

const PRE_MATCH_HOLD_HINTS = [
  'toss delayed',
  'delayed due',
  'rain delay',
  'wet outfield',
  'not started',
  'match starts',
  'match starts at',
  'start delayed',
  'no play',
  'play suspended',
  'interrupted',
];

function parseOversBallCount(overs, match) {
  if (match) return oversToBallsForMatch(overs, match);
  const str = String(overs ?? '0');
  const parts = str.split('.');
  const whole = parseInt(parts[0], 10) || 0;
  const ball = parseInt(parts[1], 10) || 0;
  return whole * 6 + ball;
}

function getStatusText(match) {
  const time = String(match?.time || '');
  const commentary = String(match?.liveDetails?.commentary || '');
  return `${time} ${commentary}`.toLowerCase();
}

/** Toss delayed, rain, scheduled kickoff — not in-play yet. */
export function isPreMatchHold(match) {
  if (!match) return false;
  const combined = getStatusText(match);

  if (PRE_MATCH_HOLD_HINTS.some((hint) => combined.includes(hint))) return true;
  if (UPCOMING_TIME_HINTS.some((hint) => combined.includes(hint))) return true;

  const time = String(match?.time || '').toLowerCase();
  if ((/today \d{1,2}:\d{2}/.test(time) || /\d{1,2} \w{3} - \d{1,2}:\d{2}/.test(time) || /\d{1,2} \w{3},? ?\d{1,2}:\d{2}/.test(time)) && !time.includes('live')) {
    return true;
  }

  return false;
}

/** True when at least one ball has been bowled or a wicket/run exists. */
export function hasCricketPlayStarted(match) {
  if (!match) return false;

  const ld = match.liveDetails || {};
  const runs = ld.runs ?? ld.firstRuns ?? match.team1?.runs ?? match.score1;
  const wickets = ld.wickets ?? ld.firstWickets ?? match.team1?.wickets;
  const score2 = ld.score2 ?? ld.chaseRuns ?? match.team2?.runs ?? match.score2;
  const wickets2 = ld.wickets2 ?? ld.chaseWickets ?? match.team2?.wickets;

  if (runs > 0 || wickets > 0 || score2 > 0 || wickets2 > 0) return true;

  const overs = parseOversBallCount(ld.overs || ld.firstOvers || match.team1?.overs, match);
  const overs2 = parseOversBallCount(ld.overs2 || ld.chaseOvers || match.team2?.overs, match);
  if (overs > 0 || overs2 > 0) return true;

  if (isPreMatchHold(match)) return false;
  return false;
}

/** Cricket tracker / scorecard after play starts — including the final innings of a completed match. */
export function isCricketTrackerLive(match) {
  if (!match) return false;
  if (hasCricketPlayStarted(match)) return true;
  const state = getMatchState(match);
  if (state === 'pre') return false;
  if (state === 'in') return true;
  return false;
}

export function getMatchState(match) {
  if (!match) return 'pre';
  const statusStr = String(match.status || '').toLowerCase();
  const liveStatusStr = String(match.liveStatus || '').toLowerCase();
  if (statusStr === 'finished' || statusStr === 'completed' || liveStatusStr === 'completed' || liveStatusStr === 'finished' || statusStr === 'post' || match.matchState === 'post') {
    return 'post';
  }

  const explicit = match?.matchState;
  const time = String(match?.time || '').toLowerCase();
  const minute = String(match?.liveDetails?.minute || '').toLowerCase();
  const commentary = String(match?.liveDetails?.commentary || '').toLowerCase();
  const combined = `${time} ${minute} ${commentary} ${statusStr} ${liveStatusStr}`;

  if (/innings\s*break/i.test(combined) || /innings\s*break/i.test(String(explicit || ''))) {
    return 'in';
  }

  if (isCricketMatchCompleted(match)) {
    return 'post';
  }

  if (time === 'ft' || combined.includes('full time') || combined.includes('final')) {
    return 'post';
  }

  if (COMPLETED_TIME_HINTS.some((hint) => combined.includes(hint))) {
    return 'post';
  }

  if (match.isLive === true || explicit === 'in' || statusStr === 'live' || liveStatusStr === 'in_progress' || time === 'live') {
    return 'in';
  }

  const ld = match.liveDetails || {};
  if (ld.runs > 0 || ld.wickets > 0 || ld.score1 > 0 || ld.score2 > 0 || (ld.overs && ld.overs !== '0.0')) {
    return 'in';
  }

  if (explicit === 'post') return 'post';
  if (explicit === 'pre' && !match.isLive) return 'pre';

  if (UPCOMING_TIME_HINTS.some((hint) => combined.includes(hint))) {
    return 'pre';
  }

  if (PRE_MATCH_HOLD_HINTS.some((hint) => combined.includes(hint))) {
    return 'pre';
  }

  // "Today 20:00", "02 Aug - 19:30", or "02 Aug, 08:00 am" — not live yet
  if ((/today \d{1,2}:\d{2}/.test(time) || /\d{1,2} \w{3} - \d{1,2}:\d{2}/.test(time) || /\d{1,2} \w{3},? ?\d{1,2}:\d{2}/.test(time)) && !time.includes('live')) {
    return 'pre';
  }

  return 'pre';
}

export function isApiBackedMatch(match) {
  if (!match) return false;
  if (match.id) return true;
  return !!(
    match.cricbuzzMatchId
    || match.espnEventId
    || match.fancodeMatchId
    || match.source
    || match.scoreSource
  );
}

export function isMockMatch(match) {
  if (!match) return false;
  if (match.isMock === true) return true;
  const id = String(match.id || '');
  return /^m\d+$/.test(id) || id.startsWith('mock_');
}

/** True only for real in-play matches — excludes mocks and finished games. */
export function isTrulyLiveMatch(match) {
  return isDisplayableLiveMatch(match);
}

/** Live matches shown in Live Betting — API-backed in-play or verified live. */
export function isDisplayableLiveMatch(match) {
  if (!match) return false;
  const state = getMatchState(match);
  if (state === 'post' || isCricketMatchCompleted(match)) return false;
  if (state === 'in') return true;
  return false;
}

export function isMatchLive(match) {
  return isTrulyLiveMatch(match);
}

export function isMatchFinished(match) {
  return getMatchState(match) === 'post' || isCricketMatchCompleted(match);
}

/** Whether odds can be selected for this match (live + upcoming). */
export function isMatchBettable(match) {
  if (!match || isCricketMatchCompleted(match)) return false;
  const state = getMatchState(match);
  return state === 'in' || state === 'pre';
}
