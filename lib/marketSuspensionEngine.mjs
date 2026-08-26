/**
 * Multi-Cause Market Suspension Engine
 * Manages concurrent suspension conditions (STALE_ODDS, EVENT_WICKET, MANUAL_ADMIN, RISK, PROVIDER_FAILURE).
 * A market remains SUSPENDED as long as at least ONE cause remains active.
 */

import { query } from '../db/pg.js';
import { marketStateMachine, MARKET_STATES } from './marketStateMachine.mjs';

const IN_MEMORY_SUSPENSIONS = new Map(); // marketId -> Map<reason, { reason, source, actor, createdAt }>
const MARKET_STATUS_CACHE = new Map(); // marketId -> { status, suspendedAt, suspensionReason }

export class MarketSuspensionEngine {
  /** Get active suspension causes for a market */
  async getActiveCauses(marketId) {
    if (IN_MEMORY_SUSPENSIONS.has(marketId)) {
      return Array.from(IN_MEMORY_SUSPENSIONS.get(marketId).values());
    }

    try {
      const res = await query(`
        SELECT reason, source, actor, created_at
        FROM market_suspensions
        WHERE market_id = $1 AND cleared_at IS NULL;
      `, [marketId]);

      const causesMap = new Map();
      for (const row of res.rows) {
        causesMap.set(row.reason, {
          reason: row.reason,
          source: row.source,
          actor: row.actor,
          createdAt: row.created_at,
        });
      }
      IN_MEMORY_SUSPENSIONS.set(marketId, causesMap);
      return Array.from(causesMap.values());
    } catch (err) {
      return [];
    }
  }

  /** Add a suspension cause to a market */
  async addSuspensionCause(marketId, reason, source = 'SYSTEM', actor = null) {
    if (!marketId || !reason) return null;

    if (!IN_MEMORY_SUSPENSIONS.has(marketId)) {
      IN_MEMORY_SUSPENSIONS.set(marketId, new Map());
    }
    const causesMap = IN_MEMORY_SUSPENSIONS.get(marketId);
    causesMap.set(reason, { reason, source, actor, createdAt: new Date().toISOString() });

    // Persist to PostgreSQL market_suspensions
    try {
      await query(`
        INSERT INTO markets (market_id, name, status, created_at, updated_at)
        VALUES ($1, $1, 'SUSPENDED', NOW(), NOW())
        ON CONFLICT (market_id) DO NOTHING;
      `, [marketId]);

      const suspensionId = `susp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      await query(`
        INSERT INTO market_suspensions (id, market_id, reason, source, actor, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (id) DO NOTHING;
      `, [suspensionId, marketId, reason, source, actor]);

      await query(`
        UPDATE markets
        SET status = 'SUSPENDED', suspended_at = NOW(), suspension_reason = $1, updated_at = NOW()
        WHERE market_id = $2 AND status != 'CLOSED' AND status != 'SETTLED' AND status != 'CANCELLED';
      `, [reason, marketId]);
    } catch (err) {
      console.warn('[MarketSuspension Engine DB Warning]', err.message);
    }

    MARKET_STATUS_CACHE.set(marketId, {
      status: MARKET_STATES.SUSPENDED,
      suspendedAt: new Date().toISOString(),
      suspensionReason: reason,
    });

    return {
      marketId,
      status: MARKET_STATES.SUSPENDED,
      activeCauses: Array.from(causesMap.values()),
    };
  }

  /** Clear a suspension cause from a market */
  async clearSuspensionCause(marketId, reason) {
    if (!marketId || !reason) return null;

    if (IN_MEMORY_SUSPENSIONS.has(marketId)) {
      const causesMap = IN_MEMORY_SUSPENSIONS.get(marketId);
      causesMap.delete(reason);
    }

    try {
      await query(`
        UPDATE market_suspensions
        SET cleared_at = NOW()
        WHERE market_id = $1 AND reason = $2 AND cleared_at IS NULL;
      `, [marketId, reason]);
    } catch (err) {
      console.warn('[MarketSuspension Clear DB Warning]', err.message);
    }

    // Check remaining active causes
    const activeCauses = await this.getActiveCauses(marketId);

    if (activeCauses.length > 0) {
      // Market MUST REMAIN SUSPENDED because other cause(s) still exist!
      const remainingReason = activeCauses[0].reason;
      try {
        await query(`
          UPDATE markets
          SET status = 'SUSPENDED', suspension_reason = $1, updated_at = NOW()
          WHERE market_id = $2;
        `, [remainingReason, marketId]);
      } catch (err) {
        // Ignore
      }

      MARKET_STATUS_CACHE.set(marketId, {
        status: MARKET_STATES.SUSPENDED,
        suspensionReason: remainingReason,
      });

      return {
        marketId,
        status: MARKET_STATES.SUSPENDED,
        activeCauses,
        message: `Cause '${reason}' cleared, but market remains SUSPENDED due to active cause '${remainingReason}'`,
      };
    }

    // Zero active causes remain -> Reopen Market!
    try {
      await query(`
        UPDATE markets
        SET status = 'OPEN', suspension_reason = NULL, updated_at = NOW()
        WHERE market_id = $1 AND status = 'SUSPENDED';
      `, [marketId]);
    } catch (err) {
      // Ignore
    }

    MARKET_STATUS_CACHE.set(marketId, {
      status: MARKET_STATES.OPEN,
      suspensionReason: null,
    });

    return {
      marketId,
      status: MARKET_STATES.OPEN,
      activeCauses: [],
      message: `All suspension causes cleared. Market reopened.`,
    };
  }

  /** List active (uncleared) suspension causes for the trading desk queue. */
  async listActiveSuspensions({ limit = 200 } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 500);
    try {
      const res = await query(`
        SELECT
          ms.id,
          ms.market_id AS "marketId",
          ms.reason,
          ms.source,
          ms.actor,
          ms.created_at AS "createdAt",
          m.status AS "marketStatus",
          m.suspension_reason AS "marketSuspensionReason"
        FROM market_suspensions ms
        LEFT JOIN markets m ON m.market_id = ms.market_id
        WHERE ms.cleared_at IS NULL
        ORDER BY ms.created_at DESC
        LIMIT $1;
      `, [safeLimit]);
      return res.rows || [];
    } catch (err) {
      console.warn('[MarketSuspension listActiveSuspensions]', err.message);
      return [];
    }
  }
}

export const marketSuspensionEngine = new MarketSuspensionEngine();
