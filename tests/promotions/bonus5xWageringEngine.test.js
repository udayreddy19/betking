import { describe, it, expect, beforeEach } from 'vitest';
import { query, withTransaction } from '../../db/pg.js';
import { createPromotion, claimPromotionBonus } from '../../lib/promotionsEngine.mjs';
import { recordBonusWageringInTx } from '../../lib/promotionsEngine.mjs';
import { splitSettlementWinCredits, voidRefundCredits } from '../../lib/walletSettlement.mjs';
import { isQualifyingBonusOdds } from '../../lib/wageringRules.mjs';
import { financialReconciliationEngine } from '../../lib/financialReconciliationEngine.mjs';

describe('ODDSYRA — BONUS 5X WAGERING & ROLLOVER ENGINE SUITE', () => {
  const testUserId = 'usr_bonus_5x_spec_001';
  let promoCode = `PROMO_5X_SPEC_${Date.now()}`;

  async function insertTestBet({ betId, userId, stake, odds, payout, status, fundSource = 'bonus' }) {
    await query(
      `INSERT INTO bets (bet_id, user_id, stake, odds, potential_payout, actual_payout, fund_source, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [betId, userId, stake, odds, parseFloat((stake * odds).toFixed(2)), payout, fundSource, status]
    );
  }

  beforeEach(async () => {
    promoCode = `PROMO_5X_SPEC_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT (user_id) DO NOTHING;`, [testUserId, `${testUserId}@example.com`]);
    await query(`INSERT INTO user_profiles (user_id, account_status, kyc_status) VALUES ($1, 'ACTIVE', 'VERIFIED') ON CONFLICT (user_id) DO NOTHING;`, [testUserId]);
    await query(`INSERT INTO kyc_cases (case_id, user_id, status, pan_number, aadhaar_number, updated_at)
                 VALUES ($1, $2, 'VERIFIED', 'ABCDE1234F', '123456789012', NOW())
                 ON CONFLICT DO NOTHING;`, [`case_${testUserId}`, testUserId]);
    await query(`INSERT INTO wallets (wallet_id, user_id, balance, bonus_balance, locked_bonus_winnings, reserved_balance, currency)
                 VALUES ($1, $2, 5000.00, 0.00, 0.00, 0.00, 'INR')
                 ON CONFLICT (wallet_id) DO UPDATE SET balance = 5000.00, bonus_balance = 0.00, locked_bonus_winnings = 0.00, reserved_balance = 0.00;`,
                 [`wal_${testUserId}`, testUserId]);
    await query(`DELETE FROM bonus_wagering_ledger WHERE user_id = $1;`, [testUserId]);
    await query(`DELETE FROM user_bonuses WHERE user_id = $1;`, [testUserId]);
    await query(`DELETE FROM bets WHERE user_id = $1;`, [testUserId]);
    await query(`DELETE FROM ledger_entries WHERE wallet_id = $1;`, [`wal_${testUserId}`]);
    await query(`DELETE FROM transactions WHERE user_id = $1;`, [testUserId]);

    await query(`INSERT INTO deposits (id, deposit_id, user_id, order_id, amount, refunded_amount, status, created_at)
                 VALUES ($1, $1, $2, $1, 5000.00, 0.00, 'COMPLETED', NOW() - INTERVAL '3 hours')
                 ON CONFLICT DO NOTHING;`,
                 [`dep_${testUserId}_setup`, testUserId]);
    await query(`INSERT INTO transactions (transaction_id, user_id, type, amount, status)
                 VALUES ($1, $2, 'DEPOSIT', 2500.00, 'SUCCESS')`,
                 [`tx_dep_${testUserId}_${Date.now()}`, testUserId]);

    await createPromotion({
      name: '5x Rollover Test Promo',
      code: promoCode,
      type: 'DEPOSIT_BONUS',
      budget: 1000000.00,
      maxReward: 5000.00,
      wageringMultiplier: 5.0,
      minOdds: 1.75,
    });
  });

  it('1. Initial Grant: ₹2,500 bonus -> 5x multiplier -> ₹12,500 required turnover', async () => {
    const claim = await claimPromotionBonus({ userId: testUserId, promoCode, depositAmount: 2500.00 });
    expect(claim.rewardAmount).toBe(2500.00);
    expect(claim.wageringRequired).toBe(12500.00);
    expect(claim.status).toBe('ACTIVE');

    const dbBonus = await query('SELECT bonus_amount, wagering_required, wagering_completed FROM user_bonuses WHERE id = $1', [claim.bonusId]);
    expect(Number(dbBonus.rows[0].bonus_amount)).toBe(2500.00);
    expect(Number(dbBonus.rows[0].wagering_required)).toBe(12500.00);
    expect(Number(dbBonus.rows[0].wagering_completed)).toBe(0.00);
  });

  it('2. Qualifying Odds: 1.75 qualifies, but 1.74 does not qualify (Decimal-safe)', () => {
    expect(isQualifyingBonusOdds(1.75)).toBe(true);
    expect(isQualifyingBonusOdds(1.74)).toBe(false);
    expect(isQualifyingBonusOdds(1.80)).toBe(true);
    expect(isQualifyingBonusOdds(2.00)).toBe(true);
    expect(isQualifyingBonusOdds(3.50)).toBe(true);
    expect(isQualifyingBonusOdds(1.7499)).toBe(false);
  });

  it('3. Winning Calculation: ₹2,500 @ 1.75 WIN -> Payout ₹4,375 (Stake ₹2,500, Profit ₹1,875) -> Only ₹2,500 turnover', async () => {
    const claim = await claimPromotionBonus({ userId: testUserId, promoCode, depositAmount: 2500.00 });
    const betId = `bet_win_1_${Date.now()}`;
    await insertTestBet({ betId, userId: testUserId, stake: 2500.00, odds: 1.75, payout: 4375.00, status: 'WON' });

    const credits = splitSettlementWinCredits({ stake: 2500.00, fund_source: 'bonus' }, 4375.00);
    expect(credits.cashCredit).toBe(0); // Withdrawable cash is 0!
    expect(credits.bonusCredit).toBe(2500.00); // Original bonus principal returned
    expect(credits.lockedBonusWinningsCredit).toBe(1875.00); // Profit locked

    // Process transactional wagering
    const wagResult = await withTransaction(async (client) => {
      return await recordBonusWageringInTx(client, {
        userId: testUserId,
        betId,
        stake: 2500.00,
        odds: 1.75,
        outcome: 'WON',
        profit: 1875.00,
      });
    });

    expect(wagResult.applied).toBe(true);
    expect(wagResult.qualifyingAmount).toBe(2500.00); // NOT 4375!
    expect(wagResult.wageringCompleted).toBe(2500.00);
    expect(wagResult.remainingWagering).toBe(10000.00);
    expect(wagResult.isCompleted).toBe(false);

    // Verify ledger
    const ledger = await query('SELECT * FROM bonus_wagering_ledger WHERE bet_id = $1', [betId]);
    expect(ledger.rows.length).toBe(1);
    expect(Number(ledger.rows[0].stake_amount)).toBe(2500.00);
    expect(Number(ledger.rows[0].qualifying_amount)).toBe(2500.00);
    expect(Number(ledger.rows[0].remaining_after)).toBe(10000.00);
    expect(ledger.rows[0].status).toBe('APPLIED');
  });

  it('4. Sub-Odds Bet: ₹2,500 @ 1.74 WIN does NOT contribute to turnover', async () => {
    const claim = await claimPromotionBonus({ userId: testUserId, promoCode, depositAmount: 2500.00 });
    const betId = `bet_low_odds_${Date.now()}`;
    await insertTestBet({ betId, userId: testUserId, stake: 2500.00, odds: 1.74, payout: 4350.00, status: 'WON' });

    const wagResult = await withTransaction(async (client) => {
      return await recordBonusWageringInTx(client, {
        userId: testUserId,
        betId,
        stake: 2500.00,
        odds: 1.74,
        outcome: 'WON',
        profit: 1850.00,
      });
    });

    expect(wagResult.applied).toBe(true);
    expect(wagResult.qualifyingAmount).toBe(0.00);
    expect(wagResult.wageringCompleted).toBe(0.00);
    expect(wagResult.remainingWagering).toBe(12500.00);

    const ledger = await query('SELECT status FROM bonus_wagering_ledger WHERE bet_id = $1', [betId]);
    expect(ledger.rows[0].status).toBe('REJECTED_ODDS');
  });

  it('5. Lost Bonus Bet: ₹2,500 @ 1.75 LOSS still contributes ₹2,500 turnover', async () => {
    const claim = await claimPromotionBonus({ userId: testUserId, promoCode, depositAmount: 2500.00 });
    const betId = `bet_loss_${Date.now()}`;
    await insertTestBet({ betId, userId: testUserId, stake: 2500.00, odds: 1.75, payout: 0.00, status: 'LOST' });

    const wagResult = await withTransaction(async (client) => {
      return await recordBonusWageringInTx(client, {
        userId: testUserId,
        betId,
        stake: 2500.00,
        odds: 1.75,
        outcome: 'LOST',
        profit: 0,
      });
    });

    expect(wagResult.applied).toBe(true);
    expect(wagResult.qualifyingAmount).toBe(2500.00);
    expect(wagResult.wageringCompleted).toBe(2500.00);
    expect(wagResult.remainingWagering).toBe(10000.00);
    expect(wagResult.isCompleted).toBe(false);
  });

  it('6. Void Bet: Stake restored, zero turnover contribution', async () => {
    const claim = await claimPromotionBonus({ userId: testUserId, promoCode, depositAmount: 2500.00 });
    const betId = `bet_void_${Date.now()}`;
    await insertTestBet({ betId, userId: testUserId, stake: 2500.00, odds: 1.75, payout: 2500.00, status: 'VOID' });

    const refund = voidRefundCredits({ stake: 2500.00, fund_source: 'bonus' });
    expect(refund.bonusCredit).toBe(2500.00);
    expect(refund.balanceCredit).toBe(0);

    const wagResult = await withTransaction(async (client) => {
      return await recordBonusWageringInTx(client, {
        userId: testUserId,
        betId,
        stake: 2500.00,
        odds: 1.75,
        outcome: 'VOID',
        profit: 0,
      });
    });

    expect(wagResult.applied).toBe(true);
    expect(wagResult.qualifyingAmount).toBe(0.00);
    expect(wagResult.wageringCompleted).toBe(0.00);

    const ledger = await query('SELECT status FROM bonus_wagering_ledger WHERE bet_id = $1', [betId]);
    expect(ledger.rows[0].status).toBe('VOID_NO_TURNOVER');
  });

  it('7. End-to-End: Five qualifying ₹2,500 bets complete 5x rollover (₹12,500) and release profit to cash', async () => {
    const claim = await claimPromotionBonus({ userId: testUserId, promoCode, depositAmount: 2500.00 });
    const initialWallet = await query('SELECT balance, bonus_balance, locked_bonus_winnings FROM wallets WHERE user_id = $1', [testUserId]);
    const initialCash = Number(initialWallet.rows[0].balance);

    // Bet 1: ₹2,500 @ 1.75 WIN -> Profit ₹1,875 (Turnover: ₹2,500 / ₹12,500)
    const bet1 = `bet_e2e_1_${Date.now()}`;
    await insertTestBet({ betId: bet1, userId: testUserId, stake: 2500.00, odds: 1.75, payout: 4375.00, status: 'WON' });
    await query(`UPDATE wallets SET locked_bonus_winnings = locked_bonus_winnings + 1875.00 WHERE user_id = $1`, [testUserId]);
    const r1 = await withTransaction((client) => recordBonusWageringInTx(client, { userId: testUserId, betId: bet1, stake: 2500.00, odds: 1.75, outcome: 'WON', profit: 1875.00 }));
    expect(r1.wageringCompleted).toBe(2500.00);
    expect(r1.remainingWagering).toBe(10000.00);
    expect(r1.isCompleted).toBe(false);

    // Bet 2: ₹2,500 @ 1.80 WIN -> Profit ₹2,000 (Turnover: ₹5,000 / ₹12,500)
    const bet2 = `bet_e2e_2_${Date.now()}`;
    await insertTestBet({ betId: bet2, userId: testUserId, stake: 2500.00, odds: 1.80, payout: 4500.00, status: 'WON' });
    await query(`UPDATE wallets SET locked_bonus_winnings = locked_bonus_winnings + 2000.00 WHERE user_id = $1`, [testUserId]);
    const r2 = await withTransaction((client) => recordBonusWageringInTx(client, { userId: testUserId, betId: bet2, stake: 2500.00, odds: 1.80, outcome: 'WON', profit: 2000.00 }));
    expect(r2.wageringCompleted).toBe(5000.00);
    expect(r2.remainingWagering).toBe(7500.00);
    expect(r2.isCompleted).toBe(false);

    // Bet 3: ₹2,500 @ 1.75 LOSS (Turnover: ₹7,500 / ₹12,500)
    const bet3 = `bet_e2e_3_${Date.now()}`;
    await insertTestBet({ betId: bet3, userId: testUserId, stake: 2500.00, odds: 1.75, payout: 0.00, status: 'LOST' });
    const r3 = await withTransaction((client) => recordBonusWageringInTx(client, { userId: testUserId, betId: bet3, stake: 2500.00, odds: 1.75, outcome: 'LOST', profit: 0 }));
    expect(r3.wageringCompleted).toBe(7500.00);
    expect(r3.remainingWagering).toBe(5000.00);
    expect(r3.isCompleted).toBe(false);

    // Bet 4: ₹2,500 @ 1.90 WIN -> Profit ₹2,250 (Turnover: ₹10,000 / ₹12,500)
    const bet4 = `bet_e2e_4_${Date.now()}`;
    await insertTestBet({ betId: bet4, userId: testUserId, stake: 2500.00, odds: 1.90, payout: 4750.00, status: 'WON' });
    await query(`UPDATE wallets SET locked_bonus_winnings = locked_bonus_winnings + 2250.00 WHERE user_id = $1`, [testUserId]);
    const r4 = await withTransaction((client) => recordBonusWageringInTx(client, { userId: testUserId, betId: bet4, stake: 2500.00, odds: 1.90, outcome: 'WON', profit: 2250.00 }));
    expect(r4.wageringCompleted).toBe(10000.00);
    expect(r4.remainingWagering).toBe(2500.00);
    expect(r4.isCompleted).toBe(false);

    // Bet 5: ₹2,500 @ 1.75 WIN -> Profit ₹1,875 (Turnover: ₹12,500 / ₹12,500 -> COMPLETED!)
    const bet5 = `bet_e2e_5_${Date.now()}`;
    await insertTestBet({ betId: bet5, userId: testUserId, stake: 2500.00, odds: 1.75, payout: 4375.00, status: 'WON' });
    await query(`UPDATE wallets SET locked_bonus_winnings = locked_bonus_winnings + 1875.00 WHERE user_id = $1`, [testUserId]);
    const r5 = await withTransaction((client) => recordBonusWageringInTx(client, { userId: testUserId, betId: bet5, stake: 2500.00, odds: 1.75, outcome: 'WON', profit: 1875.00 }));
    expect(r5.wageringCompleted).toBe(12500.00);
    expect(r5.remainingWagering).toBe(0.00);
    expect(r5.isCompleted).toBe(true);

    // Total accumulated profit from winning bets: 1875 + 2000 + 2250 + 1875 = 8000
    expect(r5.releasedAmount).toBe(8000.00);

    // Verify wallet after release:
    const finalWallet = await query('SELECT balance, bonus_balance, locked_bonus_winnings FROM wallets WHERE user_id = $1', [testUserId]);
    // Withdrawable cash increased by exactly 8000:
    expect(Number(finalWallet.rows[0].balance)).toBe(initialCash + 8000.00);
    // Locked bonus winnings became 0:
    expect(Number(finalWallet.rows[0].locked_bonus_winnings)).toBe(0.00);
    // Original bonus principal remains in bonus_balance (non-withdrawable):
    expect(Number(finalWallet.rows[0].bonus_balance)).toBe(2500.00);

    // Verify user_bonuses status is COMPLETED
    const finalBonus = await query('SELECT status, released_winnings, locked_winnings FROM user_bonuses WHERE id = $1', [claim.bonusId]);
    expect(finalBonus.rows[0].status).toBe('COMPLETED');
    expect(Number(finalBonus.rows[0].released_winnings)).toBe(8000.00);
    expect(Number(finalBonus.rows[0].locked_winnings)).toBe(0.00);
  });

  it('8. Idempotency: Duplicate settlement attempt does NOT double count turnover or release', async () => {
    const claim = await claimPromotionBonus({ userId: testUserId, promoCode, depositAmount: 2500.00 });
    const betId = `bet_idem_${Date.now()}`;
    await insertTestBet({ betId, userId: testUserId, stake: 2500.00, odds: 1.75, payout: 4375.00, status: 'WON' });

    const r1 = await withTransaction((client) => recordBonusWageringInTx(client, { userId: testUserId, betId, stake: 2500.00, odds: 1.75, outcome: 'WON', profit: 1875.00 }));
    expect(r1.applied).toBe(true);

    const r2 = await withTransaction((client) => recordBonusWageringInTx(client, { userId: testUserId, betId, stake: 2500.00, odds: 1.75, outcome: 'WON', profit: 1875.00 }));
    expect(r2.applied).toBe(false);
    expect(r2.alreadyProcessed).toBe(true);

    const bRes = await query('SELECT wagering_completed FROM user_bonuses WHERE id = $1', [claim.bonusId]);
    expect(Number(bRes.rows[0].wagering_completed)).toBe(2500.00); // NOT 5000!
  });

  it('9. Reconciliation: Detects and validates turnover audit trail', async () => {
    const claim = await claimPromotionBonus({ userId: testUserId, promoCode, depositAmount: 2500.00 });
    const betId = `bet_recon_${Date.now()}`;
    await insertTestBet({ betId, userId: testUserId, stake: 2500.00, odds: 1.75, payout: 4375.00, status: 'WON' });

    await withTransaction((client) => recordBonusWageringInTx(client, { userId: testUserId, betId, stake: 2500.00, odds: 1.75, outcome: 'WON', profit: 1875.00 }));

    const recon = await financialReconciliationEngine.reconcileBonusWagering({ userId: testUserId });
    expect(recon.reconciled).toBe(true);
    expect(recon.issueCount).toBe(0);
  });

  it('10. Withdrawal with Active Bonus: Bonus principal and all bonus winnings are completely forfeited to 0', async () => {
    const { withdrawalEngine } = await import('../../lib/withdrawalEngine.mjs');

    const claim = await claimPromotionBonus({ userId: testUserId, promoCode, depositAmount: 2500.00 });
    const betId = `bet_win_forfeit_${Date.now()}`;
    await insertTestBet({ betId, userId: testUserId, stake: 2500.00, odds: 1.75, payout: 4375.00, status: 'WON' });

    // Settle winnings into locked_bonus_winnings
    await query(`UPDATE wallets SET balance = 5000.00, reserved_balance = 0.00, bonus_balance = 2500.00, locked_bonus_winnings = 1875.00 WHERE user_id = $1`, [testUserId]);
    await withTransaction((client) => recordBonusWageringInTx(client, {
      userId: testUserId,
      betId,
      stake: 2500.00,
      odds: 1.75,
      outcome: 'WON',
      profit: 1875.00,
    }));

    // Check balances before withdrawal
    const beforeWallet = await query('SELECT balance, bonus_balance, locked_bonus_winnings FROM wallets WHERE user_id = $1', [testUserId]);
    expect(Number(beforeWallet.rows[0].balance)).toBe(5000.00);
    expect(Number(beforeWallet.rows[0].bonus_balance)).toBe(2500.00);
    expect(Number(beforeWallet.rows[0].locked_bonus_winnings)).toBe(1875.00);

    // User requests a withdrawal of ₹1,000 cash
    const wdRes = await withdrawalEngine.requestWithdrawal({
      userId: testUserId,
      amount: 1000.00,
      bankDetails: { method: 'UPI', upiId: 'user@okhdfcbank' },
    });

    expect(wdRes.amount).toBe(1000.00);
    expect(wdRes.forfeitedBonus).toBe(2500.00);
    expect(wdRes.forfeitedLockedWinnings).toBe(1875.00);

    // Verify wallet after withdrawal:
    // Bonus balance must be 0.00!
    // Locked bonus winnings must be 0.00!
    // Cash balance must be 4,000.00 (5,000 - 1,000)!
    const afterWallet = await query('SELECT balance, bonus_balance, locked_bonus_winnings, reserved_balance FROM wallets WHERE user_id = $1', [testUserId]);
    expect(Number(afterWallet.rows[0].bonus_balance)).toBe(0.00);
    expect(Number(afterWallet.rows[0].locked_bonus_winnings)).toBe(0.00);
    expect(Number(afterWallet.rows[0].balance)).toBe(4000.00);
    expect(Number(afterWallet.rows[0].reserved_balance)).toBe(1000.00);

    // Verify user_bonuses is FORFEITED and locked_winnings is 0.00
    const bRes = await query('SELECT status, locked_winnings FROM user_bonuses WHERE id = $1', [claim.bonusId]);
    expect(bRes.rows[0].status).toBe('FORFEITED');
    expect(Number(bRes.rows[0].locked_winnings)).toBe(0.00);

    // Verify audit transactions exist for both forfeitures
    const forfeitTx = await query("SELECT type, amount FROM transactions WHERE user_id = $1 AND type IN ('BONUS_FORFEIT', 'BONUS_WINNINGS_FORFEIT') ORDER BY type ASC", [testUserId]);
    expect(forfeitTx.rows.length).toBe(2);
    expect(forfeitTx.rows[0].type).toBe('BONUS_FORFEIT');
    expect(Number(forfeitTx.rows[0].amount)).toBe(2500.00);
    expect(forfeitTx.rows[1].type).toBe('BONUS_WINNINGS_FORFEIT');
    expect(Number(forfeitTx.rows[1].amount)).toBe(1875.00);
  });
});
