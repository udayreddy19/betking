/**
 * Find LOST Over totals where graded score > line (resettle candidates).
 * Admin can approve → credit WON payout.
 */

import { query, withTransaction } from '../db/pg.js';
import { parseOuLine } from './odds-v3/lineIdentity.mjs';
import { convertToDecimalOdds } from './normalizers/oddsNormalizer.mjs';
import { applyVipOddsBoost } from './vipBenefits.mjs';
import { splitSettlementWinCredits } from './walletSettlement.mjs';
import { logSettlement } from './settlement/settlementAudit.mjs';

function isOverSelection(selectionId, selectionName) {
  const raw = `${selectionId || ''} ${selectionName || ''}`.toLowerCase();
  if (/\bunder\b/.test(raw)) return false;
  return /\bover\b/.test(raw);
}

function scoreFromReason(reason) {
  const m = String(reason || '').match(/(?:score|final)=?(\d+(?:\.\d+)?)/i)
    || String(reason || '').match(/_(\d+(?:\.\d+)?)_line=/i)
    || String(reason || '').match(/=(\d+(?:\.\d+)?)(?:_|$)/);
  return m ? Number(m[1]) : null;
}

export async function scanWrongLostTotals({ lookbackDays = 7, limit = 500 } = {}) {
  const res = await query(
    `SELECT b.bet_id, b.user_id, b.match_id, b.market_id, b.selection_id, b.stake,
            b.accepted_odds, b.odds, b.status, b.settled_at, b.placement_snapshot,
            b.actual_payout, b.settlement_reason, b.vip_boost_pct, b.fund_source,
            b.returns_stake,
            (
              SELECT bs.selection_name FROM bet_selections bs
              WHERE bs.bet_id = b.bet_id LIMIT 1
            ) AS selection_name
     FROM bets b
     WHERE UPPER(b.status) = 'LOST'
       AND COALESCE(b.settled_at, b.created_at) > NOW() - ($1::text || ' days')::interval
       AND (
         LOWER(COALESCE(b.market_id, '')) LIKE '%team_total%'
         OR LOWER(COALESCE(b.market_id, '')) LIKE '%match_total%'
       )
     ORDER BY COALESCE(b.settled_at, b.created_at) DESC
     LIMIT $2`,
    [String(lookbackDays), limit],
  );

  const suspects = [];
  for (const row of res.rows) {
    const selectionName = row.selection_name || '';
    if (!isOverSelection(row.selection_id, selectionName)) continue;

    const line = parseOuLine(selectionName) ?? parseOuLine(row.selection_id);
    if (line == null) continue;

    const reason = row.settlement_reason || '';
    const score = scoreFromReason(reason);
    let snap = row.placement_snapshot || {};
    if (typeof snap === 'string') {
      try { snap = JSON.parse(snap || '{}'); } catch { snap = {}; }
    }
    const leg = Array.isArray(snap?.legs) ? snap.legs[0] : null;
    const snapLine = leg?.line != null ? Number(leg.line) : line;

    if (score != null && score > snapLine) {
      suspects.push({
        betId: row.bet_id,
        userId: row.user_id,
        matchId: row.match_id,
        marketId: row.market_id,
        selectionId: row.selection_id,
        selectionName,
        stake: Number(row.stake),
        line: snapLine,
        gradedScore: score,
        reason,
        settledAt: row.settled_at,
        issue: 'LOST_OVER_BUT_SCORE_ABOVE_LINE',
      });
    }
  }

  return {
    event: 'RESETTLE_WRONG_LOST_TOTALS_SCAN',
    scannedAt: new Date().toISOString(),
    lookbackDays,
    scannedLostTotals: res.rows.length,
    suspectCount: suspects.length,
    suspects,
    note: 'Use admin approve endpoint to credit WON after review.',
  };
}

/**
 * Admin-approved correction: LOST Over → WON with payout credit.
 */
