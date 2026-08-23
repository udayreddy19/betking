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
 * Resolve limited-overs format. League/series T10 wins over a generic T20 matchType.
 * @returns {'T10'|'T20'|'ODI'|'TEST'|'THE_HUNDRED'}
 */
export function resolveCricketOversFormat(match) {
  if (!match) return 'T20';
  if (isHundredMatch(match)) return 'THE_HUNDRED';

  const raw = collectMatchFormatText(match).toUpperCase();

  // Explicit T10 markers (before T20 — "Frankfurt T10" + matchType T20)
  if (/T[\s-]?10|TEN\s*10|10[\s-]?OVERS?|TEN[\s-]?OVERS?|FRANKFURT\s*T10/.test(raw)) {
    return 'T10';
  }

  if (inferT10FromLive(match)) return 'T10';

  // Virtual / Quantum products on this book are 10-over games unless marked otherwise
  const explicitLonger = /\bT20\b|TWENTY20|20[\s-]?OVERS?|\bODI\b|ONE[-\s]?DAY|\bTEST\b|50[\s-]?OVER/.test(raw);
  if (!explicitLonger) {
    if (String(match.sport || '').toLowerCase() === 'virtual-cricket') return 'T10';
    if (/VIRTUAL\s*FAST\s*CRICKET|QUANTUM\s*CRICKET/.test(raw)) return 'T10';
  }

  if (/TEST|FIRST\s*CLASS|4[\s-]?DAY/.test(raw)) return 'TEST';
  if (/ODI|ONE[-\s]?DAY|LIST\s*A|\b50[\s-]?OVERS?|CWC\s*LEAGUE/.test(raw)) return 'ODI';
  if (/\bT20\b|TWENTY20|20[\s-]?OVERS?|\bBLAST\b|\bIPL\b|\bBBL\b|\bCPL\b|SA20|ILT20|\bMLC\b/.test(raw)) {
    return 'T20';
  }

  // Live overs already past 10 in innings 1 → T20/ODI, not T10
  const seen = Math.max(
    oversWhole(match?.liveDetails?.overs),
    oversWhole(match?.liveDetails?.firstOvers),
    oversWhole(match?.liveDetails?.chaseOvers),
    oversWhole(match?.liveDetails?.overs2),
  );
  if (seen > 10 && seen <= 20) return 'T20';
  if (seen > 20) return 'ODI';

  return 'T20';
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
