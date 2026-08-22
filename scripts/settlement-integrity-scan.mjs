#!/usr/bin/env node
/**
 * Read-only settlement integrity scan — reports discrepancies, never auto-repairs.
 *
 * Exit 0 when there are no operational incidents:
 *   - TRUE_ORPHAN / DEAD_LETTER open bets
 *   - DEAD_LETTER jobs
 *   - duplicate settlement payout credits
 *   - wallet↔ledger mismatches
 *
 * LIVE_ACTIVE_BET open bets on unfinished matches are reported but do NOT fail the scan.
 */

import { query } from '../db/pg.js';
import { findOpenSettlementBetsClassified } from '../lib/settlement/settlementHealth.mjs';
import { getFailedSettlementJobs, getPendingSettlementJobs } from '../lib/settlement/settlementQueue.mjs';

async function main() {
  const classified = await findOpenSettlementBetsClassified({ limit: 500 });
  const byClass = classified.reduce((acc, row) => {
    acc[row.classification] = (acc[row.classification] || 0) + 1;
    return acc;
  }, {});

  const report = {
    event: 'SETTLEMENT_INTEGRITY_SCAN',
    scannedAt: new Date().toISOString(),
    openBetsClassified: classified,
    openBetsByClass: byClass,
    /** @deprecated use openBetsClassified — only TRUE_ORPHAN / DEAD_LETTER */
    orphanOpenBets: classified.filter((r) => r.incident),
    liveActiveBets: classified.filter((r) => r.classification === 'LIVE_ACTIVE_BET'),
    deadLetterJobs: [],
    pendingJobs: [],
    duplicatePayouts: [],
    walletLedgerMismatches: [],
  };

  report.deadLetterJobs = await getFailedSettlementJobs(100);
  report.pendingJobs = await getPendingSettlementJobs(100);

  const dupPay = await query(
    `SELECT bet_ref AS bet_id, COUNT(*)::int AS payout_count
     FROM (
       SELECT (regexp_match(description, 'Bet #([^ )]+)'))[1] AS bet_ref
       FROM ledger_entries
       WHERE type = 'CREDIT'
         AND description ~ '^Settlement .+ for Bet #'
     ) credits
     WHERE bet_ref IS NOT NULL
     GROUP BY bet_ref
     HAVING COUNT(*) > 1
     LIMIT 100`,
  );
  report.duplicatePayouts = dupPay.rows;

  const ledgerGap = await query(
    `SELECT w.wallet_id, w.user_id, w.balance,
            COALESCE(SUM(CASE WHEN le.type = 'CREDIT' THEN le.amount WHEN le.type = 'DEBIT' THEN -le.amount ELSE 0 END), 0) AS ledger_net
     FROM wallets w
     LEFT JOIN ledger_entries le ON le.wallet_id = w.wallet_id
     GROUP BY w.wallet_id, w.user_id, w.balance
     HAVING ABS(w.balance - COALESCE(SUM(CASE WHEN le.type = 'CREDIT' THEN le.amount WHEN le.type = 'DEBIT' THEN -le.amount ELSE 0 END), 0)) > 0.01
     LIMIT 50`,
  );
  report.walletLedgerMismatches = ledgerGap.rows;

  const incidentOrphans = report.orphanOpenBets.length;
  const hasIncidents = incidentOrphans > 0
    || report.deadLetterJobs.length > 0
    || report.duplicatePayouts.length > 0
    || report.walletLedgerMismatches.length > 0;

  console.log(JSON.stringify(report, null, 2));
  process.exit(hasIncidents ? 2 : 0);
}

main().catch((err) => {
  console.error(JSON.stringify({ event: 'SETTLEMENT_INTEGRITY_SCAN_ERROR', message: err.message }));
  process.exit(1);
});