export async function approveWrongLostTotalsCorrection({
  betId,
  adminId,
  reason = 'Admin resettle: LOST Over but score above line',
  force = false,
}) {
  if (!betId || !adminId) throw new Error('betId and adminId required');

  if (!force) {
    const scan = await scanWrongLostTotals({ lookbackDays: 30, limit: 500 });
    const hit = scan.suspects.find((s) => s.betId === betId);
    if (!hit) {
      throw Object.assign(
        new Error('BET_NOT_IN_RESETTLE_SCAN: pass force=true to override after manual review'),
        { status: 400 },
      );
    }
  }

  return withTransaction(async (client) => {
    const betRes = await client.query('SELECT * FROM bets WHERE bet_id = $1 FOR UPDATE', [betId]);
    const bet = betRes.rows[0];
    if (!bet) throw new Error('BET_NOT_FOUND');
    if (String(bet.status).toUpperCase() !== 'LOST') {
      throw new Error(`BET_NOT_LOST: status is ${bet.status}`);
    }

    const txId = `tx_resettle_${betId}`;
    const existingTx = await client.query(
      'SELECT transaction_id FROM transactions WHERE transaction_id = $1',
      [txId],
    );
    if (existingTx.rows.length) {
      throw new Error('ALREADY_RESETTLED');
    }

    const stake = Number(bet.stake) || 0;
    const acceptedOdds = convertToDecimalOdds(bet.accepted_odds || bet.odds || 1);
    const vipBoostPct = Number(bet.vip_boost_pct) || 0;
    const basePayout = stake * acceptedOdds;
    const payout = Number(applyVipOddsBoost(basePayout, vipBoostPct).toFixed(2));
    const split = splitSettlementWinCredits(bet, payout);

    const walletRes = await client.query(
      `SELECT wallet_id, balance, bonus_balance,
              COALESCE(freebet_balance, 0) AS freebet_balance,
              COALESCE(locked_deposit_balance, 0) AS locked_deposit_balance,
              COALESCE(winnings_balance, 0) AS winnings_balance
       FROM wallets WHERE user_id = $1 FOR UPDATE`,
      [bet.user_id],
    );
    if (!walletRes.rows[0]) throw new Error('WALLET_NOT_FOUND');
    const wallet = walletRes.rows[0];

    const nextCash = Number((Number(wallet.balance || 0) + (split.cashCredit || 0)).toFixed(2));
    const nextBonus = Number((Number(wallet.bonus_balance || 0) + (split.bonusCredit || 0)).toFixed(2));
    const nextFreebet = Number((Number(wallet.freebet_balance || 0) + (split.freebetCredit || 0)).toFixed(2));
    const nextWinnings = Number((Number(wallet.winnings_balance || 0) + (split.winningsCredit || 0)).toFixed(2));

    await client.query(
      `UPDATE wallets
       SET balance = $1, bonus_balance = $2, freebet_balance = $3, winnings_balance = $4, updated_at = NOW()
       WHERE wallet_id = $5`,
      [nextCash, nextBonus, nextFreebet, nextWinnings, wallet.wallet_id],
    );

    await client.query(
      `INSERT INTO transactions (transaction_id, user_id, type, amount, status, created_at)
       VALUES ($1, $2, 'BET_PAYOUT', $3, 'SUCCESS', NOW())`,
      [txId, bet.user_id, payout],
    );

    await client.query(
      `INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description, created_at)
       VALUES ($1, $2, 'CREDIT', $3, $4, $5, NOW())`,
      [
        wallet.wallet_id,
        txId,
        split.cashCredit || payout,
        nextCash,
        `Resettle correction LOST→WON for bet ${betId} by admin ${adminId}: ${reason}`,
      ],
    );

    await client.query(
      `UPDATE bets
       SET status = 'WON',
           actual_payout = $1,
           settled_at = NOW(),
           settlement_reason = $2,
           settlement_version = COALESCE(settlement_version, 0) + 1
       WHERE bet_id = $3`,
      [
        payout,
        `resettle_lost_to_won admin=${adminId}; ${reason}`.slice(0, 500),
        betId,
      ],
    );

    const correctionId = `sc_resettle_${betId}_${Date.now()}`;
    try {
      await client.query(
        `INSERT INTO settlement_corrections (
           correction_id, bet_id, prior_result, new_result, prior_payout, adjustment_amount,
           status, notes, requested_by, created_at
         ) VALUES ($1, $2, 'LOST', 'WON', 0, $3, 'REVERSED', $4, $5, NOW())
         ON CONFLICT DO NOTHING`,
        [correctionId, betId, payout, reason, adminId],
      );
    } catch {
      // audit row best-effort
    }

    logSettlement('RESETTLE_LOST_TO_WON', { betId, payout, adminId, correctionId });

    return {
      success: true,
      betId,
      correctionId,
      payout,
      priorStatus: 'LOST',
      newStatus: 'WON',
      txId,
    };
  });
}
