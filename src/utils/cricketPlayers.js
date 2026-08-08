import { getRosterForTeam } from '../data/cricketRosters.js';

/** True for empty, dash, or generic role placeholders like "Captain", "Opener", "Pacer", "Batter 1". */
export function isPlaceholderPlayerName(name) {
  if (!name || typeof name !== 'string') return true;
  const trimmed = name.trim();
  if (!trimmed || trimmed === '—' || trimmed === '-') return true;
  const lower = trimmed.toLowerCase();
  return (
    /batter\s*\d*$/i.test(lower) ||
    /bowler\s*\d*$/i.test(lower) ||
    /opener\s*\d*$/i.test(lower) ||
    /keeper\s*\d*$/i.test(lower) ||
    /all-rounder\s*\d*$/i.test(lower) ||
    /pacer\s*\d*$/i.test(lower) ||
    /spinner\s*\d*$/i.test(lower) ||
    /captain/i.test(lower) ||
    /middle\s*order/i.test(lower) ||
    /striker/i.test(lower) ||
    /non-striker/i.test(lower) ||
    lower.includes('opener') ||
    lower.includes('pacer') ||
    lower.includes('captain') ||
    lower === 'player' ||
    lower === 'batsman' ||
    lower === 'bowler'
  );
}

export function displayPlayerName(name, fallback = '', teamName = '') {
  if (!isPlaceholderPlayerName(name)) return name.trim();
  if (!isPlaceholderPlayerName(fallback)) return fallback.trim();
  
  if (teamName) {
    const roster = getRosterForTeam(teamName);
    if (roster?.batters?.length) return roster.batters[0];
    return `${teamName} Player`;
  }
  
  return 'Player';
}
