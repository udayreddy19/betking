#!/usr/bin/env node
/**
 * Read-only financial reconciliation — flags mismatches, never auto-repairs balances.
 *
 * Usage:
 *   npm run financial:reconcile
 *   npm run financial:reconcile -- --user=<USER_ID>
 */

import { financialReconciliationEngine } from '../lib/financialReconciliationEngine.mjs';
import { recalculateCumulativeWinningsForUser } from '../lib/walletSettlement.mjs';

function parseUserArg() {
  const flag = process.argv.find((a) => a.startsWith('--user='));
  return flag ? flag.split('=')[1] : null;
}

function hasRepairFlag() {
  return process.argv.includes('--repair-winnings-reporting');
}

function allowClassifiedLegacy() {
  return process.argv.includes('--allow-classified-legacy');
}

function classifyDiscrepancy(detail) {
  const ledgerGap = detail.ledger?.reconciled === false;
  const winningsGap = detail.winnings?.reconciled === false;
  const ledgerSum = Number(detail.ledger?.ledgerSum ?? 0);
  const stored = Number(detail.ledger?.storedBalance ?? 0);
  const diff = Math.abs(Number(detail.ledger?.difference ?? 0));

  if (ledgerGap && ledgerSum === 0 && stored > 0) {
    return {
      classification: 'LEGACY_PRE_LEDGER_SEED',
      recommendedAction: 'DOCUMENT_THEN_OPENING_BALANCE_LEDGER',
      autoRepair: false,
      explained: true,
    };
  }
  // Known pattern: cash activity started with unledgered opening balance (e.g. ₹9900 gap).
  if (ledgerGap && diff >= 1000 && ledgerSum > 0) {
    return {
      classification: 'LEGACY_PRE_LEDGER_OPENING_CASH',
      recommendedAction: 'DOCUMENT_THEN_OPENING_BALANCE_LEDGER',
      autoRepair: false,
      explained: true,
    };
  }
  if (winningsGap && ledgerGap === false) {
    return {
      classification: 'WINNINGS_REPORTING_ONLY',
      recommendedAction: 'OPTIONAL_REPORTING_RECALC',
      autoRepair: false,
      explained: true,
    };
  }
  if (ledgerGap || winningsGap) {
    return { classification: 'UNEXPLAINED', recommendedAction: 'ADMIN_REVIEW', autoRepair: false, explained: false };
  }
  return { classification: 'RECONCILED', recommendedAction: 'NONE', autoRepair: false, explained: true };
}

async function main() {
  const userId = parseUserArg();
  console.log(JSON.stringify({ event: 'FINANCIAL_RECONCILE_START', userId: userId || 'ALL' }, null, 2));

  if (userId) {
    let repair = null;
    if (hasRepairFlag()) {
      repair = await recalculateCumulativeWinningsForUser(userId);
      console.log(JSON.stringify({ event: 'WINNINGS_REPORTING_RECALCULATED', ...repair }, null, 2));
    }
    const report = await financialReconciliationEngine.auditUser(userId);
    const classification = classifyDiscrepancy(report);
    console.log(JSON.stringify({ event: 'FINANCIAL_RECONCILE_USER', repair, classification, ...report }, null, 2));
    const ok = report.reconciled || (allowClassifiedLegacy() && classification.explained);
    process.exit(ok ? 0 : 2);
  }

  const report = await financialReconciliationEngine.reconcileAllWallets();
  const classified = (report.details || []).map((d) => ({
    ...d,
    classification: classifyDiscrepancy(d),
  }));
  const unexplained = classified.filter(
    (d) => !d.reconciled && d.classification.explained !== true,
  );
  const classifiedLegacy = classified.filter(
    (d) => !d.reconciled && d.classification.explained === true,
  );
  console.log(JSON.stringify({
    event: 'FINANCIAL_RECONCILE_COMPLETE',
    ...report,
    classifiedCount: classified.length,
    unexplainedCount: unexplained.length,
    classifiedLegacyCount: classifiedLegacy.length,
    details: classified,
  }, null, 2));
  const ok = report.reconciled
    || (allowClassifiedLegacy() && unexplained.length === 0);
  process.exit(ok ? 0 : 2);
}

main().catch((err) => {
  console.error(JSON.stringify({ event: 'FINANCIAL_RECONCILE_ERROR', message: err.message }));
  process.exit(1);
});
