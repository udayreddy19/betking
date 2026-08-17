/** Clean scraping artifacts like "B total Sachin", "RS total Ambris", "Total X", etc. */
export function cleanPlayerName(rawName) {
  if (!rawName || typeof rawName !== 'string') return '';
  let name = rawName.trim();
  // Strip scraping prefixes like "B total ", "RS total ", "Total ", "BAT ", "BOWL "
  name = name.replace(/^(b\s+total|rs\s+total|total|bat\s+|bowl\s+)\s*/i, '');
  // Strip score suffixes attached to name if any like " Sachin 53 (24)"
  name = name.replace(/\s+\d+\s*\(\d+\)$/, '');
  name = name.replace(/\[object\s+object\]/gi, '');
  return name.trim();
}

/** True for empty, dash, or generic role placeholders like "Captain", "Opener", "Pacer", "Batter 1". */
export function isPlaceholderPlayerName(name) {
  if (!name || typeof name !== 'string') return true;
  const cleaned = cleanPlayerName(name);
  if (!cleaned || cleaned === '—' || cleaned === '-') return true;
  const lower = cleaned.toLowerCase();
  return (
    lower === 'player' ||
    lower === 'batsman' ||
    lower === 'batter' ||
    lower === 'bowler' ||
    lower === 'null' ||
    lower === 'undefined' ||
    lower === 'object object' ||
    lower === 'j. smith' ||
    lower === 'a. patel' ||
    lower === 'p. cummins' ||
    /^(batter|bowler|opener|pacer|spinner|captain|player|team)\s*(\d+|[a-z])?$/i.test(lower) ||
    /team\s*\d/i.test(lower) ||
    /batter\s*\d/i.test(lower) ||
    /bowler\s*\d/i.test(lower) ||
    /\s+(opener|batter|bowler|pacer|spinner)s?$/i.test(lower)
  );
}

const COMMENTARY_NAME_SKIP = /^(Follow|Need|Require|Target|Overs?|Innings?|Total|Extras?|Partnership|Runs?|Balls?|Wickets?)$/i;

function commentaryNameIsTeam(name, skipNames = []) {
  const n = String(name).toLowerCase().trim();
  if (!n) return true;
  return skipNames.some((raw) => {
    const team = String(raw || '').toLowerCase().trim();
    if (!team) return false;
    return n === team || team.includes(n) || n.includes(team);
  });
}

export function parseLivePlayersFromCommentary(text, skipNames = []) {
  if (!text) return {};
  const found = [];
  const re = /([A-Z][a-zA-Z'.-]+(?:\s+[A-Z][a-zA-Z'.-]+){0,2})\s+(\d+)\s*\(\s*(\d+)\s*\)/g;
  let m;
  while ((m = re.exec(String(text))) !== null) {
    const name = cleanPlayerName(m[1]);
    if (!name) continue;
    if (COMMENTARY_NAME_SKIP.test(name) || commentaryNameIsTeam(name, skipNames)) continue;
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
  const c1 = cleanPlayerName(name);
  if (c1 && !isPlaceholderPlayerName(c1)) return c1;
  const c2 = cleanPlayerName(fallback);
  if (c2 && !isPlaceholderPlayerName(c2)) return c2;
  return null;
}
