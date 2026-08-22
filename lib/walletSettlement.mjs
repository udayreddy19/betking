/**
 * Server-side wallet credit/debit helpers aligned with frontend wageringRules.
 */

import { allocateCashStake, splitBetWinPayout } from './wageringRules.mjs';

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
  const locked = Number(bet.stake_from_locked || 0);
  const winnings = Number(bet.stake_from_winnings || 0);
  const fromCash = Number(bet.stake_from_cash || 0);
  const hasBucketSplit = locked > 0 || winnings > 0 || fromCash > 0;
  if (!hasBucketSplit) {
    return { balanceCredit: stake, bonusCredit: 0, freebetCredit: 0, lockedCredit: 0, winningsCredit: 0 };
  }
  return {
    balanceCredit: fromCash || Math.max(0, stake - locked - winnings),
    bonusCredit: 0,
    freebetCredit: 0,
    lockedCredit: locked,
    winningsCredit: winnings,
  };
}
