/**
 * Automated Mass Settlement Worker
 * Processes completed matches in batch, acquiring unsettled bets via PostgreSQL FOR UPDATE SKIP LOCKED.
 * Concurrency-safe, restart-safe, observable, and retry-safe.
 */

import { query, withTransaction } from '../db/pg.js';
import { betSettlementEngine } from './betSettlementEngine.mjs';
import { runFullReconciliationAudit } from './reconciliationEngine.mjs';
import { settleOpenBetsFromLiveScores, buildSettlementMatchState } from './liveMatchSettlement.mjs';

export class MassSettlementWorker {
  /** Settle all unsettled bets for a completed match */
  async settleCompletedMatch(matchId, matchState = null, correlationId = null) {
    if (!matchId) {
      throw new Error('Match ID is required for mass settlement');
    }

    // Retrieve match state if not provided
    if (!matchState) {
      const mRes = await query('SELECT * FROM matches WHERE match_id = $1', [matchId]);
      if (mRes.rows.length === 0) {
        throw new Error(`Match ${matchId} not found`);
      }
      const row = mRes.rows[0];
      matchState = {
        matchId: row.match_id,
        status: row.status,
        winnerId: row.winner_team_id || row.winner_id || 'TIE',
        homeTeam: { teamId: row.team1_id || 'home' },
        awayTeam: { teamId: row.team2_id || 'away' },
      };
    }

    const matchStatus = String(matchState.status).toUpperCase();
    if (matchStatus !== 'COMPLETED' && matchStatus !== 'FINAL' && matchStatus !== 'ABANDONED' && matchStatus !== 'CANCELLED') {
      return { success: false, reason: `Match ${matchId} status is '${matchStatus}' (not final)` };
    }

    // Prefer live market graders (delivery/over/dismissal) scoped to this match
    try {
      const liveResult = await settleOpenBetsFromLiveScores({ limit: 500, matchId });
      if (liveResult.settled > 0) {
        return {
          success: true,
          matchId,
          status: matchStatus,
          betsSettled: liveResult.settled,
          totalPayoutsDistributed: 0,
          errorsEncountered: liveResult.errors,
          via: 'liveMatchSettlement',
        };
      }
    } catch (err) {
      console.error('[MassSettlement] liveMatchSettlement pass failed', err.message);
    }

    let totalSettled = 0;
    let totalPayouts = 0.00;
    let totalErrors = 0;

    // Batch Process Unsettled Bets
    const batchSize = 100;
    let hasMore = true;

    while (hasMore) {
      const batch = await withTransaction(async (client) => {
        const betsRes = await client.query(
          `SELECT bet_id FROM bets
           WHERE match_id = $1 AND status IN ('ACCEPTED', 'PENDING', 'OPEN')
           LIMIT $2
           FOR UPDATE SKIP LOCKED`,
          [matchId, batchSize],
        );
        return betsRes.rows;
      });

      if (batch.length === 0) {
        hasMore = false;
        break;
      }

      for (const b of batch) {
        try {
          const res = await betSettlementEngine.settleSingleBet({ betId: b.bet_id, matchState }, correlationId);
          if (res.status === 'SETTLED') {
            totalSettled++;
            totalPayouts += parseFloat(res.payout || 0.00);
          }
        } catch (err) {
          totalErrors++;
          console.error(`[MassSettlement Error] Bet ${b.bet_id}:`, err.message);

          // Log discrepancy case for failed settlement
          const caseId = `case_settle_err_${b.bet_id}_${Date.now()}`;
          await query(
            `INSERT INTO reconciliation_cases (id, reconciliation_type, entity_type, entity_id, severity, status, notes)
             VALUES ($1, 'SETTLEMENT_FAILED', 'bet', $2, 'HIGH', 'OPEN', $3)
             ON CONFLICT DO NOTHING`,
            [caseId, b.bet_id, `Settlement error: ${err.message}`]
          );
        }
      }

      if (batch.length < batchSize) {
        hasMore = false;
      }
    }

    // Mark markets for this match as SETTLED
    await query(`UPDATE markets SET status = 'SETTLED', updated_at = NOW() WHERE match_id = $1`, [matchId]);

    return {
      success: true,
      matchId,
      status: matchStatus,
      betsSettled: totalSettled,
      totalPayoutsDistributed: parseFloat(totalPayouts.toFixed(2)),
      errorsEncountered: totalErrors,
    };
  }

  /** Run mass settlement across all completed matches in system */
  async runMassSettlementBatch() {
    const completedMatches = await query(
      `SELECT match_id, status, winner_team_id, team1_id, team2_id
       FROM matches
       WHERE status IN ('COMPLETED', 'FINAL', 'ABANDONED', 'CANCELLED')`
    );

    const matchResults = [];
    for (const m of completedMatches.rows) {
      const matchState = {
        matchId: m.match_id,
        status: m.status,
        winnerId: m.winner_team_id || 'TIE',
        homeTeam: { teamId: m.team1_id || 'home' },
        awayTeam: { teamId: m.team2_id || 'away' },
      };

      const res = await this.settleCompletedMatch(m.match_id, matchState);
      matchResults.push(res);
    }

    // Run reconciliation audit scan after batch completion
    const reconAudit = await runFullReconciliationAudit();

    return {
      success: true,
      totalCompletedMatchesChecked: completedMatches.rows.length,
      matchResults,
      reconciliationAudit: reconAudit,
    };
  }
}

export const massSettlementWorker = new MassSettlementWorker();
