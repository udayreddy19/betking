function num(value, fallback = 0) {
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

export function parseMinute(liveDetails = {}) {
  const raw = liveDetails.minute ?? liveDetails.clock ?? liveDetails.commentary ?? '';
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? Math.max(0, Math.min(120, n)) : 0;
}

function asSetList(value) {
  if (Array.isArray(value) && value.length > 0) {
    return value.map((v) => num(v?.value ?? v, NaN)).filter((n) => Number.isFinite(n));
  }
  const n = num(value, NaN);
  return Number.isFinite(n) ? [n] : [];
}

export function hasSetScores(liveDetails = {}) {
  const a = asSetList(liveDetails.sets1);
  const b = asSetList(liveDetails.sets2);
  return a.length > 0 && b.length > 0;
}

export function countSetWins(sets1, sets2) {
  const a = asSetList(sets1);
  const b = asSetList(sets2);
  const n = Math.min(a.length, b.length);
  let setWins1 = 0;
  let setWins2 = 0;
  for (let i = 0; i < n; i += 1) {
    if (a[i] === b[i]) continue;
    if (a[i] > b[i]) setWins1 += 1;
    else setWins2 += 1;
  }
  return { setWins1, setWins2 };
}

export function totalSetUnits(liveDetails = {}) {
  const a = asSetList(liveDetails.sets1);
  const b = asSetList(liveDetails.sets2);
  if (!a.length || !b.length) return null;
  const sum = (arr) => arr.reduce((acc, v) => acc + v, 0);
  return sum(a) + sum(b);
}

export function isFinishedMatch(match) {
  const status = String(match?.matchState || match?.status || '').toUpperCase();
  if (['POST', 'COMPLETED', 'FINISHED', 'DETERMINED', 'SETTLED'].includes(status)) {
    return true;
  }
  const time = String(match?.time || '').toLowerCase();
  return time === 'ft' || time.includes('full time') || time.includes('completed');
}

export function isLiveMatch(match) {
  if (isFinishedMatch(match)) return false;
  if (match?.isLive === true) return true;
  const status = String(match?.matchState || match?.status || '').toUpperCase();
  return status === 'IN' || status === 'LIVE';
}

export function readLiveScoreState(match = {}) {
  const liveDetails = match.liveDetails || {};
  const score1 = num(
    liveDetails.score1 ?? match.score1 ?? match.team1?.runs ?? match.team1?.score,
    0,
  );
  const score2 = num(
    liveDetails.score2 ?? match.score2 ?? match.team2?.runs ?? match.team2?.score,
    0,
  );
  const sets1 = asSetList(liveDetails.sets1);
  const sets2 = asSetList(liveDetails.sets2);
  const { setWins1, setWins2 } = countSetWins(sets1, sets2);
  return {
    score1,
    score2,
    liveDetails,
    minute: parseMinute(liveDetails),
    live: isLiveMatch(match),
    finished: isFinishedMatch(match),
    sets1,
    sets2,
    hasSetScores: sets1.length > 0 && sets2.length > 0,
    setWins1,
    setWins2,
    totalSetUnits: totalSetUnits(liveDetails),
  };
}
