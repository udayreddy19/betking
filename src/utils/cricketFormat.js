import { normalizeCricbuzzOvers, oversToBalls } from './oversUtils.js';

const HUNDRED_BALLS_PER_INNINGS = 100;
const HUNDRED_BALLS_PER_OVER = 5;
const HUNDRED_MAX_OVERS = HUNDRED_BALLS_PER_INNINGS / HUNDRED_BALLS_PER_OVER;

export function isHundredMatch(match) {
  const text = collectMatchFormatText(match);
  return /hundred/i.test(text) || /\bhun\b/i.test(text);
}

/** Full text blob used for format / overs detection. */
export function collectMatchFormatText(match) {
  return [
    match?.league,
    match?.seriesName,
    match?.competition,
    match?.name,
    match?.eventName,
    match?.matchType,
    match?.matchFormat,
    match?.format,
    match?.sport,
    match?.time,
    match?.id,
    match?.matchHeader?.seriesName,
    match?.matchHeader?.matchFormat,
    match?.matchHeader?.matchDescription,
    match?.team1?.name,
    match?.team2?.name,
    match?.liveDetails?.matchFormat,
    match?.liveDetails?.commentary,
    match?.liveDetails?.period,
  ].filter(Boolean).join(' ');
}

export function getMatchFormatHint(match) {
  return collectMatchFormatText(match);
}

function oversWhole(value) {
  return parseInt(String(value ?? '0').split('.')[0], 10) || 0;
}

function oversIsExactly(value, whole) {
  const str = String(value ?? '').trim();
  if (!str) return false;
  const parts = str.split('.');
  const w = parseInt(parts[0], 10) || 0;
  const b = parseInt(parts[1], 10) || 0;
  return w === whole && b === 0;
}

/** First innings finished at 10.0 overs (not mid-T20 at 10.0). */
function inferT10FromLive(match) {
  const ld = match?.liveDetails || {};
  const firstOvers = ld.firstOvers || ((Number(ld.inningsId) || 0) >= 2 ? null : ld.overs);
  if (!oversIsExactly(firstOvers, 10)) return false;
  if ((Number(ld.inningsId) || 0) >= 2) return true;
  if (Number(ld.chaseRuns) > 0) return true;
  // Do not use score2 alone — away batting first populates it in innings 1
  if ((Number(ld.inningsId) || 0) >= 2) return true;
  if (/innings\s*break|end of (?:the )?innings|all out/i.test(String(ld.commentary || ''))) return true;
  return false;
}

/**
 * Canonical cricket match format detector.
 * Normalizes all provider fields into standard format tokens:
 * 'TEST' | 'ODI' | 'T20' | 'T10' | 'FIRST_CLASS' | 'LIST_A' | 'THE_HUNDRED' | 'OTHER'
 */
