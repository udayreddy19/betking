/**
 * Admin declare / redeclare bet outcome (Win / Lose / Void).
 * Open bets settle normally. Settled bets claw back prior credits, reopen, then settle again.
 */

import { query, withTransaction } from '../db/pg.js';
import { betSettlementEngine } from './betSettlementEngine.mjs';
import { splitSettlementWinCredits, voidRefundCredits } from './walletSettlement.mjs';
import { settlementNetProfitDelta } from './wageringRules.mjs';
import { logSettlement } from './settlement/settlementAudit.mjs';

const OPEN = new Set(['OPEN', 'PENDING', 'ACCEPTED']);
const REDECLARABLE = new Set(['WON', 'LOST', 'VOID', 'REFUNDED', 'SETTLED']);
const BLOCKED = new Set(['CASHED_OUT']);

export function normalizeAdminOutcome(outcome) {
  const n = String(outcome || '').toUpperCase();
  if (n === 'WON' || n === 'WIN') return 'WON';
  if (n === 'LOST' || n === 'LOSE' || n === 'LOSS') return 'LOST';
  if (n === 'VOID' || n === 'PUSH' || n === 'REFUND' || n === 'REFUNDED') return 'VOID';
  return null;
}

function normalizePriorOutcome(bet) {
  const s = String(bet.status || '').toUpperCase();
  if (s === 'WON' || s === 'LOST' || s === 'VOID') return s;
  if (s === 'REFUNDED') return 'VOID';
  if (s === 'SETTLED') {
    const payout = Number(bet.actual_payout);
    const stake = Number(bet.stake) || 0;
    if (Number.isFinite(payout) && payout > stake + 0.001) return 'WON';
    if (Number.isFinite(payout) && Math.abs(payout - stake) < 0.02) return 'VOID';
    return 'LOST';
  }
  return s;
}

/**
 * Reverse wallet effects of a prior settlement so the bet can be reopened.
 * Cash/bonus/freebet/locked debits floor at 0; outstanding cash is returned for audit.
 */
