/**
 * Shared innings-complete / never-event helpers for cricket settlement.
 * Used by dismissal, next-over, wicket-in-over, milestones, and totals graders.
 */

import { getBattingOversAndScore, parseOversParts } from '../matchOverSnapshotStore.mjs';
import { getMatchMaxOvers } from '../../src/utils/cricketFormat.js';
import { isCricketMatchCompleted } from '../../src/utils/cricketMatchComplete.js';
import { getInningsOversString, getCurrentInningsNumber } from './overBoundary.mjs';

export function isMatchFinalStatus(match) {
  if (!match) return false;
  const state = String(match.matchState || '').toLowerCase();
  const status = String(match.status || match.liveStatus || match.time || '').toUpperCase();
  if (state === 'post' || state === 'completed') return true;
  if (['COMPLETED', 'FINAL', 'FINISHED', 'CLOSED', 'ABANDONED', 'CANCELLED'].includes(status)) return true;
  if (/^(COMPLETED|FINAL|FINISHED|CLOSED)$/i.test(String(match.time || ''))) return true;
  if (isCricketMatchCompleted(match)) return true;
  return false;
}

function battingSideTeam(match, innings) {
  const ld = match?.liveDetails || {};
  const inn = Number(innings) || 1;
  const nameKey = inn === 1 ? 'firstTeamName' : 'chaseTeamName';
  const targetName = String(ld[nameKey] || '').toLowerCase();
  if (!targetName) return null;
  const t1 = match?.team1;
  const t2 = match?.team2;
  if (t1 && (
    String(t1.name || '').toLowerCase() === targetName
    || String(t1.shortName || '').toLowerCase() === targetName
  )) return t1;
  if (t2 && (
    String(t2.name || '').toLowerCase() === targetName
    || String(t2.shortName || '').toLowerCase() === targetName
  )) return t2;
  return null;
}

/** Prefer liveDetails fields; fall back to batting-side team card. */
export function resolveInningsWickets(match, innings) {
  const ld = match?.liveDetails || {};
  const inn = Number(innings) || 1;

  // Check testInnings array if present
  if (Array.isArray(ld.testInnings) && ld.testInnings.length) {
    const tInn = ld.testInnings.find((t) => t.inningsId === inn);
    if (tInn && Number.isFinite(Number(tInn.wickets))) {
      return Number(tInn.wickets);
    }
  }

  // Check scorecardInnings array if present
  if (Array.isArray(match?.scorecardInnings) && match.scorecardInnings.length) {
    const sInn = match.scorecardInnings.find((s) => (s.inningsId ?? s.innings) === inn);
    const sdW = sInn?.scoreDetails?.wickets ?? sInn?.wickets;
    if (Number.isFinite(Number(sdW))) {
      return Number(sdW);
    }
  }

  const bat = getBattingOversAndScore(match);

  if (inn === bat.innings && Number.isFinite(Number(bat.wickets))) {
    return Number(bat.wickets) || 0;
  }

  if (inn === 1) {
    const fromLd = Number(ld.firstWickets);
    if (Number.isFinite(fromLd)) return fromLd;
    const side = battingSideTeam(match, 1);
    if (side && Number.isFinite(Number(side.wickets))) return Number(side.wickets) || 0;
    // Last resort: higher of team cards only when first innings finished and chase started
    if (bat.innings >= 2) {
      const a = Number(match?.team1?.wickets);
      const b = Number(match?.team2?.wickets);
      if (Number.isFinite(a) || Number.isFinite(b)) {
        // Prefer non-chase card: if chase wickets known, use the other
        const chaseW = Number(ld.chaseWickets);
        if (Number.isFinite(chaseW) && Number.isFinite(a) && a !== chaseW) return a;
        if (Number.isFinite(chaseW) && Number.isFinite(b) && b !== chaseW) return b;
      }
    }
    return Number(match?.team1?.wickets) || 0;
  }

  const fromLd = Number(ld.chaseWickets);
  if (Number.isFinite(fromLd)) return fromLd;
  const side = battingSideTeam(match, 2);
  if (side && Number.isFinite(Number(side.wickets))) return Number(side.wickets) || 0;
  return Number(match?.team2?.wickets) || 0;
}

