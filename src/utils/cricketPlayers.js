/** True for empty, dash, or roster placeholder names like "batter1" / "Batter 1". */
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
    /spinner\s*\d*$/i.test(lower)
  );
}

export function displayPlayerName(name, fallback = 'Player') {
  if (!isPlaceholderPlayerName(name)) return name.trim();
  if (!isPlaceholderPlayerName(fallback)) return fallback.trim();
  if (typeof name === 'string' && name.trim() && name.trim() !== '—' && name.trim() !== '-') {
    return name.trim();
  }
  if (typeof fallback === 'string' && fallback.trim() && fallback.trim() !== '—' && fallback.trim() !== '-') {
    return fallback.trim();
  }
  return 'Player';
}
