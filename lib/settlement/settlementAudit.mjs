/**
 * Settlement audit trail — bet_status_history + settlement_events + structured logs.
 */

let _query = null;
async function dbQuery(...args) {
  if (!_query) {
    const pg = await import('../../db/pg.js');
    _query = pg.query;
  }
  return _query(...args);
}

export function logSettlement(event, fields = {}) {
  const payload = { event, ts: new Date().toISOString(), ...fields };
  console.log(JSON.stringify(payload));
}

export async function recordBetStatusChange(client, {
  betId,
  fromStatus,
  toStatus,
  reason,
  correlationId = null,
  actorId = 'SYSTEM',
}) {
  const historyId = `bsh_${betId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  await client.query(
    `INSERT INTO bet_status_history
       (history_id, bet_id, from_status, to_status, reason, actor_id, correlation_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [historyId, betId, fromStatus, toStatus, reason || null, actorId, correlationId],
  );
  return historyId;
}

export async function recordSettlementEvent(client, {
  betId,
  userId,
  matchId,
  marketId,
  selectionId,
  marketType,
  result,
  stake,
  odds,
  payout,
  settlementReason,
  settlementRule,
  provider,
  providerEventId,
  stateVersion,
  settlementVersion,
  metadata = null,
}) {
  const id = `se_${betId}_v${settlementVersion || 1}`;
  await client.query('SAVEPOINT settlement_event_audit');
  try {
    await client.query(
      `INSERT INTO settlement_events (
         id, bet_id, user_id, match_id, market_id, selection_id, market_type,
         result, stake, odds, payout, settlement_reason, settlement_rule,
         provider, provider_event_id, state_version, settlement_version, metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       ON CONFLICT (bet_id, settlement_version) DO NOTHING`,
      [
        id,
        betId,
        userId,
        matchId,
        marketId,
        selectionId,
        marketType,
        result,
        stake,
        odds,
        payout,
        settlementReason,
        settlementRule,
        provider,
        providerEventId,
        stateVersion,
        settlementVersion || 1,
        metadata ? JSON.stringify(metadata) : null,
      ],
    );
    await client.query('RELEASE SAVEPOINT settlement_event_audit');
  } catch {
    await client.query('ROLLBACK TO SAVEPOINT settlement_event_audit');
  }
  return id;
}

export async function getSettlementHistory(betId) {
  try {
    const res = await dbQuery(
      `SELECT * FROM settlement_events WHERE bet_id = $1 ORDER BY settled_at ASC`,
      [betId],
    );
    return res.rows;
  } catch {
    return [];
  }
}
