import { describe, it, expect } from 'vitest';
import { mapDbTypeToUiType, mapTransactionRow } from '../../lib/userTransactions.mjs';

describe('userTransactions mapping', () => {
  it('maps deposit as positive credit', () => {
    const tx = mapTransactionRow({
      transaction_id: 'pay_1',
      type: 'DEPOSIT',
      amount: '1500.00',
      method: 'UPI',
      utr: 'UTR123',
      status: 'SUCCESS',
      created_at: '2026-01-01T10:00:00.000Z',
    });
    expect(tx.type).toBe('deposit');
    expect(tx.amount).toBe(1500);
    expect(tx.id).toBe('pay_1');
  });

  it('maps withdrawal as negative debit', () => {
    const tx = mapTransactionRow({
      transaction_id: 'wd_1',
      type: 'WITHDRAWAL',
      amount: 500,
      status: 'PENDING',
      created_at: '2026-01-01T10:00:00.000Z',
    });
    expect(tx.type).toBe('withdraw');
    expect(tx.amount).toBe(-500);
  });

  it('maps bet stake and win types', () => {
    expect(mapDbTypeToUiType('BET_STAKE')).toBe('bet_stake');
    expect(mapDbTypeToUiType('BET_WIN')).toBe('bet_win');
    expect(mapTransactionRow({
      transaction_id: 'tx_win',
      type: 'BET_WIN',
      amount: 250,
      status: 'SUCCESS',
      created_at: '2026-01-01T10:00:00.000Z',
    }).amount).toBe(250);
  });

  it('maps VIP cashback as a positive credit', () => {
    expect(mapDbTypeToUiType('VIP_CASHBACK')).toBe('vip_cashback');
    expect(mapTransactionRow({
      transaction_id: 'tx_cb',
      type: 'VIP_CASHBACK',
      amount: 80,
      method: 'VIP',
      status: 'COMPLETED',
      created_at: '2026-01-01T10:00:00.000Z',
    }).amount).toBe(80);
  });

  it('does not append default UPI on bet/wallet txs', () => {
    const refund = mapTransactionRow({
      transaction_id: 'tx_payout_bet_1',
      type: 'BET_REFUND',
      amount: 500,
      method: 'UPI',
      status: 'COMPLETED',
      created_at: '2026-01-01T10:00:00.000Z',
    });
    expect(refund.type).toBe('refund');
    expect(refund.amount).toBe(500);
    expect(refund.label).toBe('Bet Refund');

    const win = mapTransactionRow({
      transaction_id: 'tx_payout_bet_2',
      type: 'BET_PAYOUT',
      amount: 19500,
      method: 'UPI',
      status: 'COMPLETED',
      created_at: '2026-01-01T10:00:00.000Z',
    });
    expect(win.label).toBe('Bet Win');
  });

  it('keeps UPI on deposits/withdrawals and source tags on bonuses', () => {
    expect(mapTransactionRow({
      transaction_id: 'dep_1',
      type: 'DEPOSIT',
      amount: 1000,
      method: 'UPI',
      status: 'COMPLETED',
      created_at: '2026-01-01T10:00:00.000Z',
    }).label).toBe('Deposit · UPI');

    expect(mapTransactionRow({
      transaction_id: 'tx_rev_wdr_1',
      type: 'WITHDRAWAL_REVERSAL',
      amount: 1000,
      method: 'UPI',
      status: 'SUCCESS',
      created_at: '2026-01-01T10:00:00.000Z',
    }).label).toBe('Withdrawal Reversal');

    expect(mapTransactionRow({
      transaction_id: 'tx_lr_1',
      type: 'BONUS_CLAIM',
      amount: 64.4,
      method: 'LOYALTY_REDEEM',
      status: 'COMPLETED',
      created_at: '2026-01-01T10:00:00.000Z',
    }).label).toBe('Bonus · LOYALTY_REDEEM');
  });
});
