/**
 * Normalize API/DB DOB values to YYYY-MM-DD.
 * Handles ISO dates, Date objects, and broken "Wed Dec 10 1997…" strings from bad String(date).slice(0,10).
 */
export function normalizeDateOfBirth(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  const y = parsed.getUTCFullYear();
  const m = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  const d = String(parsed.getUTCDate()).padStart(2, '0');
  // Reject obviously incomplete parses (e.g. "Wed Dec 10" without year → Invalid or epoch-ish)
  if (y < 1900 || y > 2100) return null;
  return `${y}-${m}-${d}`;
}

export function userHasPhone(user) {
  return Boolean(user) && String(user?.phone || '').replace(/\D/g, '').length >= 10;
}

export function userHasDob(user) {
  return Boolean(normalizeDateOfBirth(user?.dateOfBirth));
}

export function userNeedsCompleteProfile(user) {
  return userHasPhone(user) === false || userHasDob(user) === false;
}

/** Latest calendar day that still implies age >= 18 (inclusive). */
export function maxAdultDateOfBirth(now = new Date()) {
  const d = new Date(now);
  d.setFullYear(d.getFullYear() - 18);
  return d.toISOString().slice(0, 10);
}
