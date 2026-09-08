#!/usr/bin/env node
/**
 * Blast MONSOON30 (Monsoon Deposit Fest) to all eligible users via
 * promotional email + in-app/web push.
 *
 * Usage (production):
 *   node scripts/send_monsoon30_blast.mjs              # dry-run
 *   node scripts/send_monsoon30_blast.mjs --confirm     # send
 *   node scripts/send_monsoon30_blast.mjs --confirm --limit=50
 */
import 'dotenv/config';
import { query } from '../db/pg.js';
import { getUserPreferences, canSendPromotionalEmail } from '../lib/notificationPreferencesEngine.mjs';
import { sendPromotionalCampaignEmail } from '../server/auth/emailService.js';
import { notifyUserPromoOffer } from '../lib/promoUserNotify.mjs';

const CONFIRM = process.argv.includes('--confirm');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Math.max(1, Number(limitArg.split('=')[1]) || 0) : null;
const CAMPAIGN_KEY = 'm30_20260908'; // keep event_id ≤ 64 with user_id
const SUBJECT = 'Monsoon Deposit Fest — 30% bonus up to ₹5,000';
const BODY = [
  'Monsoon Deposit Fest is live on OddsYra.',
  'Deposit ₹2,000 or more and claim 30% bonus credit up to ₹5,000 with code MONSOON30.',
  'Min odds 1.75+, 5× wagering. Offer ends 21 Sep 2026.',
].join(' ');
const CTA_URL = 'https://oddsyra.com/promotions#promo-MONSOON30';
const DELAY_MS = 80;

function campaignEventId(userId) {
  return `${CAMPAIGN_KEY}_${userId}`.slice(0, 64);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function alreadySent(userId) {
  const eventId = campaignEventId(userId);
  const res = await query(
    `SELECT 1 AS ok FROM notifications WHERE event_id = $1 LIMIT 1`,
    [eventId],
  );
  return res.rows.length > 0;
}

async function main() {
  console.log(JSON.stringify({
    event: 'MONSOON30_BLAST_START',
    mode: CONFIRM ? 'SEND' : 'DRY_RUN',
    campaignKey: CAMPAIGN_KEY,
    limit: LIMIT,
  }));

  const params = [];
  let sql = `
    SELECT u.user_id,
           u.email,
           NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), '') AS name,
           COALESCE(u.status, up.account_status, 'ACTIVE') AS status
    FROM users u
    LEFT JOIN user_profiles up ON up.user_id = u.user_id
    WHERE u.email IS NOT NULL
      AND TRIM(u.email) <> ''
      AND COALESCE(u.status, up.account_status, 'ACTIVE') NOT IN ('BANNED', 'CLOSED', 'DELETED', 'SUSPENDED')
    ORDER BY u.created_at ASC NULLS LAST, u.user_id ASC
  `;
  if (LIMIT) {
    params.push(LIMIT);
    sql += ` LIMIT $${params.length}`;
  }

  const users = await query(sql, params);
  const stats = {
    total: users.rows.length,
    emailed: 0,
    pushed: 0,
    skippedOptOut: 0,
    skippedNoEmail: 0,
    skippedAlready: 0,
    failed: 0,
  };

  for (const row of users.rows) {
    const userId = row.user_id;
    const email = String(row.email || '').trim();
    const name = row.name || null;
    const eventId = campaignEventId(userId);

    try {
      if (!email || !email.includes('@')) {
        stats.skippedNoEmail += 1;
        continue;
      }

      if (await alreadySent(userId)) {
        stats.skippedAlready += 1;
        continue;
      }

      const prefs = await getUserPreferences(userId);
      const allowEmail = prefs.marketingEmail !== false && (await canSendPromotionalEmail(userId));
      const allowPush = prefs.marketingPush !== false;

      if (!allowEmail && !allowPush) {
        stats.skippedOptOut += 1;
        continue;
      }

      if (!CONFIRM) {
        if (allowEmail) stats.emailed += 1;
        if (allowPush) stats.pushed += 1;
        continue;
      }

      if (allowEmail) {
        await sendPromotionalCampaignEmail({
          email,
          name,
          title: SUBJECT,
          offerBody: BODY,
          ctaLabel: 'Claim MONSOON30',
          ctaUrl: CTA_URL,
        });
        stats.emailed += 1;
      }

      if (allowPush) {
        await notifyUserPromoOffer({
          userId,
          subject: SUBJECT,
          message: `${BODY} Use code MONSOON30.`,
          url: '/promotions#promo-MONSOON30',
          eventId,
        });
        stats.pushed += 1;
      } else if (allowEmail) {
        // Record campaign send for idempotency even when push opted out
        await query(
          `INSERT INTO notifications
             (id, user_id, event_type, category, channel, recipient, subject, body, status, event_id, is_read, attempts)
           VALUES ($1, $2, 'PROMO_OFFER', 'PROMOTIONAL', 'EMAIL', $3, $4, $5, 'DELIVERED', $6, TRUE, 0)
           ON CONFLICT (id) DO NOTHING`,
          [
            `em_${eventId}`.slice(0, 64),
            userId,
            email,
            SUBJECT,
            BODY.slice(0, 400),
            eventId,
          ],
        );
      }

      await sleep(DELAY_MS);
    } catch (err) {
      stats.failed += 1;
      console.error(JSON.stringify({
        event: 'MONSOON30_BLAST_USER_FAIL',
        userId,
        error: err.message,
      }));
    }
  }

  console.log(JSON.stringify({
    event: 'MONSOON30_BLAST_DONE',
    mode: CONFIRM ? 'SEND' : 'DRY_RUN',
    ...stats,
  }, null, 2));

  if (!CONFIRM) {
    console.log('\nDry-run only. Re-run with --confirm to send.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
