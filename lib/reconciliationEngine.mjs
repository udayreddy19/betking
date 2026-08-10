import { query } from '../db/pg.js';

/**
 * Multi-Domain Financial & Data Integrity Reconciliation Engine
 * Automatically detects discrepancies and generates actionable reconciliation_cases.
 */
export async function runFullReconciliationAudit() {
  console.log('🔍 EXECUTING MULTI-DOMAIN RECONCILIATION & DATA INTEGRITY AUDIT...');

  const financialResult = await runFinancialLedgerAudit();
  const paymentResult = await runPaymentReconciliationAudit();
  const settlementResult = await runSettlementReconciliationAudit();
  const integrityResult = await runDataIntegrityChecker();

  const totalCasesOpen = (financialResult.casesCreated || 0) + (paymentResult.casesCreated || 0) + (settlementResult.casesCreated || 0) + (integrityResult.casesCreated || 0);

  return {
    success: true,
    timestamp: new Date().toISOString(),
    overallStatus: totalCasesOpen === 0 ? 'HEALTHY_RECONCILED' : 'DISCREPANCIES_DETECTED',
    financialResult,
    paymentResult,
    settlementResult,
    integrityResult,
    totalNewCasesCreated: totalCasesOpen,
  };
}

/**
 * 1. Financial Ledger Audit (Wallet Balance ↔ Double-Entry Ledger)
 */
