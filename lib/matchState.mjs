const COMPLETED_TIME_HINTS = ['completed', 'full time', 'match over', 'result', 'won by', 'finished'];
const UPCOMING_TIME_HINTS = ['scheduled', 'tomorrow', 'kickoff tonight', 'upcoming'];

export function getMatchState(match) {
  const explicit = match?.matchState;
  if (explicit === 'post' || explicit === 'pre') return explicit;

  const time = String(match?.time || '').toLowerCase();
  const minute = String(match?.liveDetails?.minute || '').toLowerCase();
  const combined = `${time} ${minute}`;

  if (time === 'ft' || combined.includes('full time') || combined.includes('final')) return 'post';
  if (COMPLETED_TIME_HINTS.some((h) => combined.includes(h))) return 'post';
  if (UPCOMING_TIME_HINTS.some((h) => combined.includes(h))) return 'pre';
  if (/today \d{1,2}:\d{2}/.test(time) && !time.includes('live')) return 'pre';

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
