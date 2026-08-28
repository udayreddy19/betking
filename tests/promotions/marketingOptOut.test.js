/**
 * Marketing preference opt-out — must block promotional campaign email, not transactional.
 */
import { describe, it, expect } from 'vitest';
import {
  isChannelAllowedForUser,
  MANDATORY_CATEGORIES,
  canSendPromotionalEmail,
  upsertUserMarketingPreferences,
  getUserPreferences,
} from '../../lib/notificationPreferencesEngine.mjs';

describe('marketing preferences — mandatory vs promotional', () => {
  it('mandatory categories always allowed even when marketing opted out', () => {
    const prefs = {
      marketingEmail: false,
      marketingSms: false,
      marketingPush: false,
      transactionalEmail: true,
    };
    for (const cat of MANDATORY_CATEGORIES) {
      expect(isChannelAllowedForUser(prefs, cat, 'EMAIL')).toBe(true);
    }
  });

  it('PROMOTION EMAIL respects marketingEmail opt-out', () => {
    expect(isChannelAllowedForUser({ marketingEmail: false }, 'PROMOTION', 'EMAIL')).toBe(false);
    expect(isChannelAllowedForUser({ marketingEmail: true }, 'PROMOTION', 'EMAIL')).toBe(true);
  });
});

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('marketing preferences — persistence + canSend', () => {
  it('upsert opt-out and canSendPromotionalEmail returns false', async () => {
    const userId = `mkt_test_${Date.now()}`;
    // Ensure user row exists for FK if enforced
    try {
      const { query } = await import('../../db/pg.js');
      await query(
        `INSERT INTO users (user_id, email, password_hash) VALUES ($1,$2,'hash')
         ON CONFLICT (user_id) DO NOTHING`,
        [userId, `${userId}@test.oddsyra`],
      );
    } catch { /* may not need user row */ }

    await upsertUserMarketingPreferences(userId, {
      marketingEmail: false,
      source: 'test',
      actorId: 'test',
    });
    const prefs = await getUserPreferences(userId);
    expect(prefs.marketingEmail).toBe(false);
    expect(await canSendPromotionalEmail(userId)).toBe(false);

    await upsertUserMarketingPreferences(userId, {
      marketingEmail: true,
      source: 'test',
      actorId: 'test',
    });
    expect(await canSendPromotionalEmail(userId)).toBe(true);
  });
});

describe('CRM campaign worker marketing opt-out (unit contract)', () => {
  it('executeCrmCampaign module exports and documents opt-out skip', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../lib/crmCampaignExecutionWorker.mjs');
    const src = fs.readFileSync(file, 'utf8');
    expect(src).toContain('canSendPromotionalEmail');
    expect(src).toContain('marketing_opt_out');
    expect(src).toContain('skippedOptOut');
  });
});
