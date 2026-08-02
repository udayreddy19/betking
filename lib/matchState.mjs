const COMPLETED_TIME_HINTS = ['completed', 'full time', 'match over', 'result', 'won by', 'finished'];
const UPCOMING_TIME_HINTS = ['scheduled', 'tomorrow', 'kickoff tonight', 'upcoming', 'preview'];
const PRE_MATCH_HOLD_HINTS = ['toss delayed', 'delayed due', 'rain delay', 'wet outfield', 'not started', 'match starts', 'match starts at', 'start delayed', 'no play'];

function parseOversBallCount(overs) {
  const str = String(overs ?? '0');
  const parts = str.split('.');
  const whole = parseInt(parts[0], 10) || 0;
  const ball = parseInt(parts[1], 10) || 0;
  return whole * 6 + ball;
}

function hasCricketPlayStarted(match) {
  if (!match) return false;
  const ld = match.liveDetails || {};
  const runs = ld.runs ?? ld.firstRuns;
  const wickets = ld.wickets ?? ld.firstWickets;
  const score2 = ld.score2 ?? ld.chaseRuns;
  const wickets2 = ld.wickets2 ?? ld.chaseWickets;

  if (runs > 0 || wickets > 0 || score2 > 0 || wickets2 > 0) return true;

  const overs = parseOversBallCount(ld.overs || ld.firstOvers);
  const overs2 = parseOversBallCount(ld.overs2 || ld.chaseOvers);
  return overs > 0 || overs2 > 0;
}

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
  if (match?.isLive) {
    if ((match?.sport === 'cricket' || match?.sport === 'virtual-cricket') && !hasCricketPlayStarted(match)) {
      return 'pre';
    }
    return 'in';
  }
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
