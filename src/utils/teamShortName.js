/** Build a compact team code without picking up "(Men)" / "(Women)" punctuation. */

const INVALID_SHORT = /[()]/;

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

export function formatTeamShortName(name = '', existingShort = '', fallback = 'TBD') {
  if (isUsableShortName(existingShort)) return String(existingShort).trim();

  const cleaned = stripGenderAndParens(name);
  if (!cleaned) {
    const raw = String(existingShort || '').replace(/[()]/g, '').trim();
    return raw.slice(0, 4).toUpperCase() || fallback;
  }

  const words = cleaned.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w));
  if (!words.length) return fallback;
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();

  const initials = words
    .map((w) => (w.length <= 3 && w === w.toUpperCase() ? w : w[0]))
    .join('')
    .toUpperCase();
  if (initials.length >= 2) return initials.slice(0, 5);
  return words[0].slice(0, 4).toUpperCase();
}
