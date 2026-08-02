/** True for empty, dash, or roster placeholder names like "batter1" / "Batter 1". */
export function isPlaceholderPlayerName(name) {
  if (!name || typeof name !== 'string') return true;
  const trimmed = name.trim();
  if (!trimmed || trimmed === '—' || trimmed === '-') return true;
  const lower = trimmed.toLowerCase();
  return /^batter\s*\d*$/i.test(lower) || /^bowler\s*\d*$/i.test(lower);
}

export function displayPlayerName(name, fallback = '—') {
  return isPlaceholderPlayerName(name) ? fallback : name.trim();
}