export function resolveInningsRuns(match, innings) {
  const ld = match?.liveDetails || {};
  const inn = Number(innings) || 1;

  // Check testInnings array if present
  if (Array.isArray(ld.testInnings) && ld.testInnings.length) {
    const tInn = ld.testInnings.find((t) => t.inningsId === inn);
    if (tInn && Number.isFinite(Number(tInn.runs))) {
      return Number(tInn.runs);
    }
  }

  // Check scorecardInnings array if present
  if (Array.isArray(match?.scorecardInnings) && match.scorecardInnings.length) {
    const sInn = match.scorecardInnings.find((s) => (s.inningsId ?? s.innings) === inn);
    const sdR = sInn?.scoreDetails?.runs ?? sInn?.score ?? sInn?.runs;
    if (Number.isFinite(Number(sdR))) {
      return Number(sdR);
    }
  }

  const bat = getBattingOversAndScore(match);

  if (inn === bat.innings && Number.isFinite(Number(bat.score))) {
    return Number(bat.score) || 0;
  }

  if (inn === 1) {
    const fromLd = Number(ld.firstRuns);
    if (Number.isFinite(fromLd)) return fromLd;
    const side = battingSideTeam(match, 1);
    if (side && Number.isFinite(Number(side.runs))) return Number(side.runs) || 0;
    return Number(match?.team1?.runs) || 0;
  }

  const fromLd = Number(ld.chaseRuns);
  if (Number.isFinite(fromLd)) return fromLd;
  const side = battingSideTeam(match, 2);
  if (side && Number.isFinite(Number(side.runs))) return Number(side.runs) || 0;
  return Number(match?.team2?.runs) || 0;
}

/**
 * True when batting innings for settleInnings is finished.
 */
export function isInningsComplete(match, settleInnings, bat = null, ld = null) {
  const batting = bat || getBattingOversAndScore(match);
  const details = ld || match?.liveDetails || {};
  const inn = Number(settleInnings) || 1;
  const commentary = String(details.commentary || '');

  if (inn === 1) {
    if (batting.innings >= 2 || getCurrentInningsNumber(match) >= 2) return true;
    if (resolveInningsWickets(match, 1) >= 10) return true;
    if (/all\s*out|declared|innings\s*complete/i.test(commentary)) return true;
    if (isMatchFinalStatus(match) && batting.innings <= 1) return true;
    const maxOvers = getMatchMaxOvers(match);
    const oversStr = getInningsOversString(match, 1) ?? batting.oversStr;
    const parts = parseOversParts(oversStr);
    if (maxOvers && parts && parts.completed >= maxOvers && batting.innings === 1) return true;
    return false;
  }

  if (inn >= 2) {
    if (isMatchFinalStatus(match)) return true;
    if (batting.innings > inn) return true;
    if (resolveInningsWickets(match, inn) >= 10) return true;
    if (/all\s*out|target\s*(chased|reached)|won by|declared/i.test(commentary)) return true;

    // Check testInnings if Test match
    if (Array.isArray(details.testInnings) && details.testInnings.length) {
      const tInn = details.testInnings.find((t) => t.inningsId === inn);
      if (tInn && (tInn.allOut || tInn.declared || Number(tInn.wickets) >= 10)) return true;
    }

    // Check scorecardInnings
    if (Array.isArray(match?.scorecardInnings) && match.scorecardInnings.length) {
      const sInn = match.scorecardInnings.find((s) => (s.inningsId ?? s.innings) === inn);
      if (sInn && (sInn.isDeclared || (sInn.scoreDetails?.wickets ?? sInn.wickets) >= 10)) return true;
    }

    const maxOvers = getMatchMaxOvers(match);
    const oversStr = getInningsOversString(match, inn) ?? batting.oversStr;
    const parts = parseOversParts(oversStr);
    if (maxOvers && parts && parts.completed >= maxOvers && batting.innings === inn) return true;
    return false;
  }

  return isMatchFinalStatus(match);
}

/**
 * True when innings finished without over `overNum` ever being completed
 * (over never started, or started but innings ended mid-over without a completed snapshot).
 */
export function isOverNeverCompleted(match, settleInnings, overNum) {
  const target = Number(overNum);
  if (!Number.isFinite(target) || target <= 0) return false;
  if (!isInningsComplete(match, settleInnings)) return false;

  const oversStr = getInningsOversString(match, settleInnings);
  const parts = parseOversParts(oversStr);
  if (!parts) {
    // Innings done but no overs clock — treat as never completed if we can't prove it was.
    // Safer for next_over VOID than leaving PENDING forever.
    return true;
  }
  // completed === N means over N just finished (N.0). completed < N means over N never finished.
  return parts.completed < target;
}