async function clawbackPriorSettlement(client, bet, adminId) {
  const prior = normalizePriorOutcome(bet);
  const stake = Number(bet.stake) || 0;
  const payout = Number(bet.actual_payout) || 0;
  const fundSource = String(bet.fund_source || 'cash').toLowerCase();

  let cashDebit = 0;
  let bonusDebit = 0;
  let freebetDebit = 0;
  let lockedDebit = 0;
  let winningsDelta = 0;

  if (prior === 'WON' && payout > 0) {
    const split = splitSettlementWinCredits(bet, payout);
    cashDebit = Number(split.cashCredit) || 0;
    bonusDebit = Number(split.bonusCredit) || 0;
    freebetDebit = Number(split.freebetCredit) || 0;
    winningsDelta = -(Number(split.winningsCredit) || 0);
  } else if (prior === 'VOID') {
    const refund = voidRefundCredits(bet);
    cashDebit = Number(refund.balanceCredit) || 0;
    bonusDebit = Number(refund.bonusCredit) || 0;
    freebetDebit = Number(refund.freebetCredit) || 0;
    lockedDebit = Number(refund.lockedCredit) || 0;
    winningsDelta = -(Number(refund.winningsCredit) || 0);
  } else if (prior === 'LOST' && fundSource === 'cash') {
    // Settlement applied −stake to cumulative winnings; reverse that reporting delta.
    winningsDelta = -settlementNetProfitDelta('LOST', 0, stake);
  }

  const needsWallet =
    cashDebit > 0
    || bonusDebit > 0
    || freebetDebit > 0
    || lockedDebit > 0
    || winningsDelta !== 0;

  let outstandingCash = 0;
  let recoveredCash = 0;

  if (!needsWallet) {
    return { prior, recoveredCash: 0, outstandingCash: 0, clawbackTxId: null };
  }

  const walletRes = await client.query(
    `SELECT wallet_id, balance, bonus_balance,
            COALESCE(freebet_balance, 0) AS freebet_balance,
            COALESCE(locked_deposit_balance, 0) AS locked_deposit_balance,
            COALESCE(winnings_balance, 0) AS winnings_balance
     FROM wallets WHERE user_id = $1 FOR UPDATE`,
    [bet.user_id],
  );
  if (!walletRes.rows[0]) throw new Error('WALLET_NOT_FOUND');
  const wallet = walletRes.rows[0];

  const bal = Number(wallet.balance || 0);
  recoveredCash = Math.min(cashDebit, Math.max(0, bal));
  outstandingCash = parseFloat((cashDebit - recoveredCash).toFixed(2));

  const nextCash = parseFloat((bal - recoveredCash).toFixed(2));
  const nextBonus = parseFloat(Math.max(0, Number(wallet.bonus_balance || 0) - bonusDebit).toFixed(2));
  const nextFreebet = parseFloat(Math.max(0, Number(wallet.freebet_balance || 0) - freebetDebit).toFixed(2));
  const nextLocked = parseFloat(Math.max(0, Number(wallet.locked_deposit_balance || 0) - lockedDebit).toFixed(2));
  const nextWinnings = parseFloat((Number(wallet.winnings_balance || 0) + winningsDelta).toFixed(2));

  await client.query(
    `UPDATE wallets
     SET balance = $1, bonus_balance = $2, freebet_balance = $3,
         locked_deposit_balance = $4, winnings_balance = $5, updated_at = NOW()
     WHERE wallet_id = $6`,
    [nextCash, nextBonus, nextFreebet, nextLocked, nextWinnings, wallet.wallet_id],
  );

  const version = Number(bet.settlement_version) || 1;
  const clawbackTxId = `tx_clawback_${bet.bet_id}_v${version}`;
  const debitAmount = parseFloat((recoveredCash + bonusDebit + freebetDebit).toFixed(2));

  if (debitAmount > 0 || outstandingCash > 0) {
    await client.query(
      `INSERT INTO transactions (transaction_id, user_id, type, amount, status, created_at)
       VALUES ($1, $2, 'SETTLEMENT_REVERSAL', $3, 'SUCCESS', NOW())
       ON CONFLICT (transaction_id) DO NOTHING`,
      [clawbackTxId, bet.user_id, Math.max(debitAmount, outstandingCash)],
    );
    if (recoveredCash > 0 || bonusDebit > 0 || freebetDebit > 0) {
      await client.query(
        `INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description, created_at)
         VALUES ($1, $2, 'DEBIT', $3, $4, $5, NOW())`,
        [
          wallet.wallet_id,
          clawbackTxId,
          Math.max(recoveredCash, bonusDebit, freebetDebit),
          nextCash,
          `Admin redeclare clawback ${prior} for bet ${bet.bet_id} by ${adminId}`
            + (outstandingCash > 0 ? ` (outstanding ₹${outstandingCash.toFixed(2)})` : ''),
        ],
      );
    }
  }

  return { prior, recoveredCash, outstandingCash, clawbackTxId };
}

async function reopenBetForResettle(client, bet, reason) {
  await client.query(
    `UPDATE bets
     SET status = 'ACCEPTED',
         settled_at = NULL,
         actual_payout = NULL,
         winnings_credited = NULL,
         settlement_reason = $2
     WHERE bet_id = $1`,
    [bet.bet_id, `reopened_for_admin_redeclare; ${reason || ''}`.slice(0, 500)],
  );
  await client.query(
    `UPDATE bet_selections SET status = 'PENDING' WHERE bet_id = $1`,
    [bet.bet_id],
  );
}

/**
 * Declare outcome for an open bet, or redeclare a settled (non-cashout) bet.
 */