export function detectCricketMatchFormat(match) {
  if (!match) return 'T20';

  // 1. Direct authoritative provider format fields
  const direct = String(
    match.matchFormat
    || match.format
    || match.matchType
    || match.seriesType
    || match.matchHeader?.matchFormat
    || match.liveDetails?.matchFormat
    || ''
  ).trim();

  const upperDirect = direct.toUpperCase();
  if (/^TEST$|^TEST\s*MATCH$/i.test(upperDirect)) return 'TEST';
  if (/^ODI$|^ONE\s*DAY\s*INTERNATIONAL$/i.test(upperDirect)) return 'ODI';
  if (/^T20$|^TWENTY20$|^T20I$/i.test(upperDirect)) return 'T20';
  if (/^T10$|^TEN10$|^T10I$/i.test(upperDirect)) return 'T10';
  if (/^FIRST[\s-_]?CLASS$|^FC$/i.test(upperDirect)) return 'FIRST_CLASS';
  if (/^LIST[\s-_]?A$/i.test(upperDirect)) return 'LIST_A';
  if (/^THE[\s-_]?HUNDRED$|^100\s*BALL$/i.test(upperDirect)) return 'THE_HUNDRED';

  // 2. Comprehensive text analysis across league, competition, title, description, commentary
  const raw = collectMatchFormatText(match).toUpperCase();

  // Test / Multi-Day / First Class
  if (/\bTEST\s*MATCH\b|\bTEST\b|\bTESTS\b|\bASHES\b|\bSHEFFIELD\s*SHIELD\b|\bRANJI\s*TROPHY\b|\bCOUNTY\s*CHAMPIONSHIP\b|\b4[\s-]?DAY\b|\bFOUR[\s-]?DAY\b|\b5[\s-]?DAY\b|\bMULTI[\s-]?DAY\b/.test(raw)) {
    if (/FIRST[\s-_]?CLASS/.test(raw)) return 'FIRST_CLASS';
    return 'TEST';
  }

  // T10
  if (/\bT10\b|\bT-10\b|\bTEN10\b|\b10[\s-]?OVERS?\b|\bEUROPEAN\s*CRICKET\s*SERIES\b|\bECS\s*T10\b|\bABU\s*DHABI\s*T10\b|\bMAX60\b/.test(raw)) {
    return 'T10';
  }

  // The Hundred
  if (/\bTHE\s*HUNDRED\b|\bHUNDRED\b|\b100[\s-]?BALL\b/.test(raw)) {
    return 'THE_HUNDRED';
  }

  // ODI / 50 Over / List A
  if (/\bODI\b|\bONE[\s-]?DAY\b|\b50[\s-]?OVERS?\b|\bCWC\b|\bWORLD\s*CUP\b|\bVIJAY\s*HAZARE\b|\bROYAL\s*LONDON\b|\bMARSH\s*ONE\s*DAY\b/.test(raw)) {
    if (/LIST[\s-_]?A/.test(raw)) return 'LIST_A';
    return 'ODI';
  }

  // T20
  if (/\bT20\b|\bTWENTY20\b|\b20[\s-]?OVERS?\b|\bIPL\b|\bBBL\b|\bPSL\b|\bCPL\b|\bSA20\b|\bILT20\b|\bBPL\b|\bSUPER\s*SMASH\b|\bBLAST\b|\bT20\s*BLAST\b|\bSMAT\b|\bMLC\b|\bSRL\b/.test(raw)) {
    return 'T20';
  }

  // 3. Fallback based on maximum overs or observed overs
  const seen = Math.max(
    oversWhole(match?.liveDetails?.overs),
    oversWhole(match?.liveDetails?.firstOvers),
    oversWhole(match?.liveDetails?.chaseOvers),
    oversWhole(match?.liveDetails?.overs2),
    oversWhole(match?.team1?.overs),
    oversWhole(match?.team2?.overs),
  );
  if (seen > 50) return 'TEST';
  if (seen > 20) return 'ODI';
  if (seen > 10) return 'T20';

  if (String(match.sport || '').toLowerCase() === 'virtual-cricket') return 'T10';

  return 'T20';
}

/**
 * Returns clean user-facing format banner text (e.g. "TEST MATCH", "ODI", "T20", "T10").
 */
export function getCricketFormatBanner(formatOrMatch) {
  const format = typeof formatOrMatch === 'string' && !formatOrMatch.includes(' ') && formatOrMatch.toUpperCase() === formatOrMatch
    ? formatOrMatch.toUpperCase()
    : detectCricketMatchFormat(formatOrMatch);

  switch (format) {
    case 'TEST':
      return 'TEST MATCH';
    case 'ODI':
      return 'ODI';
    case 'T20':
      return 'T20';
    case 'T10':
      return 'T10';
    case 'FIRST_CLASS':
      return 'FIRST CLASS';
    case 'LIST_A':
      return 'LIST A';
    case 'THE_HUNDRED':
      return 'THE HUNDRED';
    default:
      return format || 'T20';
  }
}
/**
 * Detects if a match is an SRL (Simulated Reality League) fixture.
 * @param {object} match
 * @returns {boolean}
 */
