import { query } from '../db/pg.js';

/**
 * Enterprise Notification Preferences & Quiet Hours Engine
 * User channel opt-ins/opt-outs and quiet hours handling.
 * Mandatory operational events (SECURITY, ACCOUNT, PAYMENT, KYC, FRAUD) bypass marketing opt-outs.
 */

export const MANDATORY_CATEGORIES = ['SECURITY', 'ACCOUNT', 'PAYMENT', 'KYC', 'FRAUD', 'SYSTEM'];

export async function getUserPreferences(userId) {
  const res = await query(
    `SELECT marketing_email, marketing_sms, marketing_push, transactional_email
     FROM user_notification_preferences
     WHERE user_id = $1`,
    [userId]
  );

  if (res.rows.length === 0) {
    return {
      userId,
      marketingEmail: true,
      marketingSms: true,
      marketingPush: true,
      transactionalEmail: true,
    };
  }

  const row = res.rows[0];
  return {
    userId,
    marketingEmail: row.marketing_email !== false,
    marketingSms: row.marketing_sms !== false,
    marketingPush: row.marketing_push !== false,
    transactionalEmail: row.transactional_email !== false,
  };
}

export function isChannelAllowedForUser(preferences, category = 'BETTING', channel = 'IN_APP') {
  const cat = String(category).toUpperCase();
  const chan = String(channel).toUpperCase();

  // In-app notifications & mandatory operational events are ALWAYS delivered
  if (chan === 'IN_APP' || chan === 'ADMIN' || MANDATORY_CATEGORIES.includes(cat)) {
    return true;
  }

  // Promotional/Marketing preferences check
  if (cat === 'PROMOTION' || cat === 'MARKETING') {
    if (chan === 'EMAIL') return preferences.marketingEmail;
    if (chan === 'SMS') return preferences.marketingSms;
    if (chan === 'WEB_PUSH') return preferences.marketingPush;
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
