export function normalizeTeamName(name = '') {
  return String(name)
    .toLowerCase()
    .replace(/\(men\)|\(women\)/gi, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getMatchPairKey(match) {
  const team1 = normalizeTeamName(match?.team1?.name);
  const team2 = normalizeTeamName(match?.team2?.name);
  return [team1, team2].sort().join('|');
}

export function isSameMatchPair(matchA, matchB) {
  if (!matchA || !matchB) return false;
  return getMatchPairKey(matchA) === getMatchPairKey(matchB);
}
