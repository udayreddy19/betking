#!/usr/bin/env node
/**
 * Read-only audit of winnings reporting vs bets / ledger.
 *
 * Usage:
 *   node scripts/audit-winnings-reporting.mjs
 *   node scripts/audit-winnings-reporting.mjs --user=usr_xxx
 *   node scripts/audit-winnings-reporting.mjs --user=usr_xxx --repair-winnings-reporting --actor=admin@x --reason='ticket'
 *
 * --repair-winnings-reporting recalculates wallets.winnings_balance from settled bets only.
 * It NEVER changes wallets.balance or ledger rows.
 */

import { query } from '../db/pg.js';
import { recalculateCumulativeWinningsForUser } from '../lib/walletSettlement.mjs';
import { computeBetProfit } from '../lib/wageringRules.mjs';

function parseArg(name) {
  const flag = process.argv.find((a) => a.startsWith(`--${name}=`));
  return flag ? flag.split('=').slice(1).join('=') : null;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

async function auditUser(userId) {
  const wRes = await query(
    `SELECT wallet_id, user_id, balance, COALESCE(winnings_balance,0) AS winnings_balance
     FROM wallets WHERE user_id = $1`,
    [userId],
  );
  if (!wRes.rows.length) return null;
  const wallet = wRes.rows[0];

  const bets = await query(
    `SELECT bet_id, status, stake, odds, accepted_odds, actual_payout, winnings_credited, settled_at
     FROM bets
     WHERE user_id = $1
       AND UPPER(status) IN ('WON','LOST','VOID','CASHED_OUT','SETTLED')
     ORDER BY settled_at NULLS LAST, created_at`,
    [userId],
  );

  const rows = [];
  let expectedWinnings = 0;
  for (const b of bets.rows) {
    const status = String(b.status || '').toUpperCase();
    const stake = Number(b.stake) || 0;
    const payout = b.actual_payout == null ? null : Number(b.actual_payout);
    const credited = b.winnings_credited == null ? null : Number(b.winnings_credited);
    let expectedProfit = null;
    if (status === 'WON' && payout != null) {
      expectedProfit = computeBetProfit(payout, stake);
      expectedWinnings += expectedProfit;
    } else if (status === 'LOST') {
      expectedProfit = -stake;
      expectedWinnings += expectedProfit;
    } else if (status === 'VOID') {
      expectedProfit = 0;
    } else if (status === 'CASHED_OUT' && payout != null) {
      expectedProfit = computeBetProfit(payout, stake);
      expectedWinnings += expectedProfit;
    }

    const payoutTx = await query(
      `SELECT transaction_id, type, amount, status FROM transactions
       WHERE transaction_id = $1 OR transaction_id = $2
       LIMIT 5`,
      [`tx_payout_${b.bet_id}`, `tx_cashout_${b.bet_id}`],
    );

    // transactions may not have description — fall back to ledger
    const ledger = await query(
      `SELECT type, amount, description FROM ledger_entries
       WHERE wallet_id = $1 AND description ILIKE $2
       ORDER BY created_at`,
      [wallet.wallet_id, `%${b.bet_id}%`],
    );

    const issues = [];
    if (status === 'WON' && (payout == null || Number.isNaN(payout))) {
      issues.push('NULL_ACTUAL_PAYOUT');
    }
    if (status === 'WON' && payout != null && credited != null
      && Math.abs(credited - expectedProfit) > 0.02) {
      issues.push('WINNINGS_CREDITED_MISMATCH');
    }
    if (status === 'WON' && payout != null) {
      const credit = ledger.rows.find((r) => r.type === 'CREDIT');
      if (!credit) issues.push('MISSING_PAYOUT_LEDGER_CREDIT');
      else if (Math.abs(Number(credit.amount) - payout) > 0.02) {
        issues.push('PAYOUT_LEDGER_AMOUNT_MISMATCH');
      }
    }

    rows.push({
      betId: b.bet_id,
      status,
      stake,
      odds: b.accepted_odds ?? b.odds,
      actualPayout: payout,
      winningsCredited: credited,
      expectedProfit,
      payoutTransactions: payoutTx.rows,
      ledgerEntries: ledger.rows,
      issues,
    });
  }

  const storedWinnings = Number(wallet.winnings_balance);
  const reportingDelta = parseFloat((storedWinnings - expectedWinnings).toFixed(2));

  return {
    userId,
    walletId: wallet.wallet_id,
    balance: Number(wallet.balance),
    storedWinnings,
    expectedWinnings: parseFloat(expectedWinnings.toFixed(2)),
    reportingDelta,
    betsWithIssues: rows.filter((r) => r.issues.length > 0),
    bets: rows,
  };
}

async function main() {
  const userId = parseArg('user');
  const repair = hasFlag('repair-winnings-reporting');
  const actor = parseArg('actor');
  const reason = parseArg('reason');

  if (repair && (!userId || !actor || !reason)) {
    console.error(JSON.stringify({
      error: '--repair-winnings-reporting requires --user= --actor= --reason=',
    }));
    process.exit(1);
  }

  if (!userId) {
    const flagged = await query(
      `SELECT b.user_id, COUNT(*)::int AS won_null_payout
       FROM bets b
       WHERE UPPER(b.status) = 'WON' AND b.actual_payout IS NULL
       GROUP BY b.user_id
       ORDER BY won_null_payout DESC
       LIMIT 50`,
    );
    console.log(JSON.stringify({
      event: 'WINNINGS_REPORTING_SCAN',
      usersWithNullActualPayoutOnWon: flagged.rows,
    }, null, 2));
    process.exit(0);
  }

  const before = await auditUser(userId);
  if (!before) {
    console.error(JSON.stringify({ error: 'wallet_not_found', userId }));
    process.exit(1);
  }
  console.log(JSON.stringify({ event: 'WINNINGS_REPORTING_AUDIT', ...before }, null, 2));

  if (repair) {
    const balanceBefore = before.balance;
    const result = await recalculateCumulativeWinningsForUser(userId);
    const after = await auditUser(userId);
    if (Math.abs(after.balance - balanceBefore) > 0.001) {
      console.error(JSON.stringify({
        error: 'BALANCE_MUTATED_UNEXPECTEDLY',
        balanceBefore,
        balanceAfter: after.balance,
      }));
      process.exit(1);
    }
    console.log(JSON.stringify({
      event: 'WINNINGS_REPORTING_REPAIRED',
      actor,
      reason,
      timestamp: new Date().toISOString(),
      repair: result,
      after,
      balanceUnchanged: true,
    }, null, 2));
  }

  const hasIssues = (before.betsWithIssues?.length || 0) > 0 || Math.abs(before.reportingDelta) > 0.02;
  process.exit(hasIssues && !repair ? 2 : 0);
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
