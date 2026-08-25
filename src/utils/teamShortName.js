/** Build a compact team code without picking up "(Men)" / "(Women)" punctuation. */

const INVALID_SHORT = /[()]/;

/** ICC / common cricket codes — single-word names otherwise become "INDI". */
const KNOWN_TEAM_CODES = {
  india: 'IND',
  australia: 'AUS',
  england: 'ENG',
  pakistan: 'PAK',
  bangladesh: 'BAN',
  afghanistan: 'AFG',
  ireland: 'IRE',
  zimbabwe: 'ZIM',
  netherlands: 'NED',
  scotland: 'SCO',
  namibia: 'NAM',
  nepal: 'NEP',
  oman: 'OMA',
  kenya: 'KEN',
  uganda: 'UGA',
  canada: 'CAN',
  bermuda: 'BER',
  'sri lanka': 'SL',
  srilanka: 'SL',
  'south africa': 'SA',
  'new zealand': 'NZ',
  'west indies': 'WI',
  'united arab emirates': 'UAE',
  uae: 'UAE',
  'united states': 'USA',
  usa: 'USA',
};

function stripGenderAndParens(name = '') {
  return String(name)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(women'?s?|men'?s?|wmn|w)\b/gi, ' ')
    .replace(/[^A-Za-z0-9.\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isUsableShortName(value) {
  const s = String(value || '').trim();
  if (!s || INVALID_SHORT.test(s) || s === 'TBD') return false;
  if (!/[A-Za-z]/.test(s)) return false;
  return s.length <= 8;
}

export function asDisplayText(value, fallback = '') {
  if (value == null || value === '') return fallback;
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const joined = value.map((item) => asDisplayText(item, '')).filter(Boolean).join(' ');
    return joined || fallback;
  }
  if (t === 'object') {
    for (const key of ['name', 'title', 'label', 'text', 'displayName']) {
      if (typeof value[key] === 'string' && value[key].trim()) return value[key].trim();
    }
  }
  return fallback;
}

export function teamDisplayName(team, fallback = 'TBD') {
  if (team == null || team === '') return fallback;
  if (typeof team === 'string' || typeof team === 'number') return String(team);
  const name = asDisplayText(team.name || team.shortName || team.displayName, '');
  if (name) return name;
  return fallback;
}

export function formatTeamShortName(name = '', existingShort = '', fallback = 'TBD') {
  const cleaned = stripGenderAndParens(name);
  const known = cleaned ? KNOWN_TEAM_CODES[cleaned.toLowerCase()] : null;
  if (known) return known;

  const existing = String(existingShort || '').trim();
  const existingLooksTruncated = cleaned
    && existing.length >= 4
    && cleaned.replace(/\s+/g, '').toUpperCase().startsWith(existing.toUpperCase());
  if (isUsableShortName(existing) && existing.length <= 3 && !existingLooksTruncated) {
    return existing;
  }

  if (!cleaned) {
    const raw = existing.replace(/[()]/g, '').trim();
    return raw.slice(0, 3).toUpperCase() || fallback;
  }

  const words = cleaned.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w));
  if (!words.length) return fallback;
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();

  const initials = words
    .map((w) => (w.length <= 3 && w === w.toUpperCase() ? w : w[0]))
    .join('')
    .toUpperCase();
  if (initials.length >= 2) return initials.slice(0, 5);
  return words[0].slice(0, 4).toUpperCase();
}
