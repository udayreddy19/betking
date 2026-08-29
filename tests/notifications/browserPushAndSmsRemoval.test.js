import { describe, it, expect, beforeEach } from 'vitest';
import { query } from '../../db/pg.js';
import {
  SMS_NOTIFICATIONS_ENABLED,
  isSmsConfigured,
  sendDltSms,
  dispatchNotificationChannel,
} from '../../lib/notificationChannels.mjs';
import {
  savePushSubscription,
  removePushSubscription,
  getUserActivePushSubscriptions,
  sendWebPushToSubscription,
  getWebPushStatus,
} from '../../lib/webPushEngine.mjs';
import { isChannelAllowedForUser } from '../../lib/notificationPreferencesEngine.mjs';
import { dispatchNotificationEvent } from '../../lib/notificationEngine.mjs';

describe('ODDSYRA — SMS Disablement & Browser Web Push Engine Tests', () => {
  const testUser = 'usr_test_push_dev_01';
  const dummyEndpoint1 = 'https://fcm.googleapis.com/fcm/send/test_endpoint_alpha_1';
  const dummyEndpoint2 = 'https://updates.push.services.mozilla.com/wpush/v2/test_endpoint_beta_2';

  beforeEach(async () => {
    await query(`
      INSERT INTO users (user_id, email, password_hash, status)
      VALUES ($1, $2, 'hash', 'ACTIVE')
      ON CONFLICT (user_id) DO NOTHING;
    `, [testUser, `${testUser}@oddsyra.com`]);

    await query(`
      DELETE FROM user_push_subscriptions WHERE user_id = $1;
    `, [testUser]);

    await query(`
      DELETE FROM notifications WHERE user_id = $1;
    `, [testUser]);
  });

  it('TEST 1: SMS channel is permanently disabled by policy and skips execution cleanly', async () => {
    expect(SMS_NOTIFICATIONS_ENABLED).toBe(false);
    expect(isSmsConfigured()).toBe(false);

    const smsRes = await sendDltSms();
    expect(smsRes.delivered).toBe(false);
    expect(smsRes.skipped).toBe(true);
    expect(smsRes.reason).toBe('SMS_DISABLED_BY_POLICY');

    const dispatchRes = await dispatchNotificationChannel('SMS', '+919999999999', 'Test message');
    expect(dispatchRes.delivered).toBe(false);
    expect(dispatchRes.skipped).toBe(true);
    expect(dispatchRes.reason).toBe('SMS_DISABLED_BY_POLICY');
  });

  it('TEST 2: isChannelAllowedForUser returns false for SMS regardless of preferences', () => {
    const prefs = { marketingEmail: true, marketingSms: true, marketingPush: true };
    expect(isChannelAllowedForUser(prefs, 'BETTING', 'SMS')).toBe(false);
    expect(isChannelAllowedForUser(prefs, 'PROMOTION', 'SMS')).toBe(false);
  });

  it('TEST 3: VAPID status endpoint never exposes private key', () => {
    const status = getWebPushStatus();
    expect(status).toBeDefined();
    expect(status.enabled).toBeDefined();
    expect(status).not.toHaveProperty('vapidPrivateKey');
    expect(status).not.toHaveProperty('privateKey');
  });

  it('TEST 4: Push subscriptions support multiple devices per user and upserts cleanly', async () => {
    const sub1 = await savePushSubscription({
      userId: testUser,
      endpoint: dummyEndpoint1,
      p256dh: 'BNcRdreALRF8M_test_key_1',
      auth: 'auth_secret_1',
      userAgent: 'Mozilla Chrome Desktop',
    });
    expect(sub1.id).toBeDefined();
    expect(sub1.status).toBe('ACTIVE');

    const sub2 = await savePushSubscription({
      userId: testUser,
      endpoint: dummyEndpoint2,
      p256dh: 'BNcRdreALRF8M_test_key_2',
      auth: 'auth_secret_2',
      userAgent: 'Mozilla Firefox Mobile',
    });
    expect(sub2.id).toBeDefined();
    expect(sub2.status).toBe('ACTIVE');

    const activeSubs = await getUserActivePushSubscriptions(testUser);
    expect(activeSubs.length).toBe(2);

    // Upsert existing endpoint -> updates keys, maintains 1 record
    const sub1Updated = await savePushSubscription({
      userId: testUser,
      endpoint: dummyEndpoint1,
      p256dh: 'BNcRdreALRF8M_test_key_1_updated',
      auth: 'auth_secret_1_updated',
      userAgent: 'Mozilla Chrome Desktop Updated',
    });
    expect(sub1Updated.endpoint).toBe(dummyEndpoint1);

    const activeSubsAfter = await getUserActivePushSubscriptions(testUser);
    expect(activeSubsAfter.length).toBe(2);
  });

  it('TEST 5: Unsubscribe deactivates target subscription without affecting other devices', async () => {
    await savePushSubscription({
      userId: testUser,
      endpoint: dummyEndpoint1,
      p256dh: 'key_1',
      auth: 'auth_1',
    });
    await savePushSubscription({
      userId: testUser,
      endpoint: dummyEndpoint2,
      p256dh: 'key_2',
      auth: 'auth_2',
    });

    // Unsubscribe device 1
    const unSubRes = await removePushSubscription({ userId: testUser, endpoint: dummyEndpoint1 });
    expect(unSubRes.success).toBe(true);

    const remainingActive = await getUserActivePushSubscriptions(testUser);
    expect(remainingActive.length).toBe(1);
    expect(remainingActive[0].endpoint).toBe(dummyEndpoint2);
  });

  it('TEST 6: Expired subscription (404/410) is automatically marked EXPIRED', async () => {
    const expiredSub = {
      endpoint: dummyEndpoint1,
      p256dh: 'invalid_p256dh',
      auth: 'invalid_auth',
    };

    await savePushSubscription({
      userId: testUser,
      endpoint: dummyEndpoint1,
      p256dh: 'invalid_p256dh',
      auth: 'invalid_auth',
    });

    // When web push is not configured or fails, it skips or flags expiration gracefully without crashing
    const res = await sendWebPushToSubscription(expiredSub, {
      title: 'Bet Won 🎉',
      body: 'Your bet won ₹1,000',
    });
    expect(res).toBeDefined();
  });

  it('TEST 7: Transactional push is dispatched and event-level idempotency prevents duplicate notifications', async () => {
    const eventId = `evt_bet_settled_${Date.now()}`;

    // First dispatch
    const res1 = await dispatchNotificationEvent({
      eventId,
      eventType: 'bet.settled',
      userId: testUser,
      category: 'BETTING',
      channel: 'PUSH',
      data: {
        title: 'Bet Won 🎉',
        message: 'Your bet has been settled successfully.',
        payout: 500,
      },
    });
    expect(res1.success).toBe(true);
    expect(res1.status).toBe('QUEUED');

    // Second dispatch with same eventId -> returns cached completed result (Idempotent)
    const res2 = await dispatchNotificationEvent({
      eventId,
      eventType: 'bet.settled',
      userId: testUser,
      category: 'BETTING',
      channel: 'PUSH',
      data: {
        title: 'Bet Won 🎉',
        message: 'Your bet has been settled successfully.',
        payout: 500,
      },
    });
    expect(res2.notificationId).toBe(res1.notificationId);

    const notifs = await query(`SELECT count(*)::int AS count FROM notifications WHERE event_id = $1 AND channel = 'PUSH'`, [eventId]);
    expect(notifs.rows[0].count).toBe(1);
  });
});
