/**
 * Public match id helpers — never expose feed provider names to users.
 * Legacy `10cric_*` ids still resolve for open bets / cached clients.
 */

export const PUBLIC_MATCH_PREFIX = 'oy_';
const LEGACY_TENCRIC_PREFIX = '10cric_';

export function toPublicMatchId(eventId) {
  const raw = String(eventId || '').trim();
  if (!raw) return '';
  if (raw.startsWith(PUBLIC_MATCH_PREFIX) || raw.startsWith(LEGACY_TENCRIC_PREFIX)) return raw.startsWith(LEGACY_TENCRIC_PREFIX)
    ? `${PUBLIC_MATCH_PREFIX}${raw.slice(LEGACY_TENCRIC_PREFIX.length)}`
    : raw;
  return `${PUBLIC_MATCH_PREFIX}${raw}`;
}

/** Bare UUID / event id without any provider prefix. */
export function stripMatchIdPrefix(matchId = '') {
  return String(matchId || '')
    .replace(/^oy_/i, '')
    .replace(/^10cric_/i, '')
    .replace(/^cb_/i, '')
    .replace(/^crex_/i, '')
    .replace(/^fancode_/i, '')
    .replace(/^fc_/i, '')
    .replace(/^espn_/i, '')
    .replace(/^api_/i, '')
    .replace(/^srl_/i, '')
    .trim();
}

/** All ids that may refer to the same fixture (new + legacy). */
export function matchIdAliases(matchId = '') {
  const raw = String(matchId || '').trim();
  if (!raw) return [];
  const bare = stripMatchIdPrefix(raw);
  const set = new Set([raw]);
  if (bare) {
    set.add(bare);
    set.add(`${PUBLIC_MATCH_PREFIX}${bare}`);
    set.add(`${LEGACY_TENCRIC_PREFIX}${bare}`);
    set.add(`cb_${bare}`);
    set.add(`fc_${bare}`);
    set.add(`fancode_${bare}`);
    set.add(`crex_${bare}`);
    set.add(`espn_${bare}`);
    set.add(`api_${bare}`);
  }
  return [...set];
}

export function matchIdsEqual(a, b) {
  if (!a || !b) return false;
  if (String(a) === String(b)) return true;
  const ba = stripMatchIdPrefix(a);
  const bb = stripMatchIdPrefix(b);
  return ba && bb && ba === bb;
}

/** Remove provider brand tokens from any user-visible string. */
export function scrubProviderBranding(text = '') {
  return String(text || '')
    .replace(/\b10cric[_-]?\w*/gi, '')
    .replace(/\b10\s*cric\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
