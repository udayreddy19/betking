import { describe, it, expect, beforeEach } from 'vitest';
import {
  sendTargetedDepositOfferEmail,
  sanitizeAccountEmailSubject,
  resetEmailDeliveryMetricsForTests,
} from '../../server/auth/emailService.js';

describe('Targeted deposit offer email — Primary inbox path', () => {
  beforeEach(() => {
    resetEmailDeliveryMetricsForTests();
  });

  it('rejects promo blast subjects', () => {
    expect(sanitizeAccountEmailSubject('100% Deposit Free Bet Offer Just for You')).toBe('');
    expect(sanitizeAccountEmailSubject('Exclusive bonus claim')).toBe('');
    expect(sanitizeAccountEmailSubject('Your OddsYra wallet has an update')).toBe(
      'Your OddsYra wallet has an update',
    );
  });

  it('sends a short wallet update without Free/Bonus/Offer tables', async () => {
    const res = await sendTargetedDepositOfferEmail({
      email: 'player@example.com',
      name: 'Uday',
      matchPercentage: 100,
      minDeposit: 500,
      maxBonus: 10000,
      subject: '100% Deposit Free Bet Offer Just for You',
      promoCode: 'TDFB',
    });

    expect(res.success).toBe(true);
    expect(res.subject).toBe('Your OddsYra wallet has an update');
    expect(res.html).toContain('Wallet update');
    expect(res.html).toContain('Open wallet');
    expect(res.html).not.toContain('Manage email preferences');
    expect(res.html).not.toMatch(/Free bet|Max Bonus|Promo code|Deposit Match|Claim Bonus/i);
  });
});
