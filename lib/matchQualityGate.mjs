/**
 * Public board quality gate — drop stub / placeholder live cricket rows.
 * Real ODI/T20 with any runs, wickets, or overs always pass.
 */

const PLACEHOLDER_NAMES = new Set([
  'home team',
  'away team',
  'team 1',
  'team 2',
  'tbd',
  'tba',
  'unknown',
  'n/a',
  'na',
  '-',
  '—',
]);

function teamName(match, side) {
  const t = side === 1
    ? (match?.team1?.name || match?.home || match?.team1Name || '')
    : (match?.team2?.name || match?.away || match?.team2Name || '');
  return String(t).trim();
}

function isPlaceholderName(name) {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return true;
  if (PLACEHOLDER_NAMES.has(n)) return true;
  if (/^(home|away|team)\s*\d*$/i.test(n)) return true;
  return false;
}

function isCricketish(match) {
  const sport = String(match?.sport || 'cricket').toLowerCase();
  return !sport || sport.includes('cricket');
}

/**
 * @param {object} match
 * @param {{ hasCricketPlayStarted?: (m: object) => boolean }} helpers
 * @returns {{ pass: boolean, reason?: string }}
 */
export function evaluateMatchQuality(match, helpers = {}) {
  if (!match) return { pass: false, reason: 'empty' };

  const hasPlay = typeof helpers.hasCricketPlayStarted === 'function'
    ? helpers.hasCricketPlayStarted(match)
    : true;

  const n1 = teamName(match, 1);
  const n2 = teamName(match, 2);
  if (isPlaceholderName(n1) || isPlaceholderName(n2)) {
    return { pass: false, reason: 'placeholder_teams' };
  }

  if (isCricketish(match)) {
    const claimedLive = match.isLive === true
      || String(match.matchState || '').toLowerCase() === 'in'
      || String(match.status || '').toLowerCase() === 'live';
    if (claimedLive && !hasPlay) {
      return { pass: false, reason: 'live_without_play' };
    }
  }

  return { pass: true };
}

export function passesMatchQualityGate(match, helpers = {}) {
  return evaluateMatchQuality(match, helpers).pass;
}

/**
 * Keep non-live rows; for live cricket apply quality gate.
 */
export function filterMatchesForPublicBoard(matches = [], helpers = {}) {
  return (matches || []).filter((m) => {
    const state = String(m?.matchState || '').toLowerCase();
    const live = m?.isLive === true || state === 'in';
    if (!live) return true;
    return passesMatchQualityGate(m, helpers);
  });
}
