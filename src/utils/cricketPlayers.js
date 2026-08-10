import { getRosterForTeam } from '../data/cricketRosters.js';

/** True for empty, dash, or generic role placeholders like "Captain", "Opener", "Pacer", "Batter 1". */
export function isPlaceholderPlayerName(name) {
  if (!name || typeof name !== 'string') return true;
  const trimmed = name.trim();
  if (!trimmed || trimmed === '—' || trimmed === '-') return true;
  const lower = trimmed.toLowerCase();
  return (
    lower === 'player' ||
    lower === 'batsman' ||
    lower === 'bowler' ||
    lower === 'null' ||
    lower === 'undefined' ||
    lower === 'j. smith' ||
    lower === 'a. patel' ||
    lower === 'p. cummins' ||
    /team\s*\d/i.test(lower) ||
    /batter\s*\d/i.test(lower) ||
    /bowler\s*\d/i.test(lower) ||
    /opener\s*\d/i.test(lower) ||
    /pacer\s*\d/i.test(lower) ||
    /spinner\s*\d/i.test(lower)
  );
}

export function displayPlayerName(name, fallback = '', teamName = '') {
  if (name && !isPlaceholderPlayerName(name)) return name.trim();
  if (fallback && !isPlaceholderPlayerName(fallback)) return fallback.trim();

  if (teamName) {
    const roster = getRosterForTeam(teamName);
    if (roster?.batters?.length) return roster.batters[0];
  }

  return null;
}
