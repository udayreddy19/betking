/**
 * Canonical parser for milestone / segment over-total markets.
 * Never infer targetOver from display text — market_id only.
 */

import { parseOuLine } from '../odds-v3/lineIdentity.mjs';
import { resolveSettlementLine } from './placementContext.mjs';

export const MARKET_TYPE_MILESTONE_OVER_TOTAL = 'MILESTONE_OVER_TOTAL';

/**
 * @param {string} marketId
 * @param {object} [bet] — optional bet row for placement line
 * @returns {{
 *   marketType: string,
 *   innings: number|null,
 *   startOver: number,
 *   targetOver: number,
 *   line: number|null,
 *   instanceKey: string,
 * }|null}
 */
export function parseMilestoneOverMarket(marketId, bet = null) {
  const id = String(marketId || '').trim();
  const milestone = id.match(/^(?:i(\d+)_)?overs_0_(\d+)_total$/i);
  if (!milestone) return null;

  const innings = milestone[1] != null ? Number(milestone[1]) : null;
  const targetOver = Number(milestone[2]);
  if (!Number.isFinite(targetOver) || targetOver <= 0) return null;

  const selectionId = String(bet?.selection_id || '');
  const selectionName = String(bet?.selection_name || '');
  const line = bet
    ? (resolveSettlementLine(bet, selectionId, selectionName) ?? parseOuLine(selectionName, selectionId))
    : null;

  return {
    marketType: MARKET_TYPE_MILESTONE_OVER_TOTAL,
    innings,
    startOver: 0,
    targetOver,
    line: line != null && Number.isFinite(Number(line)) ? Number(line) : null,
    instanceKey: `MILESTONE:I${innings ?? 'X'}:O0-${targetOver}`,
  };
}

/** Same patterns as next-over totals for registry reuse. */
export function parseNextOverTotalMarket(marketId, bet = null) {
  const id = String(marketId || '').trim();
  const nextOver = id.match(/^(?:i(\d+)_)?next_over_(\d+)_total$/i);
  if (!nextOver) return null;

  const innings = nextOver[1] != null ? Number(nextOver[1]) : null;
  const targetOver = Number(nextOver[2]);
  const selectionId = String(bet?.selection_id || '');
  const selectionName = String(bet?.selection_name || '');
  const line = bet
    ? (resolveSettlementLine(bet, selectionId, selectionName) ?? parseOuLine(selectionName, selectionId))
    : null;

  return {
    marketType: 'NEXT_OVER_TOTAL',
    innings,
    startOver: targetOver - 1,
    targetOver,
    line: line != null && Number.isFinite(Number(line)) ? Number(line) : null,
    instanceKey: `OVER_TOTAL:I${innings ?? 'X'}:O${targetOver}`,
  };
}

export function parseOverMarketFromId(marketId, bet = null) {
  return parseMilestoneOverMarket(marketId, bet) || parseNextOverTotalMarket(marketId, bet);
}
