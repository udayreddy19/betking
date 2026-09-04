/**
 * Remaining-gaps hardening — notification honesty + scheduler wiring.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('notification channel honesty', () => {
  const prevHost = process.env.SMTP_HOST;
  const prevUser = process.env.SMTP_USER;

  afterEach(() => {
    process.env.SMTP_HOST = prevHost;
    process.env.SMTP_USER = prevUser;
    vi.resetModules();
  });

  it('does not claim EMAIL delivered when SMTP is missing', async () => {
    process.env.SMTP_HOST = '';
    process.env.SMTP_USER = '';
    const { dispatchNotificationChannel } = await import('../../lib/notificationChannels.mjs');
    const result = await dispatchNotificationChannel('EMAIL', 'a@b.com', 'hello', 'subj');
    expect(result.delivered).toBe(false);
    expect(result.skipped).toBe(true);
    expect(result.reason).toMatch(/SMTP/);
  });

  it('marks IN_APP as delivered without SMTP', async () => {
    delete process.env.SMTP_HOST;
    const { dispatchNotificationChannel } = await import('../../lib/notificationChannels.mjs');
    const result = await dispatchNotificationChannel('IN_APP', 'usr_x', 'hello');
    expect(result.delivered).toBe(true);
  });
});

describe('scheduler workers include ops alerts + notifications', () => {
  it('wires evaluateOpsThresholds and notification queue', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../../lib/schedulerWorker.mjs', import.meta.url), 'utf8');
    expect(src).toMatch(/evaluateOpsThresholds/);
    expect(src).toMatch(/processNotificationDeliveryQueue/);
    expect(src).toMatch(/opsAlertInterval/);
    expect(src).toMatch(/notificationInterval/);
  });
});

describe('auth CSRF cookie mutations expanded', () => {
  it('protects change-password / complete-profile / resend-verification', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../../server/auth/authRoutes.js', import.meta.url), 'utf8');
    expect(src).toMatch(/change-password.*requireCsrfWhenCookies|requireCsrfWhenCookies.*change-password/s);
    expect(src).toMatch(/complete-profile.*requireCsrfWhenCookies|requireCsrfWhenCookies.*complete-profile/s);
    expect(src).toMatch(/resend-email-verification.*requireCsrfWhenCookies|requireCsrfWhenCookies.*resend-email-verification/s);
  });
});

describe('DR mismatch investigation tool', () => {
  it('ships read-only investigator script', async () => {
    const fs = await import('node:fs');
    const p = new URL('../../scripts/investigate_wallet_ledger_mismatches.mjs', import.meta.url);
    expect(fs.existsSync(p)).toBe(true);
    const src = fs.readFileSync(p, 'utf8');
    expect(src).toMatch(/FLAG_ONLY_NO_AUTO_REPAIR|autoRepair: false/);
    expect(src).not.toMatch(/UPDATE wallets SET balance/);
  });
});
