/**
 * Auto-email players who deposited recently but have not placed a first bet.
 * Uses no-reply mailbox so messages land in Primary, not Gmail Promotions.
 */

import { query } from '../db/pg.js';
import { logger } from './logger.mjs';

const COOLDOWN_HOURS = Math.max(6, parseInt(process.env.ACTIVATION_NUDGE_COOLDOWN_HOURS || '48', 10) || 48);
const LOOKBACK_HOURS = Math.max(6, parseInt(process.env.ACTIVATION_NUDGE_LOOKBACK_HOURS || '48', 10) || 48);
const ENABLED = String(process.env.ACTIVATION_NUDGE_ENABLED || 'true').toLowerCase() !== 'false';

async function alreadyNudged(userId) {
  const res = await query(
    `SELECT 1 FROM notifications
     WHERE user_id = $1
       AND event_type = 'ACTIVATION_FIRST_BET'
       AND created_at > NOW() - ($2::text || ' hours')::interval
     LIMIT 1`,
    [userId, String(COOLDOWN_HOURS)],
  );
  return res.rows.length > 0;
}

/**
 * Find unconverted depositors and send a short sports CTA email + in-app notify.
 */
export async function processUnconvertedDepositorNudges({ limit = 25 } = {}) {
  if (!ENABLED) return { checked: 0, sent: 0, skipped: 0, disabled: true };

  const lim = Math.min(100, Math.max(1, Number(limit) || 25));
  const usersRes = await query(
    `SELECT u.user_id, u.email, u.name AS display_name,
            COALESCE(SUM(t.amount), 0) AS deposit_total
     FROM users u
     JOIN transactions t ON t.user_id = u.user_id
       AND t.type = 'DEPOSIT' AND t.status = 'COMPLETED'
       AND t.created_at >= NOW() - ($1::text || ' hours')::interval
     LEFT JOIN bets b ON b.user_id = u.user_id
     WHERE u.email IS NOT NULL AND u.email <> ''
     GROUP BY u.user_id, u.email, u.name
     HAVING COUNT(b.id) = 0
     ORDER BY MAX(t.created_at) ASC
     LIMIT $2`,
    [String(LOOKBACK_HOURS), lim],
  );

  const { sendAdminComposeEmail } = await import('../server/auth/emailService.js');
  let sent = 0;
  let skipped = 0;

  for (const row of usersRes.rows || []) {
    try {
      if (await alreadyNudged(row.user_id)) {
        skipped += 1;
        continue;
      }
      const name = row.display_name || 'there';
      await sendAdminComposeEmail({
        mailboxId: 'no-reply',
        to: row.email,
        subject: 'Your deposit is ready — place your first OddsYra bet',
        heading: 'Markets are live',
        greetingName: name,
        body: [
          `Your wallet is funded (about ₹${Number(row.deposit_total || 0).toLocaleString('en-IN')}).`,
          '',
          'Open Sports or Live Betting, pick a cricket market, and place a careful first stake.',
          '',
          '18+ only. Play responsibly — set limits anytime from your profile.',
        ].join('\n'),
        ctaLabel: 'Open live cricket',
        ctaHref: `${process.env.FRONTEND_URL || 'https://oddsyra.com'}/sports`,
      });

      const notifId = `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await query(
        `INSERT INTO notifications
           (id, user_id, event_type, category, channel, recipient, subject, body, status, event_id, is_read, attempts)
         VALUES ($1, $2, 'ACTIVATION_FIRST_BET', 'TRANSACTIONAL', 'EMAIL', $3, $4, $5, 'DELIVERED', $1, FALSE, 1)
         ON CONFLICT (id) DO NOTHING`,
        [
          notifId,
          row.user_id,
          row.email,
          'Place your first bet',
          'Your deposit is ready — open Sports to place your first stake.',
        ],
      );
      sent += 1;
    } catch (err) {
      logger.warn('activation_nudge_failed', { userId: row.user_id, error: err.message });
      skipped += 1;
    }
  }

  return { checked: usersRes.rows.length, sent, skipped };
}
