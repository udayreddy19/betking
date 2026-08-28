/**
 * AML (Anti-Money Laundering) Turnover & Velocity Monitor
 * 
 * Verifies that a player has wagered their deposit before requesting a withdrawal.
 * Regulatory / Anti-Fraud Requirement: Minimum 1.0x wagering turnover on deposits.
 */

import { query } from '../db/pg.js';

export const DEFAULT_AML_CONFIG = {
  minTurnoverMultiplier: 1.0, // 100% of deposits must be wagered
  flagOnLowTurnover: true,
  riskSeverity: 'HIGH',
};

/**
 * Assess AML turnover status for a withdrawal request
 * @param {string} userId
 * @param {number} requestedWithdrawalAmount
 * @param {object} customConfig
 */
export async function evaluateAmlTurnover(userId, requestedWithdrawalAmount = 0, customConfig = {}) {
  const config = { ...DEFAULT_AML_CONFIG, ...customConfig };

  if (!userId) {
    throw new Error('userId is required for AML turnover evaluation');
  }

  // 1. Calculate lifetime or recent deposits
  const depositRes = await query(
    `SELECT COALESCE(SUM(amount), 0) AS total_deposited,
            COUNT(*) AS deposit_count,
            MAX(created_at) AS last_deposit_at
     FROM transactions
     WHERE user_id = $1 AND (type = 'DEPOSIT' OR transaction_type = 'DEPOSIT')
       AND status = 'COMPLETED'`,
    [userId],
  );
  const totalDeposited = Number(depositRes.rows[0]?.total_deposited || 0);
  const depositCount = parseInt(depositRes.rows[0]?.deposit_count || 0, 10);

  // 2. Calculate total settled stakes wagered by user
  const wagerRes = await query(
    `SELECT COALESCE(SUM(stake), 0) AS total_wagered,
            COUNT(*) AS total_bets
     FROM bets
     WHERE user_id = $1 AND status IN ('WON', 'LOST', 'SETTLED', 'ACCEPTED')`,
    [userId],
  );
  const totalWagered = Number(wagerRes.rows[0]?.total_wagered || 0);
  const totalBets = parseInt(wagerRes.rows[0]?.total_bets || 0, 10);

  // 3. Compute turnover ratio
  const requiredTurnover = totalDeposited * config.minTurnoverMultiplier;
  const turnoverRatio = totalDeposited > 0 ? Number((totalWagered / totalDeposited).toFixed(2)) : 1.0;
  const isTurnoverSatisfied = totalWagered >= requiredTurnover;

  const flags = [];
  if (!isTurnoverSatisfied && totalDeposited > 0) {
    flags.push(`INSUFFICIENT_TURNOVER (Wagered ₹${totalWagered.toFixed(2)} / Required ₹${requiredTurnover.toFixed(2)} · Ratio ${turnoverRatio}x)`);
  }

  // Check rapid deposit-to-withdrawal turnaround (<30 minutes without betting)
  const lastDeposit = depositRes.rows[0]?.last_deposit_at;
  if (lastDeposit && totalBets === 0) {
    const elapsedMinutes = (Date.now() - new Date(lastDeposit).getTime()) / 60000;
    if (elapsedMinutes < 60) {
      flags.push('RAPID_ZERO_WAGERING_WITHDRAWAL_ATTEMPT');
    }
  }

  return {
    userId,
    totalDeposited,
    depositCount,
    totalWagered,
    totalBets,
    requiredTurnover,
    turnoverRatio,
    isCompliant: isTurnoverSatisfied && flags.length === 0,
    flags,
    requestedWithdrawalAmount: Number(requestedWithdrawalAmount || 0),
    evaluatedAt: new Date().toISOString(),
  };
}
