import { describe, it, expect, beforeEach } from 'vitest';
import { query } from '../../db/pg.js';
import {
  classifyOpenSettlementBets,
  findOrphanOpenSettlementBets,
} from '../../lib/settlement/settlementHealth.mjs';

describe('open bet orphan classification', () => {
  const userId = 'usr_orphan_cls';
  const liveMatch = 'm_orphan_live';
  const doneMatch = 'm_orphan_done';
  const marketId = 'mkt_orphan_cls';
  const selectionId = 'sel_orphan_cls';

  beforeEach(async () => {
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT DO NOTHING`, [userId, `${userId}@t.com`]);
    await query(`DELETE FROM settlement_jobs WHERE bet_id LIKE 'bet_orphan_%'`);
    await query(`DELETE FROM bets WHERE user_id = $1`, [userId]);
    await query(`INSERT INTO matches (match_id, status) VALUES ($1, 'IN_PLAY') ON CONFLICT (match_id) DO UPDATE SET status = 'IN_PLAY'`, [liveMatch]);
    await query(`INSERT INTO matches (match_id, status) VALUES ($1, 'COMPLETED') ON CONFLICT (match_id) DO UPDATE SET status = 'COMPLETED'`, [doneMatch]);
    await query(
      `INSERT INTO markets (market_id, match_id, name, status) VALUES ($1, $2, 'Winner', 'OPEN')
       ON CONFLICT (market_id) DO UPDATE SET status = 'OPEN'`,
      [marketId, liveMatch],
    );
    await query(
      `INSERT INTO selections (selection_id, market_id, name, odds, status)
       VALUES ($1, $2, 'Home', 2.00, 'OPEN') ON CONFLICT DO NOTHING`,
      [selectionId, marketId],
    );
  });

  it('ACCEPTED on IN_PLAY match → LIVE_ACTIVE_BET, not TRUE_ORPHAN', async () => {
    const betId = `bet_orphan_live_${Date.now()}`;
    await query(
      `INSERT INTO bets (bet_id, user_id, match_id, market_id, selection_id, stake, odds, accepted_odds, potential_payout, status)
       VALUES ($1, $2, $3, $4, $5, 10, 2, 2, 20, 'ACCEPTED')`,
      [betId, userId, liveMatch, marketId, selectionId],
    );
    const rows = await classifyOpenSettlementBets({ limit: 5000 });
    const mine = rows.find((r) => r.bet_id === betId);
    expect(mine?.classification).toBe('LIVE_ACTIVE_BET');
    expect(mine?.incident).toBe(false);

    const orphans = await findOrphanOpenSettlementBets({ limit: 5000 });
    expect(orphans.some((r) => r.bet_id === betId)).toBe(false);
  });

  it('ACCEPTED on COMPLETED match with no job → TRUE_ORPHAN', async () => {
    const betId = `bet_orphan_done_${Date.now()}`;
    await query(
      `INSERT INTO bets (bet_id, user_id, match_id, market_id, selection_id, stake, odds, accepted_odds, potential_payout, status)
       VALUES ($1, $2, $3, $4, $5, 10, 2, 2, 20, 'ACCEPTED')`,
      [betId, userId, doneMatch, marketId, selectionId],
    );
    const rows = await classifyOpenSettlementBets({ limit: 5000 });
    const mine = rows.find((r) => r.bet_id === betId);
    expect(mine?.classification).toBe('TRUE_ORPHAN');
    expect(mine?.incident).toBe(true);
  });
});
