/**
 * Authoritative cumulative score at end of over N for milestone / segment markets.
 * Never uses current chase score for a completed prior-innings boundary.
 */

import {
  getScoreAtOverEnd,
  getBattingOversAndScore,
  parseOversParts,
} from '../matchOverSnapshotStore.mjs';
import {
  getInningsOversString,
  isMilestoneBoundaryReached,
  getCurrentInningsNumber,
} from './overBoundary.mjs';
import { parseMilestoneOverMarket } from './milestoneMarketParser.mjs';
import { logSettlement } from './settlementAudit.mjs';
import {
  isInningsComplete,
  resolveInningsRuns,
} from './inningsCompletion.mjs';

function sumOverHistoryThroughOver(match, innings, targetOver) {
  const history = match?.overHistory || match?.liveDetails?.overHistory || [];
  if (!Array.isArray(history) || !history.length) return null;

  const scoped = history.filter((row) => {
    const rowInn = Number(row.innings ?? row.inn ?? 1);
    return innings == null || rowInn === innings;
  });

  let cumulative = 0;
  for (let o = 1; o <= targetOver; o += 1) {
    const row = scoped.find((r) => Number(r.overNum || r.over || r.number) === o);
    if (!row) {
      if (o < targetOver) return null;
      break;
    }
    if (row.isCurrent === true && o === targetOver) return null;
    let runs = row.runs;
    if (runs == null && Array.isArray(row.balls)) {
      runs = row.balls.reduce((sum, b) => {
        const s = String(b);
        if (s === 'W' || s === '•' || s === '.') return sum;
        if (/^\d+$/.test(s)) return sum + Number(s);
        return sum;
      }, 0);
    }
    if (runs == null || !Number.isFinite(Number(runs))) return null;
    cumulative += Number(runs);
  }

  const endRow = scoped.find((r) => Number(r.overNum || r.over) === targetOver && !r.isCurrent);
  if (endRow?.cumulativeScore != null) return Number(endRow.cumulativeScore);
  if (endRow?.scoreAtEnd != null) return Number(endRow.scoreAtEnd);

  return cumulative > 0 || targetOver > 0 ? cumulative : null;
}

/**
 * @returns {Promise<{ score: number|null, scoreSource: string, boundaryReached: boolean }>}
 */
export async function resolveMilestoneScore({
  match,
  matchId,
  innings,
  targetOver,
  betId = null,
  marketId = null,
}) {
  const id = String(matchId || match?.id || match?.matchId || '');
  const parsed = parseMilestoneOverMarket(marketId || '');
  const settleInnings = innings ?? parsed?.innings ?? 1;

  const boundaryReached = isMilestoneBoundaryReached(match, settleInnings, targetOver)
    || (settleInnings != null && getCurrentInningsNumber(match) > settleInnings)
    || isInningsComplete(match, settleInnings);

  logSettlement('SETTLEMENT_BOUNDARY_CHECK', {
    betId,
    matchId: id,
    marketId,
    innings: settleInnings,
    targetOver,
    boundaryReached,
    stateVersion: match?.stateVersion ?? match?.canonicalState?.stateVersion ?? null,
  });

  if (!boundaryReached) {
    return { score: null, scoreSource: 'none', boundaryReached: false };
  }

  logSettlement('SETTLEMENT_BOUNDARY_REACHED', {
    betId,
    matchId: id,
    marketId,
    innings: settleInnings,
    targetOver,
    boundary: 'OVER_COMPLETE',
  });

  let score = await getScoreAtOverEnd(id, targetOver, settleInnings);
  if (score != null && Number.isFinite(score)) {
    logSettlement('SETTLEMENT_SCORE_RESOLVED', {
      betId,
      matchId: id,
      marketId,
      innings: settleInnings,
      targetOver,
      score,
      scoreSource: 'match_over_snapshots',
    });
    return { score, scoreSource: 'match_over_snapshots', boundaryReached: true };
  }

  score = sumOverHistoryThroughOver(match, settleInnings, targetOver);
  if (score != null && Number.isFinite(score)) {
    logSettlement('SETTLEMENT_SCORE_RESOLVED', {
      betId,
      matchId: id,
      marketId,
      innings: settleInnings,
      targetOver,
      score,
      scoreSource: 'over_history',
    });
    return { score, scoreSource: 'over_history', boundaryReached: true };
  }

  const scopedOvers = getInningsOversString(match, settleInnings);
  const bat = getBattingOversAndScore(match);
  if (score == null && scopedOvers != null && settleInnings === bat.innings) {
    const parts = String(scopedOvers).match(/^(\d+)(?:\.(\d+))?$/);
    if (parts && Number(parts[1]) === targetOver && Number(parts[2] || 0) === 0) {
      score = Number(bat.score) || 0;
      logSettlement('SETTLEMENT_SCORE_RESOLVED', {
        betId,
        matchId: id,
        marketId,
        innings: settleInnings,
        targetOver,
        score,
        scoreSource: 'live_boundary_score',
      });
      return { score, scoreSource: 'live_boundary_score', boundaryReached: true };
    }
  }

  // Innings ended before over N (all out / chase won early): grade at final innings total.
  if (isInningsComplete(match, settleInnings)) {
    const oversParts = parseOversParts(scopedOvers);
    const endedBeforeTarget = !oversParts || oversParts.completed < Number(targetOver);
    if (endedBeforeTarget) {
      const finalRuns = resolveInningsRuns(match, settleInnings);
      if (Number.isFinite(finalRuns)) {
        logSettlement('SETTLEMENT_SCORE_RESOLVED', {
          betId,
          matchId: id,
          marketId,
          innings: settleInnings,
          targetOver,
          score: finalRuns,
          scoreSource: 'innings_final_early_end',
        });
        return { score: finalRuns, scoreSource: 'innings_final_early_end', boundaryReached: true };
      }
    }
  }

  logSettlement('SETTLEMENT_SCORE_RESOLVED', {
    betId,
    matchId: id,
    marketId,
    innings: settleInnings,
    targetOver,
    score: null,
    scoreSource: 'none',
    reason: 'BOUNDARY_DATA_UNAVAILABLE',
  });

  return { score: null, scoreSource: 'none', boundaryReached: true };
}
