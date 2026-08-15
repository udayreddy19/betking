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

export function parseLivePlayersFromCommentary(text) {
  if (!text) return {};
  const found = [];
  const re = /([A-Z][a-zA-Z'.-]+(?:\s+[A-Z][a-zA-Z'.-]+){0,2})\s+(\d+)\s*\(\s*(\d+)\s*\)/g;
  let m;
  while ((m = re.exec(String(text))) !== null) {
    const name = m[1].trim();
    if (name.split(/\s+/).length < 2) continue;
    if (/^(Follow|Need|Require|Target|Overs?)$/i.test(name)) continue;
    found.push({
      name,
      runs: Number(m[2]),
      balls: Number(m[3]),
      fours: 0,
      sixes: 0,
    });
  }
  const out = {};
  if (found[0]) out.batter1 = found[0];
  if (found[1]) out.batter2 = found[1];
  return out;
}

export function displayPlayerName(name, fallback = '') {
  if (name && !isPlaceholderPlayerName(name)) return name.trim();
  if (fallback && !isPlaceholderPlayerName(fallback)) return fallback.trim();
  return null;
}
