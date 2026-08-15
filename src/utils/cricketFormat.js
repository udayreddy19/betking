import { normalizeCricbuzzOvers, oversToBalls } from './oversUtils.js';

const HUNDRED_BALLS_PER_INNINGS = 100;
const HUNDRED_BALLS_PER_OVER = 5;
const HUNDRED_MAX_OVERS = HUNDRED_BALLS_PER_INNINGS / HUNDRED_BALLS_PER_OVER;

export function isHundredMatch(match) {
  const text = [
    match?.league,
    match?.seriesName,
    match?.matchType,
    match?.matchFormat,
    match?.matchHeader?.matchFormat,
    match?.matchHeader?.seriesName,
  ].filter(Boolean).join(' ');
  return /hundred/i.test(text) || /\bhun\b/i.test(text);
}

export function getMatchFormatHint(match) {
  return `${match?.matchFormat || ''} ${match?.league || ''} ${match?.seriesName || ''} ${match?.matchType || ''}`;
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
  if (isHundredMatch(match)) return HUNDRED_MAX_OVERS;

  const text = getMatchFormatHint(match);
  if (/t10/i.test(text)) return 10;
  if (/odi|one[- ]?day|list\s*a|50\s*over/i.test(text)) return 50;
  if (/test|first[- ]?class/i.test(text)) return null;
  if (/4[- ]?day/i.test(text)) return 90;
  if (/t20|blast|ipl|bbl|cpl|sa20|ilt20|mlc/i.test(text)) return 20;

  // Infer from current overs when format metadata is missing
  const oversStr = match?.liveDetails?.overs
    || match?.liveDetails?.firstOvers
    || match?.liveDetails?.chaseOvers
    || '0';
  const whole = parseInt(String(oversStr).split('.')[0], 10) || 0;
  if (whole > 20) return 50;
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

  // 2. Infer from cumulative overs if not explicitly stated
  if (!dayNum && (match.liveDetails?.overs || match.liveDetails?.overs2 || match.liveDetails?.runs)) {
    const ov1 = parseFloat(match.liveDetails.runs ? match.liveDetails.overs : 0) || 0;
    const ov2 = parseFloat(match.liveDetails.score2 ? match.liveDetails.overs2 : 0) || 0;
    const totalOvers = ov1 + ov2;
    if (totalOvers > 0) {
      dayNum = Math.min(5, Math.floor(totalOvers / 90) + 1);
    }
  }

  if (!dayNum) dayNum = 4; // Default realistic day for active demo Test match

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