export async function adminDeclareBetOutcome({
  betId,
  outcome,
  reason = '',
  adminId = 'admin',
  correlationId = null,
} = {}) {
  const forcedOutcome = normalizeAdminOutcome(outcome);
  if (!betId || !forcedOutcome) {
    throw Object.assign(new Error('betId and outcome (WON|LOST|VOID) required'), { status: 400 });
  }

  const betRes = await query('SELECT * FROM bets WHERE bet_id = $1', [betId]);
  if (!betRes.rows.length) {
    throw Object.assign(new Error('Bet not found'), { status: 404 });
  }
  const bet = betRes.rows[0];
  const priorRaw = String(bet.status || '').toUpperCase();
  const adminReason = String(reason || '').trim().slice(0, 240)
    || `Admin manual settlement by ${adminId}`;

  if (BLOCKED.has(priorRaw)) {
    throw Object.assign(
      new Error('CASHED_OUT bets cannot be redeclared from Bet Registry'),
      { status: 400 },
    );
  }

  if (OPEN.has(priorRaw)) {
    const result = await betSettlementEngine.settleSingleBet({
      betId,
      matchState: {
        matchId: bet.match_id,
        status: 'COMPLETED',
        __forcedOutcome: forcedOutcome,
        __bypassAuth: true,
        __settlementReason: adminReason,
      },
    }, correlationId);
    return {
      success: true,
      betId,
      priorStatus: priorRaw,
      outcome: result?.outcome || forcedOutcome,
      status: result?.status === 'ALREADY_SETTLED' ? 'ALREADY_SETTLED' : `SETTLED_${forcedOutcome}`,
      payout: result?.payout,
      redeclared: false,
    };
  }

  if (!REDECLARABLE.has(priorRaw)) {
    throw Object.assign(new Error(`Bet status ${priorRaw} cannot be declared`), { status: 400 });
  }

  const priorOutcome = normalizePriorOutcome(bet);
  if (priorOutcome === forcedOutcome) {
    return {
      success: true,
      betId,
      priorStatus: priorRaw,
      outcome: forcedOutcome,
      status: 'ALREADY_SETTLED',
      payout: Number(bet.actual_payout) || 0,
      redeclared: false,
    };
  }

  const claw = await withTransaction(async (client) => {
    const lock = await client.query('SELECT * FROM bets WHERE bet_id = $1 FOR UPDATE', [betId]);
    const locked = lock.rows[0];
    if (!locked) throw new Error('BET_NOT_FOUND');
    const lockedStatus = String(locked.status || '').toUpperCase();
    if (OPEN.has(lockedStatus)) {
      return { skipped: true };
    }
    if (BLOCKED.has(lockedStatus)) {
      throw new Error('CASHED_OUT bets cannot be redeclared from Bet Registry');
    }
    if (!REDECLARABLE.has(lockedStatus)) {
      throw new Error(`Bet status ${lockedStatus} cannot be declared`);
    }
    if (normalizePriorOutcome(locked) === forcedOutcome) {
      return { skipped: true, sameOutcome: true };
    }

    const clawMeta = await clawbackPriorSettlement(client, locked, adminId);
    await reopenBetForResettle(client, locked, adminReason);

    try {
      const correctionId = `sc_redeclare_${betId}_${Date.now()}`;
      await client.query(
        `INSERT INTO settlement_corrections (
           correction_id, bet_id, prior_result, new_result, prior_payout, adjustment_amount,
           status, notes, requested_by, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, 'REVERSED', $7, $8, NOW())
         ON CONFLICT DO NOTHING`,
        [
          correctionId,
          betId,
          clawMeta.prior,
          forcedOutcome,
          Number(locked.actual_payout) || 0,
          clawMeta.recoveredCash,
          `${adminReason}; outstanding=${clawMeta.outstandingCash}`.slice(0, 500),
          adminId,
        ],
      );
    } catch {
      // audit row best-effort
    }

    logSettlement('ADMIN_BET_REDECLARE_REOPEN', {
      betId,
      from: clawMeta.prior,
      to: forcedOutcome,
      adminId,
      recoveredCash: clawMeta.recoveredCash,
      outstandingCash: clawMeta.outstandingCash,
    });

    return clawMeta;
  });

  if (claw?.sameOutcome) {
    return {
      success: true,
      betId,
      priorStatus: priorRaw,
      outcome: forcedOutcome,
      status: 'ALREADY_SETTLED',
      redeclared: false,
    };
  }

  const result = await betSettlementEngine.settleSingleBet({
    betId,
    matchState: {
      matchId: bet.match_id,
      status: 'COMPLETED',
      __forcedOutcome: forcedOutcome,
      __bypassAuth: true,
      __settlementReason: `redeclared ${priorOutcome}→${forcedOutcome}; ${adminReason}`.slice(0, 500),
    },
  }, correlationId);

  return {
    success: true,
    betId,
    priorStatus: priorRaw,
    priorOutcome,
    outcome: result?.outcome || forcedOutcome,
    status: result?.status === 'ALREADY_SETTLED' ? 'ALREADY_SETTLED' : `SETTLED_${forcedOutcome}`,
    payout: result?.payout,
    redeclared: true,
    recoveredCash: claw?.recoveredCash ?? 0,
    outstandingCash: claw?.outstandingCash ?? 0,
  };
}
