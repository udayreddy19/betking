import crypto from 'crypto';
import { query } from '../db/pg.js';

/**
 * Enterprise Notification Preferences & Quiet Hours Engine
 * User channel opt-ins/opt-outs and quiet hours handling.
 * Mandatory operational events (SECURITY, ACCOUNT, PAYMENT, KYC, FRAUD) bypass marketing opt-outs.
 * Reuses user_notification_preferences — no parallel marketing_preferences table.
 */

export const MANDATORY_CATEGORIES = ['SECURITY', 'ACCOUNT', 'PAYMENT', 'KYC', 'FRAUD', 'SYSTEM'];

async function ensurePrefAuditSchema() {
  await query(`
    ALTER TABLE user_notification_preferences
      ADD COLUMN IF NOT EXISTS source VARCHAR(64) DEFAULT 'user',
      ADD COLUMN IF NOT EXISTS updated_by VARCHAR(64)
  `).catch(() => null);
  await query(`
    CREATE TABLE IF NOT EXISTS marketing_preference_events (
      event_id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      channel VARCHAR(32) NOT NULL,
      previous_value BOOLEAN,
      new_value BOOLEAN NOT NULL,
      source VARCHAR(64) DEFAULT 'user',
      actor_id VARCHAR(64),
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `).catch(() => null);
}

export async function getUserPreferences(userId) {
  const res = await query(
    `SELECT marketing_email, marketing_sms, marketing_push, transactional_email,
            source, updated_by, updated_at
     FROM user_notification_preferences
     WHERE user_id = $1`,
    [userId]
  ).catch(() => ({ rows: [] }));

  if (res.rows.length === 0) {
    return {
      userId,
      marketingEmail: false,
      marketingSms: false,
      marketingPush: false,
      transactionalEmail: true,
      source: null,
      updatedBy: null,
      updatedAt: null,
    };
  }

  const row = res.rows[0];
  return {
    userId,
    marketingEmail: row.marketing_email !== false,
    marketingSms: row.marketing_sms !== false,
    marketingPush: row.marketing_push !== false,
    transactionalEmail: row.transactional_email !== false,
    source: row.source || null,
    updatedBy: row.updated_by || null,
    updatedAt: row.updated_at || null,
  };
}

/**
 * Persist marketing preferences. Transactional email stays separate and is never
 * forced off by promotional opt-out helpers.
 */
export async function upsertUserMarketingPreferences(userId, {
  marketingEmail,
  marketingSms,
  marketingPush,
  source = 'user',
  actorId = null,
} = {}) {
  await ensurePrefAuditSchema();
  const prev = await getUserPreferences(userId);
  const nextEmail = marketingEmail ?? prev.marketingEmail;
  const nextSms = marketingSms ?? prev.marketingSms;
  const nextPush = marketingPush ?? prev.marketingPush;

  await query(
    `INSERT INTO user_notification_preferences (
       user_id, marketing_email, marketing_sms, marketing_push, transactional_email,
       source, updated_by, updated_at
     ) VALUES ($1,$2,$3,$4,TRUE,$5,$6,NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       marketing_email = EXCLUDED.marketing_email,
       marketing_sms = EXCLUDED.marketing_sms,
       marketing_push = EXCLUDED.marketing_push,
       source = EXCLUDED.source,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()`,
    [userId, !!nextEmail, !!nextSms, !!nextPush, String(source).slice(0, 64), actorId || userId],
  ).catch(async () => {
    await query(
      `INSERT INTO user_notification_preferences (
         user_id, marketing_email, marketing_sms, marketing_push, updated_at
       ) VALUES ($1,$2,$3,$4,NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         marketing_email = EXCLUDED.marketing_email,
         marketing_sms = EXCLUDED.marketing_sms,
         marketing_push = EXCLUDED.marketing_push,
         updated_at = NOW()`,
      [userId, !!nextEmail, !!nextSms, !!nextPush],
    );
  });

  const changes = [
    ['EMAIL', prev.marketingEmail, !!nextEmail],
    ['SMS', prev.marketingSms, !!nextSms],
    ['PUSH', prev.marketingPush, !!nextPush],
  ];
  for (const [channel, before, after] of changes) {
    if (before === after) continue;
    await query(
      `INSERT INTO marketing_preference_events (
         event_id, user_id, channel, previous_value, new_value, source, actor_id, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
      [
        `mpe_${crypto.randomBytes(8).toString('hex')}`,
        userId,
        channel,
        before,
        after,
        String(source).slice(0, 64),
        actorId || userId,
      ],
    ).catch(() => null);
  }

  try {
    const { logAdminAction } = await import('../server/middleware/auditLogger.js');
    await logAdminAction({
      actorId: actorId || userId,
      targetId: userId,
      action: 'MARKETING_PREFERENCES_UPDATED',
      details: { marketingEmail: nextEmail, marketingSms: nextSms, marketingPush: nextPush, source },
    });
  } catch { /* soft */ }

  return getUserPreferences(userId);
}

/** True when promotional EMAIL may be sent (registered users only). Unknown users → allow invite. */
export async function canSendPromotionalEmail(userId) {
  if (!userId) return true;
  try {
    const prefs = await getUserPreferences(userId);
    return prefs.marketingEmail !== false;
  } catch {
    return true;
  }
}

const DISABLED_EMAIL_CATEGORIES = [
  'PAYMENT', 'PAYMENTS', 'WALLET', 'DEPOSIT', 'WITHDRAWAL',
  'BETTING', 'BET', 'SETTLEMENT', 'CASHOUT'
];

export function isChannelAllowedForUser(preferences, category = 'BETTING', channel = 'IN_APP') {
  const cat = String(category).toUpperCase();
  const chan = String(channel).toUpperCase();

  // SMS is permanently disabled by policy
  if (chan === 'SMS') {
    return false;
  }

  // In-app notifications & mandatory operational events are ALWAYS delivered
  if (chan === 'IN_APP' || chan === 'ADMIN' || MANDATORY_CATEGORIES.includes(cat)) {
    return true;
  }

  // Payment and betting emails are disabled by policy (In-app & Browser Push remain active)
  if (chan === 'EMAIL' && DISABLED_EMAIL_CATEGORIES.includes(cat)) {
    return false;
  }

  // Promotional/Marketing preferences check
  if (cat === 'PROMOTION' || cat === 'MARKETING') {
    if (chan === 'EMAIL') return preferences.marketingEmail !== false;
    if (chan === 'WEB_PUSH' || chan === 'PUSH') return preferences.marketingPush !== false;
  }

  return true;
}

export function isQuietHoursActive(date = new Date(), startHour = 22, endHour = 7) {
  const hour = date.getHours();
  if (startHour > endHour) {
    return hour >= startHour || hour < endHour;
  }
  return hour >= startHour && hour < endHour;
}

export const updateUserPreferences = upsertUserMarketingPreferences;

