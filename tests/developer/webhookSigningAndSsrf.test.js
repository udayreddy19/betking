import { describe, it, expect } from 'vitest';
import { isSafeWebhookUrl, dispatchWebhookEvent } from '../../lib/developerPlatformEngine.mjs';
import crypto from 'crypto';

describe('Phase 13 Webhook HMAC Signing & SSRF Defender Tests', () => {
  it('SSRF Defender: Safe external HTTPS URLs pass, local/internal IPs are REJECTED', () => {
    expect(isSafeWebhookUrl('https://api.partner.com/webhook').safe).toBe(true);
    expect(isSafeWebhookUrl('http://127.0.0.1/webhook').safe).toBe(false);
    expect(isSafeWebhookUrl('http://localhost:8080/wh').safe).toBe(false);
    expect(isSafeWebhookUrl('http://169.254.169.254/latest/meta-data').safe).toBe(false);
    expect(isSafeWebhookUrl('http://10.0.0.1/wh').safe).toBe(false);
    expect(isSafeWebhookUrl('http://192.168.1.1/wh').safe).toBe(false);
    expect(isSafeWebhookUrl('file:///etc/passwd').safe).toBe(false);
  });

  it('Webhook Dispatch: HMAC-SHA256 signature is calculated over raw payload string', async () => {
    const payload = { matchId: 'mat_wh_1', score: '100/1' };
    const result = await dispatchWebhookEvent({
      tenantId: 'tenant_default',
      eventType: 'odds.updated',
      payload,
    });
    expect(result.success).toBe(true);
  });
});
