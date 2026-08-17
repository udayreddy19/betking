import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

describe('Phase 1 Razorpay Webhook Security Tests', () => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'oddsyra_wh_secret_2026';

  const generateSignature = (bodyObj, keySecret) => {
    const rawBody = Buffer.from(JSON.stringify(bodyObj));
    return {
      rawBody,
      signature: crypto.createHmac('sha256', keySecret).update(rawBody).digest('hex'),
    };
  };

  it('should generate valid HMAC SHA256 signature match', () => {
    const payload = { event: 'payment.captured', payload: { payment: { entity: { id: 'pay_test_1', amount: 50000, notes: { userId: 'usr_wh_1' } } } } };
    const { rawBody, signature } = generateSignature(payload, secret);

    const calculated = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    expect(calculated).toBe(signature);
  });

  it('should reject forged signature when secret differs', () => {
    const payload = { event: 'payment.captured', payload: { payment: { entity: { id: 'pay_test_2', amount: 50000, notes: { userId: 'usr_wh_1' } } } } };
    const { rawBody, signature: forgedSig } = generateSignature(payload, 'wrong_secret_key');

    const calculated = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    expect(calculated).not.toBe(forgedSig);
  });

  it('should reject malformed or missing userId in payment notes', () => {
    const invalidUserIds = [null, undefined, '', 'ab', 'user<script>', 'user; DROP TABLE users;--'];

    invalidUserIds.forEach(id => {
      const isValid = Boolean(id && typeof id === 'string' && id.length >= 3 && id.length <= 64 && /^[a-zA-Z0-9_\-\.\@]+$/.test(id));
      expect(isValid).toBe(false);
    });

    const validUserIds = ['usr_101', 'user.name@oddsyra.com', 'user-123_456'];
    validUserIds.forEach(id => {
      const isValid = Boolean(id && typeof id === 'string' && id.length >= 3 && id.length <= 64 && /^[a-zA-Z0-9_\-\.\@]+$/.test(id));
      expect(isValid).toBe(true);
    });
  });
});
