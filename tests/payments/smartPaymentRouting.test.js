import { describe, it, expect, beforeEach } from 'vitest';
import { SmartPaymentRouter } from '../../lib/paymentRoutingEngine.mjs';

describe('Payments — Smart Gateway Routing & Idempotent Webhook Queue', () => {
  let router;
  beforeEach(() => {
    router = new SmartPaymentRouter();
  });

  it('selects best gateway based on composite success score', () => {
    const best = router.getBestGateway(500);
    expect(best).toBeDefined();
    expect(best.id).toBeDefined();
    expect(best.score).toBeGreaterThan(0);
  });

  it('handles failover when primary gateway performance degrades', () => {
    // Record multiple failures on razorpay
    for (let i = 0; i < 15; i++) {
      router.recordTransactionResult('razorpay', false, 1200);
    }
    const best = router.getBestGateway(500);
    expect(best.id).not.toBe('razorpay');
  });

  it('enqueues webhooks with idempotency and duplicate detection', () => {
    const first = router.enqueueWebhook('phonepe', 'evt_12345', { amount: 1000 });
    expect(first.isDuplicate).toBe(false);
    expect(first.status).toBe('PENDING');

    // Duplicate submission of same webhook
    const duplicate = router.enqueueWebhook('phonepe', 'evt_12345', { amount: 1000 });
    expect(duplicate.isDuplicate).toBe(true);

    router.markWebhookProcessed('phonepe', 'evt_12345', true);
    const afterProcessed = router.enqueueWebhook('phonepe', 'evt_12345', { amount: 1000 });
    expect(afterProcessed.isDuplicate).toBe(true);
    expect(afterProcessed.status).toBe('PROCESSED');
  });
});
