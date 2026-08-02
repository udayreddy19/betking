const COMPLETED_TIME_HINTS = ['completed', 'full time', 'match over', 'result', 'won by', 'finished'];
const UPCOMING_TIME_HINTS = ['scheduled', 'tomorrow', 'kickoff tonight', 'upcoming', 'preview'];
const PRE_MATCH_HOLD_HINTS = ['toss delayed', 'delayed due', 'rain delay', 'wet outfield', 'not started', 'match starts', 'start delayed', 'no play'];

export function getMatchState(match) {
  const time = String(match?.time || '').toLowerCase();
  const minute = String(match?.liveDetails?.minute || '').toLowerCase();
  const commentary = String(match?.liveDetails?.commentary || '').toLowerCase();
  const combined = `${time} ${minute} ${commentary}`;

  if (time === 'ft' || combined.includes('full time') || combined.includes('final')) return 'post';
  if (COMPLETED_TIME_HINTS.some((h) => combined.includes(h))) return 'post';

  const explicit = match?.matchState;
  if (explicit === 'post') return 'post';
  if (explicit === 'pre') return 'pre';

  if (UPCOMING_TIME_HINTS.some((h) => combined.includes(h))) return 'pre';
  if (PRE_MATCH_HOLD_HINTS.some((h) => combined.includes(h))) return 'pre';
  if ((/today \d{1,2}:\d{2}/.test(time) || /\d{1,2} \w{3} - \d{1,2}:\d{2}/.test(time) || /\d{1,2} \w{3},? ?\d{1,2}:\d{2}/.test(time)) && !time.includes('live')) return 'pre';

  if (explicit === 'in') return 'in';
  if (match?.isLive) return 'in';
  return 'pre';
}

export function normalizeMatchLiveFlags(match) {
  const state = getMatchState(match);
  return {
    ...match,
    matchState: state,
    isLive: state === 'in',
  };
}