export function isMatchSRL(match) {
  if (!match) return false;
  if (match.isSRL === true || match.isSrl === true) return true;
  if (match.isSRL === false || match.isSrl === false) return false;

  const raw = [
    match.league,
    match.seriesName,
    match.competition,
    match.tournament,
    match.name,
    match.eventName,
    match.matchName,
    match.matchType,
    match.format,
    match.matchFormat,
    match.description,
    match.team1?.name,
    match.team2?.name,
    typeof match.team1 === 'string' ? match.team1 : null,
    typeof match.team2 === 'string' ? match.team2 : null,
    match.sport,
    match.id,
  ].filter(Boolean).join(' ').toUpperCase();

  return /\bSRL\b|SIMULATED\s*REALITY|IPL\s*SRL|BBL\s*SRL|PSL\s*SRL|CPL\s*SRL|T20\s*SRL|SA20\s*SRL|PAKISTAN\s*SRL|INDIA\s*SRL|AUSTRALIA\s*SRL/.test(raw);
}

/**
 * Returns compact match card format badge text (e.g. "TEST", "ODI", "T20", "T10", "FIRST CLASS", "LIST A", "CRICKET").
 */
export function getCricketFormatCardBadge(formatOrMatch) {
  const format = typeof formatOrMatch === 'string' && !formatOrMatch.includes(' ') && formatOrMatch.toUpperCase() === formatOrMatch
    ? formatOrMatch.toUpperCase()
    : detectCricketMatchFormat(formatOrMatch);

  switch (format) {
    case 'TEST':
      return 'TEST';
    case 'ODI':
      return 'ODI';
    case 'T20':
      return 'T20';
    case 'T10':
      return 'T10';
    case 'FIRST_CLASS':
      return 'FIRST CLASS';
    case 'LIST_A':
      return 'LIST A';
    case 'THE_HUNDRED':
      return 'THE HUNDRED';
    case 'OTHER':
      return 'CRICKET';
    default:
      return format || 'CRICKET';
  }
}

/**
 * Resolve limited-overs format. League/series T10 wins over a generic T20 matchType.
 * @returns {'T10'|'T20'|'ODI'|'TEST'|'THE_HUNDRED'}
 */
export function resolveCricketOversFormat(match) {
  const detected = detectCricketMatchFormat(match);
  if (detected === 'FIRST_CLASS') return 'TEST';
  if (detected === 'LIST_A') return 'ODI';
  return detected;
}

/** Cricbuzz Hundred API often sends total balls as `64.0` or `100.0` instead of overs. */
export function isHundredBallCount(oversStr) {
  const parts = String(oversStr ?? '0').split('.');
  const whole = parseInt(parts[0], 10) || 0;
  const ball = parseInt(parts[1], 10) || 0;
  return ball === 0 && whole > HUNDRED_MAX_OVERS && whole <= HUNDRED_BALLS_PER_INNINGS;
}

export function hundredBallsToOvers(totalBalls) {
  const balls = Math.max(0, Math.min(HUNDRED_BALLS_PER_INNINGS, totalBalls));
  const whole = Math.floor(balls / HUNDRED_BALLS_PER_OVER);
  const ball = balls % HUNDRED_BALLS_PER_OVER;
  return `${whole}.${ball}`;
}

export function normalizeHundredOvers(oversStr) {
  const str = String(oversStr ?? '0');
  if (!str || str === '0') return '0.0';

  const parts = str.split('.');
  const whole = parseInt(parts[0], 10) || 0;
  const ball = parseInt(parts[1], 10) || 0;

  if (isHundredBallCount(str)) {
    return hundredBallsToOvers(whole);
  }

  if (ball > HUNDRED_BALLS_PER_OVER) {
    return hundredBallsToOvers(whole);
  }

  return `${whole}.${ball}`;
}

export function normalizeMatchOvers(oversStr, match) {
  if (isHundredMatch(match)) {
    return normalizeHundredOvers(oversStr);
  }
  return normalizeCricbuzzOvers(oversStr);
}

export function getMatchMaxOvers(match) {
  const format = resolveCricketOversFormat(match);
  if (format === 'THE_HUNDRED') return HUNDRED_MAX_OVERS;
  if (format === 'T10') return 10;
  if (format === 'ODI') return 50;
  if (format === 'TEST') return null;
  return 20;
}

export function oversToBallsForMatch(oversStr, match) {
  const normalized = normalizeMatchOvers(oversStr, match);
  if (isHundredMatch(match)) {
    const parts = normalized.split('.');
    const whole = parseInt(parts[0], 10) || 0;
    const ball = parseInt(parts[1], 10) || 0;
    return whole * HUNDRED_BALLS_PER_OVER + ball;
  }
  return oversToBalls(normalized);
}

