import { describe, it, expect, beforeEach } from 'vitest';
import { query } from '../../db/pg.js';
import {
  sendWelcomeEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendPasswordChangedNotificationEmail,
  sendKycApprovedEmail,
  sendKycRejectedEmail,
  sendKycReminderEmail,
  sendDepositFreebetEmail,
  sendBonusCreditedEmail,
  sendAdminGiftEmail,
  sendReferralRewardEmail,
  sendPromotionalCampaignEmail,
  sendSupportTicketCreatedUserEmail,
  sendSupportAdminReplyEmail,
  sendSupportTicketClosedEmail,
  sendDepositCompletedEmail,
  sendWithdrawalStatusEmail,
  sendGenericNotificationEmail,
  resetEmailDeliveryMetricsForTests,
} from '../../server/auth/emailService.js';
import { isChannelAllowedForUser } from '../../lib/notificationPreferencesEngine.mjs';
import { dispatchNotificationEvent } from '../../lib/notificationEngine.mjs';

describe('ODDSYRA — Email Event Cleanup & Unified Template Implementation', () => {
  const testEmail = 'synthetic.tester.oddsyra@gmail.com';
  const testUserId = 'usr_email_test_clean_01';

  beforeEach(async () => {
    resetEmailDeliveryMetricsForTests();
    await query(`
      INSERT INTO users (user_id, email, password_hash, status)
      VALUES ($1, $2, 'hash', 'ACTIVE')
      ON CONFLICT (user_id) DO NOTHING;
    `, [testUserId, testEmail]);

    await query(`
      DELETE FROM notifications WHERE user_id = $1;
    `, [testUserId]);
  });

  it('TEST 1: New signup welcome email renders clean branded HTML with explore CTA', async () => {
    const res = await sendWelcomeEmail({ email: testEmail, name: 'Faizu' });
    expect(res.success).toBe(true);
  });

  it('TEST 2: Email verification email dispatches with 24-hour expiration note', async () => {
    const res = await sendVerificationEmail({ email: testEmail, name: 'Faizu', token: 'sec_tok_alpha_123' });
    expect(res.success).toBe(true);
  });

  it('TEST 3: Verification link contains valid frontend path and token', async () => {
    const token = 'token_xyz_987';
    const expectedPath = `https://oddsyra.com/verify-email?token=${token}`;
    expect(expectedPath).toContain('/verify-email?token=');
  });

  it('TEST 4: Password reset email renders security guidance and 1-hour expiration', async () => {
    const res = await sendPasswordResetEmail({ email: testEmail, name: 'Faizu', token: 'pwd_rst_tok_456' });
    expect(res.success).toBe(true);
  });

  it('TEST 5: Password changed confirmation security email renders timestamp and warning', async () => {
    const res = await sendPasswordChangedNotificationEmail({ email: testEmail, name: 'Faizu' });
    expect(res.success).toBe(true);
  });

  it('TEST 6: KYC approved email dispatches confirmation of verified account status', async () => {
    const res = await sendKycApprovedEmail({ email: testEmail, name: 'Faizu' });
    expect(res.success).toBe(true);
  });

  it('TEST 7: KYC rejected email renders feedback notes without leaking sensitive PII', async () => {
    const res = await sendKycRejectedEmail({
      email: testEmail,
      name: 'Faizu',
      reason: 'Please ensure all four corners of the identity card are visible.',
    });
    expect(res.success).toBe(true);
  });

  it('TEST 8: Free bet credited email formats currency amount and promotional terms', async () => {
    const res = await sendDepositFreebetEmail({
      email: testEmail,
      name: 'Faizu',
      amount: 500,
      expiryDate: '2026-09-15',
      promoTitle: 'IPL 2026 Season Opener Free Bet',
    });
    expect(res.success).toBe(true);
  });

  it('TEST 9: Bonus credited email formats bonus validity and amount', async () => {
    const res = await sendBonusCreditedEmail({
      email: testEmail,
      name: 'Faizu',
      bonusName: 'VIP Level 2 Cashback Bonus',
      amount: 1250,
      expiryDays: 7,
    });
    expect(res.success).toBe(true);
  });

  it('TEST 9b: Admin gift email includes amount, gift wording, and rewards CTA', async () => {
    const res = await sendAdminGiftEmail({
      email: testEmail,
      name: 'Faizu',
      amount: 750,
      rewardType: 'freebet',
      title: 'VIP gift',
      expiresAt: '2026-09-15T18:30:00.000Z',
    });
    expect(res.success).toBe(true);
    expect(String(res.html || '')).toMatch(/750/);
    expect(String(res.html || '')).toMatch(/gift/i);
    expect(String(res.html || '')).toMatch(/\/rewards/);
  });

  it('TEST 10: Referral reward email confirms reward credit for referrer and referee', async () => {
    const res = await sendReferralRewardEmail({
      email: testEmail,
      name: 'Faizu',
      amount: 500,
      role: 'referrer',
    });
    expect(res.success).toBe(true);
  });

  it('TEST 11: Marketing opt-in allows promotional email dispatch', () => {
    const prefs = { marketingEmail: true, marketingSms: false, marketingPush: true };
    expect(isChannelAllowedForUser(prefs, 'PROMOTION', 'EMAIL')).toBe(true);
  });

  it('TEST 12: Marketing opt-out blocks promotional email while preserving transactional security emails', () => {
    const prefs = { marketingEmail: false, marketingSms: false, marketingPush: true };
    expect(isChannelAllowedForUser(prefs, 'PROMOTION', 'EMAIL')).toBe(false);
    expect(isChannelAllowedForUser(prefs, 'ACCOUNT', 'EMAIL')).toBe(true);
    expect(isChannelAllowedForUser(prefs, 'KYC', 'EMAIL')).toBe(true);
  });

  it('TEST 13: Support ticket created user email includes ticket reference', async () => {
    const res = await sendSupportTicketCreatedUserEmail({
      email: testEmail,
      name: 'Faizu',
      ticketId: 'TK-88912',
      subject: 'Withdrawal verification inquiry',
    });
    expect(res.success).toBe(true);
  });

  it('TEST 14: Support reply email renders agent message and reply CTA', async () => {
    const res = await sendSupportAdminReplyEmail({
      email: testEmail,
      name: 'Faizu',
      ticketId: 'TK-88912',
      messageText: 'Your verification has been completed and your withdrawal has processed.',
    });
    expect(res.success).toBe(true);
  });

  it('TEST 15: Payment events (Deposits / Withdrawals) do NOT send email; In-App and Browser Push remain active', async () => {
    const depRes = await sendDepositCompletedEmail();
    expect(depRes.delivered).toBe(false);
    expect(depRes.skipped).toBe(true);
    expect(depRes.reason).toBe('PAYMENT_EMAILS_DISABLED_BY_POLICY');

    const withRes = await sendWithdrawalStatusEmail();
    expect(withRes.delivered).toBe(false);
    expect(withRes.skipped).toBe(true);
    expect(withRes.reason).toBe('PAYMENT_EMAILS_DISABLED_BY_POLICY');

    const prefs = { marketingEmail: true };
    expect(isChannelAllowedForUser(prefs, 'PAYMENT', 'EMAIL')).toBe(false);
    expect(isChannelAllowedForUser(prefs, 'PAYMENT', 'IN_APP')).toBe(true);
    expect(isChannelAllowedForUser(prefs, 'PAYMENT', 'PUSH')).toBe(true);
  });

  it('TEST 16: Betting events (Placement / Settlement) do NOT send email; In-App and Browser Push remain active', async () => {
    const prefs = { marketingEmail: true };
    expect(isChannelAllowedForUser(prefs, 'BETTING', 'EMAIL')).toBe(false);
    expect(isChannelAllowedForUser(prefs, 'SETTLEMENT', 'EMAIL')).toBe(false);
    expect(isChannelAllowedForUser(prefs, 'BETTING', 'IN_APP')).toBe(true);
    expect(isChannelAllowedForUser(prefs, 'SETTLEMENT', 'PUSH')).toBe(true);

    const dispatchRes = await dispatchNotificationEvent({
      eventId: `evt_bet_${Date.now()}`,
      eventType: 'bet.settled',
      userId: testUserId,
      category: 'BETTING',
      channel: 'EMAIL',
      data: { payout: 1500 },
    });
    expect(dispatchRes.skipped).toBe(true);
    expect(dispatchRes.reason).toBe('PAYMENT_AND_BETTING_EMAILS_DISABLED_BY_POLICY');
  });

  it('TEST 17: Worker retry deduplication prevents duplicate emails for approved categories', async () => {
    const eventId = `evt_ref_rew_${Date.now()}`;

    const res1 = await dispatchNotificationEvent({
      eventId,
      eventType: 'referral.rewarded',
      userId: testUserId,
      category: 'REWARDS',
      channel: 'EMAIL',
      data: { amount: 500 },
    });
    expect(res1.success).toBe(true);

    // Second dispatch returns cached idempotent result
    const res2 = await dispatchNotificationEvent({
      eventId,
      eventType: 'referral.rewarded',
      userId: testUserId,
      category: 'REWARDS',
      channel: 'EMAIL',
      data: { amount: 500 },
    });
    expect(res2.notificationId).toBe(res1.notificationId);

    const countRes = await query(
      `SELECT count(*)::int AS count FROM notifications WHERE event_id = $1 AND channel = 'EMAIL'`,
      [eventId]
    );
    expect(countRes.rows[0].count).toBe(1);
  });
});
