import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getWalletPromoRules,
  updateWalletPromoRules,
  validateDepositAmount,
  validatePromoBetStake,
} from '../lib/walletPromoRules.mjs';

test('Strict Free Bet, Bonus Bet, and Minimum Deposit Validation Rules', async (t) => {
  await t.test('1. Minimum Deposit Rules', async () => {
    const rules = await getWalletPromoRules();
    const min = Number(rules.minimumDepositAmount) || 1000;
    const below = Math.max(1, Math.floor(min) - 1);

    await assert.rejects(
      () => validateDepositAmount(below),
      /DEPOSIT_LIMIT.*Minimum deposit is ₹/,
      `Deposit below ₹${min} must be rejected`
    );

    const allowed = await validateDepositAmount(min);
    assert.equal(allowed, min, `₹${min} deposit must be allowed`);

    const resAbove = await validateDepositAmount(min + 1500);
    assert.equal(resAbove, min + 1500, 'Above-minimum deposit must be allowed');
  });

  await t.test('2. Free Bet Full Usage & Partial Rejection', async () => {
    const freebetBalance = 500;

    // Partial stakes must be rejected
    await assert.rejects(
      () => validatePromoBetStake({ fundSource: 'freebet', requestedStake: 100, availableBalance: freebetBalance }),
      /FULL_PROMO_AMOUNT_REQUIRED.*This Free Bet must be used in full \(₹500\)\. Partial usage is not allowed\./,
      '₹100 partial Free Bet stake must be rejected'
    );

    await assert.rejects(
      () => validatePromoBetStake({ fundSource: 'freebet', requestedStake: 200, availableBalance: freebetBalance }),
      /FULL_PROMO_AMOUNT_REQUIRED/,
      '₹200 partial Free Bet stake must be rejected'
    );

    await assert.rejects(
      () => validatePromoBetStake({ fundSource: 'freebet', requestedStake: 499, availableBalance: freebetBalance }),
      /FULL_PROMO_AMOUNT_REQUIRED/,
      '₹499 partial Free Bet stake must be rejected'
    );

    // Full stake must succeed
    await assert.doesNotReject(
      () => validatePromoBetStake({ fundSource: 'freebet', requestedStake: 500, availableBalance: freebetBalance }),
      'Exact ₹500 Free Bet stake must be allowed'
    );
  });

  await t.test('3. Bonus Bet Full Usage & Partial Rejection', async () => {
    const bonusBalance = 500;

    // Partial stakes must be rejected
    await assert.rejects(
      () => validatePromoBetStake({ fundSource: 'bonus', requestedStake: 100, availableBalance: bonusBalance }),
      /FULL_PROMO_AMOUNT_REQUIRED.*This Bonus must be used in full \(₹500\)\. Partial usage is not allowed\./,
      '₹100 partial Bonus stake must be rejected'
    );

    await assert.rejects(
      () => validatePromoBetStake({ fundSource: 'bonus', requestedStake: 200, availableBalance: bonusBalance }),
      /FULL_PROMO_AMOUNT_REQUIRED/,
      '₹200 partial Bonus stake must be rejected'
    );

    await assert.rejects(
      () => validatePromoBetStake({ fundSource: 'bonus', requestedStake: 499, availableBalance: bonusBalance }),
      /FULL_PROMO_AMOUNT_REQUIRED/,
      '₹499 partial Bonus stake must be rejected'
    );

    // Full stake must succeed
    await assert.doesNotReject(
      () => validatePromoBetStake({ fundSource: 'bonus', requestedStake: 500, availableBalance: bonusBalance }),
      'Exact ₹500 Bonus stake must be allowed'
    );
  });

  await t.test('4. Cashflow is not restricted by promotional exact stake rules', async () => {
    // Normal cash bets are allowed at arbitrary valid amounts
    await assert.doesNotReject(
      () => validatePromoBetStake({ fundSource: 'cash', requestedStake: 250, availableBalance: 1000 }),
      'Cash bets can be arbitrary partial amounts'
    );
  });

  console.log('✅ ALL WALLET AND PROMOTIONAL RULES TESTS PASSED WITH ZERO FAILURES!');
});
