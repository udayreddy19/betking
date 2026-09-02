/**
 * Canonical sport keys for the non-cricket odds book and gateway.
 * Maps provider aliases (football → soccer) so pricing and settlement agree.
 */

const DRAW_SPORTS = new Set(['soccer', 'esoccer', 'hockey', 'rugby']);

export function isCricketSport(sport) {
  const s = String(sport || '').toLowerCase();
  return !s || s.includes('cricket');
}

export function normalizeSportKey(sport) {
  const raw = String(sport || '')
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/\s+/g, '-');

  if (raw === 'football' || raw === 'soccer' || raw === 'association-football') {
    return 'soccer';
  }
  if (raw === 'e-soccer' || raw === 'esports-soccer' || raw === 'esoccer') {
    return 'esoccer';
  }
  if (raw === 'tabletennis' || raw === 'tt' || raw === 'table-tennis') {
    return 'table-tennis';
  }
  if (raw === 'nfl' || raw === 'cfb' || raw === 'ncaaf' || raw === 'americanfootball') {
    return 'american-football';
  }
  return raw;
}

export function sportAllowsDraw(sport) {
  return DRAW_SPORTS.has(normalizeSportKey(sport));
}

export function isSoccerSport(sport) {
  const key = normalizeSportKey(sport);
  return key === 'soccer' || key === 'esoccer';
}

export { DRAW_SPORTS };
