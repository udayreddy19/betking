import { query } from '../db/pg.js';

/**
 * Enterprise Bet State Machine
 * Controls allowed state transitions and records immutable transition history.
 */
export const ALLOWED_TRANSITIONS = {
  PENDING: ['ACCEPTED', 'REJECTED', 'CANCELLED', 'CASHED_OUT'],
  ACCEPTED: ['SETTLED', 'VOID', 'CANCELLED', 'CASHED_OUT'],
  REJECTED: [],
  CANCELLED: [],
  SUSPENDED: ['ACCEPTED', 'CANCELLED'],
  SETTLED: [],    // Final state
  VOID: [],       // Final state
  CASHED_OUT: [], // Final state
};

export async function transitionBetStatus({
  betId,
  fromStatus,
  toStatus,
  reason = '',
  actorId = 'SYSTEM',
  correlationId = null,
  client = null,
}) {
  const allowed = ALLOWED_TRANSITIONS[fromStatus] || [];
  if (!allowed.includes(toStatus)) {
    throw new Error(`INVALID_STATE_TRANSITION: Cannot transition bet ${betId} from '${fromStatus}' to '${toStatus}'`);
  }

  const dbClient = client || { query };

  // 1. Update bet status
  await dbClient.query(`
    UPDATE bets
    SET status = $1
    WHERE bet_id = $2;
  `, [toStatus, betId]);

  // 2. Insert into bet_status_history
  const historyId = `hist_${betId}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
  await dbClient.query(`
    INSERT INTO bet_status_history (history_id, bet_id, from_status, to_status, reason, actor_id, correlation_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7);
  `, [historyId, betId, fromStatus, toStatus, reason, actorId, correlationId]);

  return { success: true, betId, fromStatus, toStatus, historyId };
}
