import { normalizeCricbuzzOvers, oversToBalls } from './oversUtils';

const HUNDRED_BALLS_PER_INNINGS = 100;
const HUNDRED_BALLS_PER_OVER = 5;
const HUNDRED_MAX_OVERS = HUNDRED_BALLS_PER_INNINGS / HUNDRED_BALLS_PER_OVER;

export function isHundredMatch(match) {
  const text = `${match?.league || ''} ${match?.seriesName || ''} ${match?.matchType || ''} ${match?.matchFormat || ''}`;
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
  if (/test|first[- ]?class|4[- ]?day/i.test(text)) return 90;
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
  return getMatchMaxOvers(match) * 6;
}
