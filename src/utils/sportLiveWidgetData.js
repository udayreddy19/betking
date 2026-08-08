export function getSportStatusBadge(match) {
  const sport = match?.sport;
  const ld = match?.liveDetails || {};
  const state = match?.matchState;

  if (state === 'post') return 'MATCH COMPLETE';
  if (state === 'pre') return 'UPCOMING';

  switch (sport) {
    case 'soccer':
    case 'esoccer':
      return ld.minute || match?.time || 'LIVE';
    case 'basketball':
    case 'american-football':
      return ld.quarter || match?.time || 'LIVE';
    case 'tennis':
      return ld.currentSet || match?.time || 'LIVE';
    default:
      return match?.time || 'LIVE';
  }
}

export function getSportScores(match) {
  const ld = match?.liveDetails || {};
  const sport = match?.sport;

  if (sport === 'cricket' || sport === 'virtual-cricket') {
    return {
      score1: ld.runs ?? 0,
      score2: ld.score2 ?? 0,
      suffix1: `/${ld.wickets ?? 0}`,
      suffix2: `/${ld.wickets2 ?? 0}`,
    };
  }

  return {
    score1: ld.score1 ?? match?.score1 ?? match?.team1Score ?? 0,
    score2: ld.score2 ?? match?.score2 ?? match?.team2Score ?? 0,
    suffix1: '',
    suffix2: '',
  };
}

export function getPeriodRows(match) {
  const ld = match?.liveDetails || {};
  const sport = match?.sport;

  if (sport === 'basketball' || sport === 'american-football') {
    const q1 = ld.quarters1 || [];
    const q2 = ld.quarters2 || [];
    const labels = ['Q1', 'Q2', 'Q3', 'Q4', 'OT', 'OT2'];
    const max = Math.max(q1.length, q2.length);
    return Array.from({ length: max }, (_, i) => ({
      label: labels[i] || `P${i + 1}`,
      score1: q1[i] ?? '–',
      score2: q2[i] ?? '–',
    }));
  }

  if (sport === 'tennis') {
    const s1 = ld.sets1 || [];
    const s2 = ld.sets2 || [];
    const max = Math.max(s1.length, s2.length, 1);
    return Array.from({ length: max }, (_, i) => ({
      label: `Set ${i + 1}`,
      score1: s1[i] ?? '–',
      score2: s2[i] ?? '–',
    }));
  }

  return [];
}

export function getSportLeagueLabel(match) {
  return match?.league || match?.sport?.replace(/-/g, ' ') || 'Live';
}
