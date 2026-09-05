/**
 * Frontend twin of lib/matchQualityGate.mjs
 */

import { hasCricketPlayStarted } from './matchBetting.js';

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

function parseOversBalls(overs) {
  const str = String(overs ?? '').trim();
  if (!str || str === '—' || str === '-') return 0;
  const parts = str.split('.');
  const whole = parseInt(parts[0], 10) || 0;
  const ball = parseInt(parts[1], 10) || 0;
  return whole * 6 + ball;
}

function cricketActivity(match) {
  const ld = match?.liveDetails || {};
  const r1 = Number(ld.firstRuns ?? ld.runs ?? match?.team1?.runs ?? 0) || 0;
  const r2 = Number(ld.chaseRuns ?? ld.score2 ?? match?.team2?.runs ?? 0) || 0;
  const w1 = Number(ld.firstWickets ?? ld.wickets ?? match?.team1?.wickets ?? 0) || 0;
  const w2 = Number(ld.chaseWickets ?? ld.wickets2 ?? match?.team2?.wickets ?? 0) || 0;
  const balls = parseOversBalls(ld.firstOvers || ld.overs || match?.team1?.overs)
    + parseOversBalls(ld.chaseOvers || ld.overs2 || match?.team2?.overs);
  return { totalRuns: r1 + r2, totalWickets: w1 + w2, balls };
}

export function evaluateMatchQuality(match) {
  if (!match) return { pass: false, reason: 'empty' };
  const n1 = teamName(match, 1);
  const n2 = teamName(match, 2);
  if (isPlaceholderName(n1) || isPlaceholderName(n2)) {
    return { pass: false, reason: 'placeholder_teams' };
  }
  if (isCricketish(match)) {
    const claimedLive = match.isLive === true
      || String(match.matchState || '').toLowerCase() === 'in'
      || String(match.status || '').toLowerCase() === 'live';
    if (claimedLive && !hasCricketPlayStarted(match)) {
      return { pass: false, reason: 'live_without_play' };
    }
    if (claimedLive) {
      const act = cricketActivity(match);
      if (act.balls <= 0 && act.totalRuns <= 1 && act.totalWickets <= 0) {
        return { pass: false, reason: 'thin_live_stub' };
      }
      if (n1.length <= 3 && n2.length <= 3 && act.totalRuns <= 2 && act.balls < 6) {
        return { pass: false, reason: 'thin_code_stub' };
      }
    }
  }
  return { pass: true };
}

export function passesMatchQualityGate(match) {
  return evaluateMatchQuality(match).pass;
}
