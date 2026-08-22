import { query } from '../db/pg.js';

/**
 * Enterprise Bet State Machine
 * Controls allowed state transitions and records immutable transition history.
 */
export const TERMINAL_BET_STATUSES = new Set([
  'WON', 'LOST', 'VOID', 'REFUNDED', 'CASHED_OUT', 'SETTLED', 'CANCELLED', 'REJECTED',
]);

export const ALLOWED_TRANSITIONS = {
  PENDING: ['ACCEPTED', 'REJECTED', 'CANCELLED', 'CASHED_OUT', 'WON', 'LOST', 'VOID', 'REFUNDED', 'SETTLED'],
  ACCEPTED: ['WON', 'LOST', 'VOID', 'REFUNDED', 'CANCELLED', 'CASHED_OUT', 'SETTLED'],
  REJECTED: [],
  CANCELLED: [],
  SUSPENDED: ['ACCEPTED', 'CANCELLED'],
  WON: [],
  LOST: [],
  REFUNDED: [],
  SETTLED: [],
  VOID: [],
  CASHED_OUT: [],
};

export function isTerminalBetStatus(status) {
  return TERMINAL_BET_STATUSES.has(String(status || '').toUpperCase());
}

export function assertValidTransition(fromStatus, toStatus) {
  const from = String(fromStatus || '').toUpperCase();
  const to = String(toStatus || '').toUpperCase();
  if (from === to) return true;
  if (isTerminalBetStatus(from)) {
    throw new Error(`INVALID_STATE_TRANSITION: Terminal status '${from}' cannot transition to '${to}'`);
  }
  const allowed = ALLOWED_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    throw new Error(`INVALID_STATE_TRANSITION: Cannot transition from '${from}' to '${to}'`);
  }
  return true;
}

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
  assertValidTransition(fromStatus, toStatus);

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
