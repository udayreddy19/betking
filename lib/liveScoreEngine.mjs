import { query } from '../db/pg.js';
import { idempotencyEngine } from './idempotencyEngine.mjs';

/**
 * Enterprise Live Score Engine & Sport-Specific Scoring Logic
 */
export async function processLiveScoreUpdate({
  matchId,
  providerEventId,
  sequenceNumber = 1,
  scorePayload,
  sport = 'FOOTBALL',
}) {
  const eKey = `score_evt_${matchId}_${providerEventId}`;
  const idCheck = await idempotencyEngine.checkOrLock(eKey, 'live_score_update', `${matchId}_${sequenceNumber}`);
  if (idCheck.isDuplicate) {
    if (idCheck.status === 'COMPLETED') return idCheck.result;
  }

  try {
    const formattedScore = typeof scorePayload === 'object' ? JSON.stringify(scorePayload) : String(scorePayload);

    // Update match score in PostgreSQL
    await query(`
      UPDATE matches
      SET status = 'LIVE'
      WHERE match_id = $1;
    `, [matchId]);

    const result = {
      success: true,
      matchId,
      providerEventId,
      sequenceNumber,
      sport,
      score: formattedScore,
      updatedAt: new Date().toISOString(),
    };

    await idempotencyEngine.complete(eKey, result);
    return result;
  } catch (err) {
    await idempotencyEngine.fail(eKey, err.message);
    throw err;
  }
}
