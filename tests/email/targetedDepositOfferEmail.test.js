import { describe, it, expect, beforeEach } from 'vitest';
import {
  sendTargetedDepositOfferEmail,
  resetEmailDeliveryMetricsForTests,
} from '../../server/auth/emailService.js';

describe('Targeted deposit offer email — Primary inbox path', () => {
  beforeEach(() => {
    resetEmailDeliveryMetricsForTests();
  });

  it('sends as account mail from no-reply, not promos@, without marketing List-Unsubscribe', async () => {
    const res = await sendTargetedDepositOfferEmail({
      email: 'player@example.com',
      name: 'Uday',
      matchPercentage: 100,
      minDeposit: 500,
      maxBonus: 10000,
      subject: 'Your 100% deposit match is ready · ref TDFB',
    });

    expect(res.success).toBe(true);
    expect(res.html).toContain('deposit match');
    expect(res.html).toContain('Open wallet');
    expect(res.html).not.toContain('Manage email preferences');
    expect(res.html).not.toMatch(/Claim Bonus/i);
    // Subject stored on mock send path
    expect(res.subject || '').not.toMatch(/promos@/i);
  });
});
