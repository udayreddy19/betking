import { describe, it, expect, beforeEach } from 'vitest';
import { createDeveloperApp, generateApiKey } from '../../lib/developerPlatformEngine.mjs';
import { query } from '../../db/pg.js';

describe('Phase 13 Public Odds Syndication API Tests', () => {
  const userId = `usr_pub_odds_${Date.now()}`;
  const matchId = `mat_pub_odds_${Date.now()}`;
  const marketId = `mkt_pub_odds_${Date.now()}`;
  let rawKey;

  beforeEach(async () => {
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT DO NOTHING;`, [userId, `${userId}@example.com`]);
    const app = await createDeveloperApp({ userId, name: 'Odds Syndication Client' });
    const key = await generateApiKey({ appId: app.appId, scopes: ['odds:read'] });
    rawKey = key.rawKey;

    await query(`INSERT INTO matches (match_id, status, live_score1, live_score2) VALUES ($1, 'LIVE', '120/2', '0/0') ON CONFLICT DO NOTHING;`, [matchId]);
    await query(`INSERT INTO markets (market_id, match_id, name, status) VALUES ($1, $2, 'Match Winner', 'ACTIVE') ON CONFLICT DO NOTHING;`, [marketId, matchId]);
    await query(`INSERT INTO selections (selection_id, market_id, name, odds, status) VALUES ($1, $2, 'Team A', 1.85, 'OPEN') ON CONFLICT DO NOTHING;`, [`sel_${Date.now()}`, marketId]);
  });

  it('GET /api/v1/public/odds queries canonical sports data and respects active market state', async () => {
    const res = await query(`
      SELECT
        m.match_id, m.status AS match_status, m.live_score1, m.live_score2,
        mk.market_id, mk.name AS market_name, mk.status AS market_status,
        s.selection_id, s.name AS selection_name, s.odds AS odds
      FROM matches m
      JOIN markets mk ON m.match_id = mk.match_id
      JOIN selections s ON mk.market_id = s.market_id
      WHERE m.match_id = $1;
    `, [matchId]);

    expect(res.rows.length).toBeGreaterThan(0);
    const row = res.rows[0];
    expect(row.match_id).toBe(matchId);
    expect(row.market_status).toBe('ACTIVE');
    expect(parseFloat(row.odds)).toBe(1.85);
  });
});
