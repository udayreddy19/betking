/**
 * OddsYra / BetKing — Settlement Decision Trace & Explainability Engine
 * 
 * Generates an immutable, forensic audit record explaining every settlement decision:
 * - Placement snapshot context
 * - Contract & rule resolution
 * - Specific scorecard / ball event evidence
 * - Deterministic outcome & dead heat count
 * - Financial payout, profit, and bucket breakdown
 * - Cryptographic authorization details
 */

import { resolveMarketContract } from './marketSettlementContract.mjs';
import { parsePlacementSnapshot } from './placementContext.mjs';
import { roundAuthoritativeMoney } from './financialPrecision.mjs';

/**
 * Construct an explainable, structured settlement decision trace.
 * @param {object} params
 * @param {object} params.bet
 * @param {object} params.match
 * @param {object} params.evaluatedLeg
 * @param {object} params.financialResult
 * @param {object} params.authorization
 * @returns {object} SettlementDecisionTrace
 */
export function buildSettlementDecisionTrace({
  bet = {},
  match = {},
  evaluatedLeg = {},
  financialResult = {},
  authorization = null,
}) {
  const betId = bet.bet_id || bet.id || 'unknown_bet';
  const marketId = bet.market_id || evaluatedLeg.marketId || '';
  const selectionId = bet.selection_id || evaluatedLeg.selectionId || '';
  const selectionName = bet.selection_name || evaluatedLeg.selectionName || '';
  const contract = resolveMarketContract(marketId);
  const placementSnapshot = parsePlacementSnapshot(bet);

  const stake = roundAuthoritativeMoney(bet.stake || 0);
  const payout = roundAuthoritativeMoney(financialResult.payout ?? (evaluatedLeg.outcome === 'WON' ? bet.potential_payout : (evaluatedLeg.outcome === 'VOID' ? stake : 0)));
  const profit = roundAuthoritativeMoney(payout - stake);

  return {
    traceId: `trc_${betId}_${Date.now()}`,
    timestamp: new Date().toISOString(),
    bet: {
      betId,
      userId: bet.user_id || 'unknown_user',
      marketId,
      selectionId,
      selectionName,
      stake,
      acceptedOdds: Number(bet.accepted_odds || bet.odds || 1.0),
      status: evaluatedLeg.outcome || bet.status || 'UNKNOWN',
    },
    placementContext: {
      frozenAt: placementSnapshot?.capturedAt || bet.created_at || null,
      stateVersionAtPlacement: placementSnapshot?.stateVersionAtPlacement ?? null,
      lineAtPlacement: placementSnapshot?.legs?.[0]?.line ?? null,
      marketInstance: placementSnapshot?.legs?.[0]?.marketInstance ?? null,
    },
    contract: {
      name: contract?.name || 'Unknown Market',
      sport: contract?.sport || 'all',
      settlementTiming: contract?.settlementTiming || 'MATCH_COMPLETE',
      resolver: contract?.resolver || 'unknown_resolver',
      voidPolicy: contract?.voidPolicy || 'STANDARD_VOID',
    },
    evidence: {
      matchId: match.id || match.matchId || bet.match_id,
      matchStatus: match.status || match.matchState || 'COMPLETED',
      team1: { name: match.team1?.name, runs: match.team1?.runs, fours: match.team1?.fours, sixes: match.team1?.sixes, wickets: match.team1?.wickets },
      team2: { name: match.team2?.name, runs: match.team2?.runs, fours: match.team2?.fours, sixes: match.team2?.sixes, wickets: match.team2?.wickets },
      winner: match.winner || match.winnerSide || null,
      isTie: Boolean(match.winnerSide === 'tie' || (Number(match.team1?.runs) > 0 && match.team1?.runs === match.team2?.runs)),
    },
    ruleEvaluation: {
      outcome: evaluatedLeg.outcome || 'UNKNOWN',
      reason: evaluatedLeg.reason || 'standard_settlement',
      deadHeatCount: evaluatedLeg.deadHeatCount || 1,
      isPush: evaluatedLeg.outcome === 'VOID' && evaluatedLeg.reason?.includes('push'),
    },
    financialExecution: {
      currency: 'INR',
      stake,
      grossPayout: payout,
      netProfit: profit,
      fundSource: bet.fund_source || 'cash',
      credits: {
        cashCredit: roundAuthoritativeMoney(financialResult.cashCredit ?? (bet.fund_source === 'cash' ? payout : 0)),
        bonusCredit: roundAuthoritativeMoney(financialResult.bonusCredit ?? (bet.fund_source === 'bonus' ? payout : 0)),
        winningsCredit: roundAuthoritativeMoney(financialResult.winningsCredit ?? Math.max(0, profit)),
      },
    },
    authorization: {
      authorizationId: authorization?.authorizationId || 'auth_inline',
      confidenceState: authorization?.confidenceState || 'CONFIRMED',
      evidenceHash: authorization?.evidenceHash || null,
      authorizedAt: authorization?.authorizedAt || new Date().toISOString(),
    },
  };
}

/**
 * Format human-readable settlement decision explanation.
 * @param {object} trace
 * @returns {string}
 */
export function formatDecisionTraceSummary(trace) {
  return [
    `=== SETTLEMENT DECISION TRACE: ${trace.traceId} ===`,
    `Bet: ${trace.bet.betId} | Market: ${trace.bet.marketId} (${trace.contract.name})`,
    `Selection: ${trace.bet.selectionName} | Odds: ${trace.bet.acceptedOdds} | Stake: ₹${trace.bet.stake.toFixed(2)}`,
    `Outcome: ${trace.ruleEvaluation.outcome} (Reason: ${trace.ruleEvaluation.reason})`,
    `Timing: ${trace.contract.settlementTiming} | Dead Heat Count: ${trace.ruleEvaluation.deadHeatCount}`,
    `Financials: Gross Payout ₹${trace.financialExecution.grossPayout.toFixed(2)} | Net Profit ₹${trace.financialExecution.netProfit.toFixed(2)}`,
    `Auth: ${trace.authorization.authorizationId} (${trace.authorization.confidenceState})`,
  ].join('\n');
}
