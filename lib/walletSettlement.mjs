/**
 * Server-side wallet credit/debit helpers aligned with frontend wageringRules.
 */

let _query = null;
async function dbQuery(...args) {
  if (!_query) {
    const pg = await import('../db/pg.js');
    _query = pg.query;
  }
  return _query(...args);
}
import { allocateCashStake, splitBetWinPayout, computeBetProfit } from './wageringRules.mjs';

export function walletViewFromRow(wallet) {
  return {
    balance: Number(wallet.balance || 0),
    lockedDepositBalance: Number(wallet.locked_deposit_balance || 0),
    winningsBalance: Number(wallet.winnings_balance || 0),
    bonusBalance: Number(wallet.bonus_balance || 0),
    freebetBalance: Number(wallet.freebet_balance || 0),
    reservedBalance: Number(wallet.reserved_balance || 0),
  };
}

export function allocateCashStakeForWallet(walletRow, cashAmount) {
  return allocateCashStake(walletViewFromRow(walletRow), cashAmount);
}

export function splitSettlementWinCredits(bet, payout) {
  const fundSource = String(bet.fund_source || 'cash').toLowerCase();
  const stake = Number(bet.stake) || 0;
  return splitBetWinPayout({
    payout,
    stake,
    fundSource,
    cashStake: fundSource === 'cash' ? stake : 0,
    bonusStake: fundSource === 'bonus' ? stake : 0,
    freebetStake: fundSource === 'freebet' ? stake : 0,
  });
}

export function voidRefundCredits(bet) {
  const fundSource = String(bet.fund_source || 'cash').toLowerCase();
  const stake = Number(bet.stake) || 0;
  if (fundSource === 'bonus') {
    return { balanceCredit: 0, bonusCredit: stake, freebetCredit: 0, lockedCredit: 0, winningsCredit: 0 };
  }
  if (fundSource === 'freebet') {
    return { balanceCredit: 0, bonusCredit: 0, freebetCredit: stake, lockedCredit: 0, winningsCredit: 0 };
  }
  // Placement always debits full stake from balance and may also reduce locked_deposit.
  // VOID must restore both: full stake → balance, locked portion → locked_deposit.
  const locked = Math.max(0, Number(bet.stake_from_locked || 0));
  return {
    balanceCredit: stake,
    bonusCredit: 0,
    freebetCredit: 0,
    lockedCredit: locked,
    winningsCredit: 0,
  };
}

/**
 * Repair cumulative net winnings when a settled bet recorded the wrong profit delta.
 * Does not modify wallet.balance — reporting field only.
 */
export async function repairUnderCreditedWinningsForBet(betId, client = null) {
  const run = client?.query?.bind(client) || dbQuery;
  const betRes = await run(
    `SELECT bet_id, user_id, stake, actual_payout, fund_source, status,
            COALESCE(winnings_credited, 0) AS winnings_credited
     FROM bets WHERE bet_id = $1`,
    [betId],
  );
  const bet = betRes.rows[0];
  const status = String(bet?.status || '').toUpperCase();
  if (!bet || !['WON', 'LOST'].includes(status)) {
    return { adjusted: 0, reason: 'not_terminal_cash_bet' };
  }
  if (String(bet.fund_source || 'cash').toLowerCase() !== 'cash') {
    return { adjusted: 0, reason: 'not_cash_funded' };
  }

  const stake = Number(bet.stake) || 0;
  const payout = Number(bet.actual_payout) || 0;
  const expected = status === 'WON'
    ? computeBetProfit(payout, stake)
    : parseFloat((-stake).toFixed(2));
  const recorded = Number(bet.winnings_credited);
  const inferredOld = Number.isFinite(recorded) && bet.winnings_credited != null
    ? recorded
    : (status === 'WON' ? Math.max(0, payout - stake) : -stake);
  const delta = parseFloat((expected - inferredOld).toFixed(2));
  if (Math.abs(delta) < 0.001) {
    return { adjusted: 0, reason: 'already_correct', expectedNetProfit: expected };
  }

  const walletRes = await run(
    `SELECT wallet_id, COALESCE(winnings_balance, 0) AS winnings_balance
     FROM wallets WHERE user_id = $1 FOR UPDATE`,
    [bet.user_id],
  );
  if (!walletRes.rows[0]) return { adjusted: 0, reason: 'no_wallet' };

  await run(
    `UPDATE wallets SET winnings_balance = winnings_balance + $1, updated_at = NOW()
     WHERE wallet_id = $2`,
    [delta, walletRes.rows[0].wallet_id],
  );

  await run(
    `UPDATE bets SET winnings_credited = $1 WHERE bet_id = $2`,
    [expected, betId],
  );

  const txId = `tx_repair_winnings_${betId}`;
  await run(
    `INSERT INTO transactions (transaction_id, user_id, type, amount, status, created_at)
     VALUES ($1, $2, 'ADJUSTMENT', $3, 'SUCCESS', NOW())
     ON CONFLICT (transaction_id) DO NOTHING`,
    [txId, bet.user_id, delta],
  );

  return {
    adjusted: delta,
    winningsBalance: parseFloat((Number(walletRes.rows[0].winnings_balance) + delta).toFixed(2)),
    expectedNetProfit: expected,
    priorNetProfit: inferredOld,
  };
}

/** Net profit delta for a single terminal bet (reporting only). */
export function netProfitDeltaForBet(bet) {
  const status = String(bet?.status || '').toUpperCase();
  const stake = Number(bet?.stake) || 0;
  const payout = Number(bet?.actual_payout) || 0;
  if (status === 'WON') {
    return splitSettlementWinCredits(bet, payout).winningsCredit;
  }
  if (status === 'LOST' && String(bet?.fund_source || 'cash').toLowerCase() === 'cash') {
    return parseFloat((-stake).toFixed(2));
  }
  if (status === 'CASHED_OUT' && payout > 0) {
    return computeBetProfit(payout, stake);
  }
  return 0;
}

/**
 * Rebuild cumulative winnings_balance from settled bets (reporting field only — never touches balance).
 */
export async function recalculateCumulativeWinningsForUser(userId, client = null) {
  const run = client?.query?.bind(client) || dbQuery;
  const betsRes = await run(
    `SELECT bet_id, status, stake, actual_payout, fund_source
     FROM bets
     WHERE user_id = $1 AND status IN ('WON', 'LOST', 'CASHED_OUT')`,
    [userId],
  );

  let total = 0;
  for (const bet of betsRes.rows) {
    const net = netProfitDeltaForBet(bet);
    total += net;
    await run(
      `UPDATE bets SET winnings_credited = $1 WHERE bet_id = $2`,
      [net, bet.bet_id],
    );
  }
  total = parseFloat(total.toFixed(2));

  const walletRes = await run(
    `SELECT wallet_id, COALESCE(winnings_balance, 0) AS winnings_balance
     FROM wallets WHERE user_id = $1 FOR UPDATE`,
    [userId],
  );
  if (!walletRes.rows[0]) {
    return { userId, adjusted: false, reason: 'no_wallet' };
  }

  const prior = parseFloat(walletRes.rows[0].winnings_balance);
  await run(
    `UPDATE wallets SET winnings_balance = $1, updated_at = NOW() WHERE wallet_id = $2`,
    [total, walletRes.rows[0].wallet_id],
  );

  return {
    userId,
    adjusted: Math.abs(total - prior) > 0.001,
    priorWinnings: prior,
    recalculatedWinnings: total,
    delta: parseFloat((total - prior).toFixed(2)),
    settledBets: betsRes.rows.length,
  };
}
