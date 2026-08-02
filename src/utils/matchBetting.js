/** Whether odds can be selected for this match (live + upcoming). */
export function isMatchBettable(match) {
  return getMatchState(match) === 'in' || getMatchState(match) === 'pre';
}

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
];

export function getMatchState(match) {
  const explicit = match?.matchState;
  if (explicit === 'post' || explicit === 'pre') return explicit;

  const time = String(match?.time || '').toLowerCase();
  const minute = String(match?.liveDetails?.minute || '').toLowerCase();
  const combined = `${time} ${minute}`;

  if (time === 'ft' || combined.includes('full time') || combined.includes('final')) {
    return 'post';
  }

  if (COMPLETED_TIME_HINTS.some((hint) => combined.includes(hint))) {
    return 'post';
  }

  if (UPCOMING_TIME_HINTS.some((hint) => combined.includes(hint))) {
    return 'pre';
  }

  // "Today 20:00" style kickoff — not live yet
  if (/today \d{1,2}:\d{2}/.test(time) && !time.includes('live')) {
    return 'pre';
  }

  if (explicit === 'in') return 'in';
  if (match?.isLive) return 'in';
  return 'pre';
}

export function isApiBackedMatch(match) {
  if (!match) return false;
  return !!(
    match.cricbuzzMatchId
    || match.espnEventId
    || match.fancodeMatchId
    || match.source === 'espn'
    || match.source === 'cricbuzz'
    || match.source === 'fancode'
    || match.scoreSource === 'api'
    || match.id?.startsWith('api_')
    || match.id?.startsWith('cb_')
  );
}

export function isMockMatch(match) {
  if (!match) return false;
  if (match.isMock === true) return true;
  if (isApiBackedMatch(match)) return false;
  const id = String(match.id || '');
  return /^m\d+$/.test(id) || id.startsWith('mock_');
}

/** True only for real in-play matches — excludes mocks and finished games. */
export function isTrulyLiveMatch(match) {
  if (!match) return false;
  if (getMatchState(match) !== 'in') return false;
  if (!match.isLive) return false;
  if (isMockMatch(match) && !isApiBackedMatch(match)) return false;
  return true;
}

export function isMatchLive(match) {
  return isTrulyLiveMatch(match);
}

export function isMatchFinished(match) {
  return getMatchState(match) === 'post';
}
