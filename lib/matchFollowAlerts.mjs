/**
 * Follow a match + price-move alerts. Uses watchlist rows, not invented odds.
 */

import { query } from '../db/pg.js';
import { dispatchNotificationEvent } from './notificationEngine.mjs';

const lastSeen = new Map();

async function ensureSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS match_follows (
      user_id TEXT NOT NULL,
      match_id TEXT NOT NULL,
      threshold_pct NUMERIC NOT NULL DEFAULT 8,
      last_home_odds NUMERIC,
      last_away_odds NUMERIC,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (user_id, match_id)
    )
  `).catch(() => null);
}

export async function followMatch({ userId, matchId, thresholdPct = 8 }) {
  if (!userId || !matchId) throw new Error('userId and matchId required');
  await ensureSchema();
  const t = Math.min(40, Math.max(3, Number(thresholdPct) || 8));
  await query(
    `INSERT INTO match_follows (user_id, match_id, threshold_pct)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, match_id) DO UPDATE SET threshold_pct = EXCLUDED.threshold_pct`,
    [userId, String(matchId), t],
  );
  return { success: true, matchId, thresholdPct: t };
}

export async function unfollowMatch({ userId, matchId }) {
  await ensureSchema();
  await query(`DELETE FROM match_follows WHERE user_id = $1 AND match_id = $2`, [userId, String(matchId)]);
  return { success: true };
}

export async function listFollows(userId) {
  await ensureSchema();
  const res = await query(
    `SELECT match_id, threshold_pct, last_home_odds, last_away_odds, created_at
     FROM match_follows WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  return res.rows;
}

export async function evaluateFollowPriceAlerts(matches = []) {
  await ensureSchema();
  const follows = await query(`SELECT user_id, match_id, threshold_pct, last_home_odds, last_away_odds FROM match_follows`);
  if (!follows.rows.length) return { checked: 0, sent: 0 };

  const byId = new Map();
  for (const m of matches) {
    const id = String(m.id || m.matchId || '');
    if (id) byId.set(id, m);
  }

  let sent = 0;
  for (const row of follows.rows) {
    const match = byId.get(String(row.match_id));
    if (!match) continue;
    const home = Number(match.odds?.team1 || match.odds?.home);
    const away = Number(match.odds?.team2 || match.odds?.away);
    if (!(home > 1) || !(away > 1)) continue;

    const prevHome = Number(row.last_home_odds) || lastSeen.get(`${row.user_id}:${row.match_id}:h`);
    const prevAway = Number(row.last_away_odds) || lastSeen.get(`${row.user_id}:${row.match_id}:a`);
    lastSeen.set(`${row.user_id}:${row.match_id}:h`, home);
    lastSeen.set(`${row.user_id}:${row.match_id}:a`, away);

    await query(
      `UPDATE match_follows SET last_home_odds = $1, last_away_odds = $2 WHERE user_id = $3 AND match_id = $4`,
      [home, away, row.user_id, row.match_id],
    ).catch(() => null);

    if (!(prevHome > 1) || !(prevAway > 1)) continue;
    const move = Math.max(
      Math.abs(home - prevHome) / prevHome,
      Math.abs(away - prevAway) / prevAway,
    );
    const threshold = Number(row.threshold_pct) / 100;
    if (move < threshold) continue;

    await dispatchNotificationEvent({
      eventId: `price_${row.match_id}_${Date.now()}`,
      eventType: 'PRICE_ALERT',
      userId: row.user_id,
      category: 'BET',
      channel: 'IN_APP',
      data: {
        subject: 'Price moved on a followed match',
        body: `Winner odds moved ${(move * 100).toFixed(1)}% (threshold ${row.threshold_pct}%).`,
        matchId: row.match_id,
        home,
        away,
      },
    }).catch(() => null);
    sent += 1;
  }

  return { checked: follows.rows.length, sent };
}