export function getMatchMaxBalls(match) {
  if (isHundredMatch(match)) return HUNDRED_BALLS_PER_INNINGS;
  const overs = getMatchMaxOvers(match);
  if (overs == null) return null;
  return overs * 6;
}

/** Check if match is a Test / Multi-Day match */
export function isTestMatch(match) {
  if (!match) return false;
  const text = `${match.matchFormat || ''} ${match.matchType || ''} ${match.format || ''} ${match.league || ''} ${match.seriesName || ''} ${match.id || ''}`;
  return /test|first[- ]?class|4[- ]?day|pak_wi|wi_pak|ind_eng/i.test(text);
}

/** Returns formatted day & session string for Test matches (e.g. "4th Day · Afternoon Session") */
export function getTestMatchDayLabel(match) {
  if (!match) return null;
  const combinedText = `${match.time || ''} ${match.liveDetails?.commentary || ''} ${match.liveDetails?.day || ''} ${match.liveDetails?.session || ''} ${match.liveDetails?.status || ''}`;

  // 1. Direct Regex Match for "Day X" or "Xth Day"
  const dayMatch = combinedText.match(/\b(?:Day\s*([1-5])|([1-5])(?:st|nd|rd|th)?\s*Day)\b/i);
  let dayNum = dayMatch ? parseInt(dayMatch[1] || dayMatch[2], 10) : null;

  if (!dayNum && match.liveDetails?.day) {
    dayNum = parseInt(match.liveDetails.day, 10);
  }

  // 2. Infer from cumulative overs if not explicitly stated (only with real scoring)
  if (!dayNum && (match.liveDetails?.overs || match.liveDetails?.overs2 || match.liveDetails?.runs)) {
    const runs = Number(match.liveDetails?.runs) || 0;
    const score2 = Number(match.liveDetails?.score2) || 0;
    const ov1 = parseFloat(runs > 0 || Number(match.liveDetails?.wickets) > 0 ? match.liveDetails.overs : 0) || 0;
    const ov2 = parseFloat(score2 > 0 || Number(match.liveDetails?.wickets2) > 0 ? match.liveDetails.overs2 : 0) || 0;
    const totalOvers = ov1 + ov2;
    if (totalOvers > 0) {
      dayNum = Math.min(5, Math.floor(totalOvers / 90) + 1);
    }
  }

  // Unknown day — do not invent "4th Day"
  if (!dayNum) return null;

  const ordinals = ['1st', '2nd', '3rd', '4th', '5th'];
  const ordinalStr = ordinals[dayNum - 1] || `${dayNum}th`;

  // Extract Session / Stumps status if available
  let sessionStr = '';
  if (/morning/i.test(combinedText)) sessionStr = ' · Morning Session';
  else if (/afternoon|tea/i.test(combinedText)) sessionStr = ' · Afternoon Session';
  else if (/evening|stumps/i.test(combinedText)) sessionStr = ' · Stumps';
  else if (/lunch/i.test(combinedText)) sessionStr = ' · Lunch Break';

  return `${ordinalStr} Day${sessionStr}`;
}

/** Formats remaining time until match start (e.g. "Starts in 02h 15m 30s") */
export function formatMatchCountdown(match) {
  if (!match) return null;
  const timeStr = String(match.time || '');

  // If match already specifies "Starts in..."
  if (/starts in/i.test(timeStr)) return timeStr;

  let targetDate = null;
  if (match.startTime) {
    targetDate = new Date(match.startTime);
  } else if (match.matchDate) {
    targetDate = new Date(match.matchDate);
  }

  if (targetDate && !isNaN(targetDate.getTime())) {
    const diffMs = targetDate.getTime() - Date.now();
    if (diffMs <= 0) return 'Starts Imminently';

    const totalSec = Math.floor(diffMs / 1000);
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);

    if (days > 0) return `Starts in ${days}d ${hours}h`;
    if (hours > 0) return `Starts in ${hours}h ${mins}m`;
    return `Starts in ${mins}m`;
  }

  if (timeStr && !timeStr.toLowerCase().includes('live')) {
    return `Starts at ${timeStr}`;
  }

  return 'Starts Shortly';
}
