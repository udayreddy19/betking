/** Whether odds can be selected for this match (demo: live + upcoming). */
export function isMatchBettable(match) {
  const state = match?.matchState || (match?.isLive ? 'in' : 'pre');
  return state === 'in' || state === 'pre';
}

export function getMatchState(match) {
  return match?.matchState || (match?.isLive ? 'in' : 'pre');
}

export function isMatchLive(match) {
  return getMatchState(match) === 'in';
}

export function isMatchFinished(match) {
  return getMatchState(match) === 'post';
}
