/** Fingerprint of the live innings used to bust odds cache when score or balls move. */
export function matchOddsStateKey(match) {
  if (!match) return '';
  const ld = match.liveDetails || {};
  const t1 = typeof match.team1 === 'object' ? match.team1 : {};
  const t2 = typeof match.team2 === 'object' ? match.team2 : {};
  return [
    ld.inningsId ?? '',
    ld.firstRuns ?? ld.runs ?? t1.runs ?? '',
    ld.firstWickets ?? ld.wickets ?? t1.wickets ?? '',
    ld.firstOvers ?? ld.overs ?? '',
    ld.chaseRuns ?? ld.score2 ?? t2.runs ?? '',
    ld.chaseWickets ?? ld.wickets2 ?? t2.wickets ?? '',
    ld.chaseOvers ?? ld.overs2 ?? '',
    ld.batter1?.runs ?? '',
    ld.batter1?.balls ?? '',
    ld.batter2?.runs ?? '',
    ld.batter2?.balls ?? '',
  ].join(':');
}

const OVERLAY_KEYS = [
  'inningsId',
  'runs',
  'wickets',
  'overs',
  'score2',
  'wickets2',
  'overs2',
  'firstRuns',
  'firstWickets',
  'firstOvers',
  'chaseRuns',
  'chaseWickets',
  'chaseOvers',
];

export function liveOddsOverlayFromMatch(match) {
  const ld = match?.liveDetails || {};
  const overlay = {};
  for (const key of OVERLAY_KEYS) {
    if (ld[key] != null && ld[key] !== '') overlay[key] = ld[key];
  }
  return overlay;
}

export function applyLiveOddsOverlay(matchObj, overlay = {}) {
  if (!matchObj || !overlay || typeof overlay !== 'object') return matchObj;
  const ld = { ...(matchObj.liveDetails || {}) };
  let changed = false;
  for (const key of OVERLAY_KEYS) {
    if (overlay[key] == null || overlay[key] === '') continue;
    if (ld[key] === overlay[key]) continue;
    ld[key] = overlay[key];
    changed = true;
  }
  if (!changed) return matchObj;
  return { ...matchObj, liveDetails: ld };
}

export function parseLiveOddsOverlayFromQuery(query = {}) {
  const overlay = {};
  for (const key of OVERLAY_KEYS) {
    const value = query[key];
    if (value == null || value === '') continue;
    overlay[key] = value;
  }
  return overlay;
}
