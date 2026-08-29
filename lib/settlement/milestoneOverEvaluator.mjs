/**
 * Milestone over-total evaluator (iN_overs_0_X_total).
 * Never grades using current innings when market is scoped to a prior innings.
 */

import { parseMilestoneOverMarket } from './milestoneMarketParser.mjs';
import { resolveMilestoneScore } from './milestoneScoreResolver.mjs';
import {
  isMilestoneBoundaryReached,
  getCurrentInningsNumber,
} from './overBoundary.mjs';
import { isInningsComplete } from './inningsCompletion.mjs';
import { resolveSettlementLine } from './placementContext.mjs';
import { parseOuLine as parseLineFromText } from '../odds-v3/lineIdentity.mjs';
import { logSettlement } from './settlementAudit.mjs';

function parseOuLine(selectionName = '', selectionId = '') {
  return parseLineFromText(selectionName) ?? parseLineFromText(selectionId);
}

function isOverSelection(selectionId, selectionName) {
  const s = `${selectionId} ${selectionName}`.toLowerCase();
  return (/(?:^|[^a-z])over(?:[^a-z]|$)/.test(s) || s.includes('sel_over') || s.includes('over')) && !s.includes('under');
}

function isUnderSelection(selectionId, selectionName) {
  const s = `${selectionId} ${selectionName}`.toLowerCase();
  return /(?:^|[^a-z])under(?:[^a-z]|$)/.test(s) || s.includes('sel_under') || s.includes('under');
}

/**
 * @returns {Promise<{ outcome: string, reason: string }|null>}
 */
export async function evaluateMilestoneOverMarketBet(bet, match) {
  const market = String(bet.market_id || '');
  const parsed = parseMilestoneOverMarket(market, bet);
  if (!parsed) return null;

  const selectionId = String(bet.selection_id || '');
  const selectionName = String(bet.selection_name || '');
  const { innings: marketInnings, targetOver, line: parsedLine } = parsed;

  const settleInnings = marketInnings ?? (getCurrentInningsNumber(match) >= 2 ? 1 : getCurrentInningsNumber(match));

  if (marketInnings != null && getCurrentInningsNumber(match) < marketInnings) {
    logSettlement('SETTLEMENT_SKIPPED', {
      betId: bet.bet_id,
      matchId: match?.id || match?.matchId,
      marketId: market,
      reason: 'innings_not_reached',
      innings: marketInnings,
    });
    return null;
  }

  const boundaryReached = isMilestoneBoundaryReached(match, settleInnings, targetOver)
    || (marketInnings != null && getCurrentInningsNumber(match) > marketInnings)
    || isInningsComplete(match, settleInnings);

  if (!boundaryReached) {
    logSettlement('SETTLEMENT_SKIPPED', {
      betId: bet.bet_id,
      matchId: match?.id || match?.matchId,
      marketId: market,
      reason: 'boundary_not_reached',
      innings: settleInnings,
      targetOver,
    });
    return null;
  }

  const { score, scoreSource, boundaryReached: boundaryConfirmed } = await resolveMilestoneScore({
    match,
    matchId: match?.id || match?.matchId,
    innings: settleInnings,
    targetOver,
    betId: bet.bet_id,
    marketId: market,
  });

  const line = resolveSettlementLine(bet, selectionId, selectionName)
    ?? parsedLine
    ?? parseOuLine(selectionName, selectionId);

  if (line == null) {
    logSettlement('SETTLEMENT_SKIPPED', {
      betId: bet.bet_id,
      matchId: match?.id || match?.matchId,
      marketId: market,
      reason: 'line_unknown',
    });
    return null;
  }

  if (score == null || !Number.isFinite(score)) {
    logSettlement('SETTLEMENT_VOIDED', {
      betId: bet.bet_id,
      matchId: match?.id || match?.matchId,
      marketId: market,
      reason: 'BOUNDARY_DATA_UNAVAILABLE',
      innings: settleInnings,
      targetOver,
      boundaryReached: boundaryConfirmed,
    });
    return {
      outcome: 'VOID',
      reason: `milestone_${targetOver}_i${settleInnings}_BOUNDARY_DATA_UNAVAILABLE`,
      scoreSource,
    };
  }

  let outcome = null;
  if (isOverSelection(selectionId, selectionName)) {
    outcome = score > line ? 'WON' : 'LOST';
  } else if (isUnderSelection(selectionId, selectionName)) {
    outcome = score < line ? 'WON' : 'LOST';
  } else {
    logSettlement('SETTLEMENT_SKIPPED', {
      betId: bet.bet_id,
      marketId: market,
      reason: 'selection_side_unknown',
    });
    return null;
  }

  logSettlement('SETTLEMENT_EVALUATED', {
    betId: bet.bet_id,
    matchId: match?.id || match?.matchId,
    marketId: market,
    marketType: parsed.marketType,
    innings: settleInnings,
    targetOver,
    line,
    score,
    scoreSource,
    result: outcome,
    boundary: 'OVER_COMPLETE',
  });

  return {
    outcome,
    reason: `milestone_${targetOver}_i${settleInnings}_score=${score}_line=${line}`,
    scoreSource,
  };
}