export async function runFinancialLedgerAudit() {
  const walletsRes = await query(`
    SELECT w.wallet_id, w.user_id, w.balance, u.email
    FROM wallets w
    JOIN users u ON w.user_id = u.user_id;
  `);

  let reconciledCount = 0;
  let mismatchCount = 0;
  let casesCreated = 0;

  for (const w of walletsRes.rows) {
    const actualBalance = parseFloat(w.balance);

    const ledgerRes = await query(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'CREDIT' THEN amount ELSE 0 END), 0) AS total_credits,
        COALESCE(SUM(CASE WHEN type = 'DEBIT' THEN amount ELSE 0 END), 0) AS total_debits
      FROM ledger_entries
      WHERE wallet_id = $1;
    `, [w.wallet_id]);

    const credits = parseFloat(ledgerRes.rows[0].total_credits);
    const debits = parseFloat(ledgerRes.rows[0].total_debits);
    const expectedLedgerBalance = parseFloat((credits - debits).toFixed(2));

    const delta = parseFloat(Math.abs(actualBalance - expectedLedgerBalance).toFixed(2));
    const isReconciled = delta < 0.05;

    if (isReconciled) {
      reconciledCount++;
    } else {
      mismatchCount++;
      // Create reconciliation_case in PostgreSQL
      const caseId = `case_fin_${w.wallet_id}_${Date.now()}`;
      await query(`
        INSERT INTO reconciliation_cases (id, reconciliation_type, entity_type, entity_id, expected_value, actual_value, difference, severity, status, notes)
        VALUES ($1, 'FINANCIAL_LEDGER', 'wallet', $2, $3, $4, $5, 'HIGH', 'OPEN', $6)
        ON CONFLICT DO NOTHING;
      `, [caseId, w.wallet_id, expectedLedgerBalance, actualBalance, delta, `Wallet balance mismatch for ${w.email}`]);
      casesCreated++;
    }
  }

  return { success: true, reconciledCount, mismatchCount, casesCreated, totalAudited: walletsRes.rows.length };
}

/**
 * 2. Payment Provider Reconciliation Audit
 */
export async function runPaymentReconciliationAudit() {
  let casesCreated = 0;

  // Check for duplicate UTR transactions
  const dupUtrRes = await query(`
    SELECT utr, COUNT(*) as cnt
    FROM transactions
    WHERE utr IS NOT NULL AND utr != ''
    GROUP BY utr
    HAVING COUNT(*) > 1;
  `);

  for (const row of dupUtrRes.rows) {
    const caseId = `case_pay_${row.utr}_${Date.now()}`;
    await query(`
      INSERT INTO reconciliation_cases (id, reconciliation_type, entity_type, entity_id, expected_value, actual_value, difference, severity, status, notes)
      VALUES ($1, 'PAYMENT_PROVIDER', 'transaction_utr', $2, 1, $3, $4, 'CRITICAL', 'OPEN', 'Duplicate payment UTR detected')
      ON CONFLICT DO NOTHING;
    `, [caseId, row.utr, parseInt(row.cnt, 10), parseInt(row.cnt, 10) - 1]);
    casesCreated++;
  }

  return { casesCreated, duplicatesFound: dupUtrRes.rows.length };
}

/**
 * 3. Settlement & Bet Reconciliation Audit
 */
export async function runSettlementReconciliationAudit() {
  let casesCreated = 0;

  // Check for WON bets without payout transaction
  const wonBetsWithoutPayout = await query(`
    SELECT b.bet_id, b.user_id, b.potential_payout
    FROM bets b
    LEFT JOIN transactions t ON t.transaction_id = 'tx_payout_' || b.bet_id
    WHERE b.status = 'WON' AND t.transaction_id IS NULL;
  `);

  for (const b of wonBetsWithoutPayout.rows) {
    const caseId = `case_settle_${b.bet_id}_${Date.now()}`;
    await query(`
      INSERT INTO reconciliation_cases (id, reconciliation_type, entity_type, entity_id, expected_value, actual_value, difference, severity, status, notes)
      VALUES ($1, 'BET_SETTLEMENT', 'bet', $2, $3, 0, $3, 'HIGH', 'OPEN', 'Settled winning bet missing payout transaction')
      ON CONFLICT DO NOTHING;
    `, [caseId, b.bet_id, parseFloat(b.potential_payout)]);
    casesCreated++;
  }

  return { casesCreated, missingPayoutsCount: wonBetsWithoutPayout.rows.length };
}

/**
 * 4. Data Integrity Checker (Orphaned Records & Invalid Foreign Keys)
 */
export async function runDataIntegrityChecker() {
  let casesCreated = 0;

  // Orphaned profiles check
  const orphanProfiles = await query(`
    SELECT p.user_id
    FROM user_profiles p
    LEFT JOIN users u ON p.user_id = u.user_id
    WHERE u.user_id IS NULL;
  `);

  for (const p of orphanProfiles.rows) {
    const caseId = `case_integ_${p.user_id}_${Date.now()}`;
    await query(`
      INSERT INTO reconciliation_cases (id, reconciliation_type, entity_type, entity_id, severity, status, notes)
      VALUES ($1, 'DATA_INTEGRITY', 'user_profile', $2, 'MEDIUM', 'OPEN', 'Orphaned user_profile record without user')
      ON CONFLICT DO NOTHING;
    `, [caseId, p.user_id]);
    casesCreated++;
  }

  return { casesCreated, orphanProfilesCount: orphanProfiles.rows.length };
}

/**
 * Fetch Reconciliation Metrics & Cases List for Admin UI
 */
export async function getReconciliationCasesMetrics() {
  try {
    const metricsRes = await query(`
      SELECT
        COALESCE(SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END), 0) AS open_cases,
        COALESCE(SUM(CASE WHEN status = 'INVESTIGATING' THEN 1 ELSE 0 END), 0) AS investigating_cases,
        COALESCE(SUM(CASE WHEN status = 'ESCALATED' THEN 1 ELSE 0 END), 0) AS escalated_cases,
        COALESCE(SUM(CASE WHEN status = 'RESOLVED' THEN 1 ELSE 0 END), 0) AS resolved_cases,
        COUNT(*) AS total_cases
      FROM reconciliation_cases;
    `);

    const casesRes = await query(`
      SELECT id, reconciliation_type, entity_type, entity_id, expected_value, actual_value, difference, severity, status, detected_at, notes
      FROM reconciliation_cases
      ORDER BY detected_at DESC
      LIMIT 50;
    `);

    const m = metricsRes.rows[0];
    return {
      success: true,
      openCases: parseInt(m.open_cases, 10),
      investigatingCases: parseInt(m.investigating_cases, 10),
      escalatedCases: parseInt(m.escalated_cases, 10),
      resolvedCases: parseInt(m.resolved_cases, 10),
      totalCases: parseInt(m.total_cases, 10),
      cases: casesRes.rows,
    };
  } catch (err) {
    return { success: false, openCases: 0, investigatingCases: 0, escalatedCases: 0, resolvedCases: 0, totalCases: 0, cases: [] };
  }
}

export const runFinancialReconciliation = runFinancialLedgerAudit;
