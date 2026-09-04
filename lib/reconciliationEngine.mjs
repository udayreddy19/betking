import { query } from '../db/pg.js';

/**
 * Multi-Domain Financial & Data Integrity Reconciliation Engine
 * Automatically detects discrepancies and generates actionable reconciliation_cases.
 * Never auto-repairs wallet balances.
 */

function mapOverallHealthStatus({ totalCasesOpen = 0, critical = 0, high = 0, warningSignals = 0 } = {}) {
  if (critical > 0) return 'CRITICAL';
  if (high > 0 || totalCasesOpen >= 5) return 'DISCREPANCY';
  if (totalCasesOpen > 0 || warningSignals > 0) return 'WARNING';
  return 'HEALTHY';
}

/**
 * Platform-wide wallet bucket totals (read-only snapshot — no repairs).
 */
export async function getWalletBucketTotals() {
  const res = await query(`
    SELECT
      COUNT(*)::int AS wallet_count,
      COALESCE(SUM(balance), 0)::float AS cash_balance,
      COALESCE(SUM(COALESCE(winnings_balance, 0)), 0)::float AS winnings_balance,
      COALESCE(SUM(COALESCE(locked_deposit_balance, 0)), 0)::float AS locked_deposit_balance,
      COALESCE(SUM(COALESCE(bonus_balance, 0)), 0)::float AS bonus_balance,
      COALESCE(SUM(COALESCE(freebet_balance, 0)), 0)::float AS freebet_balance,
      COALESCE(SUM(COALESCE(reserved_balance, 0)), 0)::float AS reserved_withdrawal_balance
    FROM wallets
  `).catch(async () => query(`
    SELECT
      COUNT(*)::int AS wallet_count,
      COALESCE(SUM(balance), 0)::float AS cash_balance,
      0::float AS winnings_balance,
      0::float AS locked_deposit_balance,
      COALESCE(SUM(COALESCE(bonus_balance, 0)), 0)::float AS bonus_balance,
      0::float AS freebet_balance,
      COALESCE(SUM(COALESCE(reserved_balance, 0)), 0)::float AS reserved_withdrawal_balance
    FROM wallets
  `));

  const row = res.rows[0] || {};
  const cash = Number(row.cash_balance || 0);
  const winnings = Number(row.winnings_balance || 0);
  const locked = Number(row.locked_deposit_balance || 0);
  const bonus = Number(row.bonus_balance || 0);
  const freebet = Number(row.freebet_balance || 0);
  const reserved = Number(row.reserved_withdrawal_balance || 0);
  return {
    walletCount: Number(row.wallet_count || 0),
    cashBalance: cash,
    winningsBalance: winnings,
    lockedDepositBalance: locked,
    bonusBalance: bonus,
    freebetBalance: freebet,
    reservedWithdrawalBalance: reserved,
    calculatedWalletTotal: Number((cash + winnings + locked + bonus + freebet + reserved).toFixed(2)),
    note: 'Snapshot only — no auto-repair',
  };
}

/**
 * Flag negative balances / duplicate idempotency keys without mutating money.
 */
export async function runWalletBucketIntegrityAudit() {
  let casesCreated = 0;
  let warningSignals = 0;

  const negatives = await query(`
    SELECT wallet_id, user_id, balance,
           COALESCE(winnings_balance,0) AS winnings_balance,
           COALESCE(locked_deposit_balance,0) AS locked_deposit_balance,
           COALESCE(bonus_balance,0) AS bonus_balance,
           COALESCE(freebet_balance,0) AS freebet_balance,
           COALESCE(reserved_balance,0) AS reserved_balance
    FROM wallets
    WHERE balance < -0.01
       OR COALESCE(winnings_balance,0) < -0.01
       OR COALESCE(locked_deposit_balance,0) < -0.01
       OR COALESCE(bonus_balance,0) < -0.01
       OR COALESCE(freebet_balance,0) < -0.01
       OR COALESCE(reserved_balance,0) < -0.01
    LIMIT 200
  `).catch(() => ({ rows: [] }));

  for (const w of negatives.rows) {
    warningSignals += 1;
    const caseId = `case_neg_${w.wallet_id}_${Date.now()}`;
    await query(`
      INSERT INTO reconciliation_cases (id, reconciliation_type, entity_type, entity_id, expected_value, actual_value, difference, severity, status, notes)
      VALUES ($1, 'WALLET_BUCKET', 'wallet', $2, 0, $3, $3, 'CRITICAL', 'OPEN', $4)
      ON CONFLICT DO NOTHING
    `, [caseId, w.wallet_id, Number(w.balance), `Negative bucket(s) for user ${w.user_id}`]).catch(() => null);
    casesCreated += 1;
  }

  const dupIdem = await query(`
    SELECT key AS idempotency_key, COUNT(*)::int AS cnt
    FROM idempotency_keys
    WHERE key IS NOT NULL AND key <> ''
    GROUP BY key
    HAVING COUNT(*) > 1
    LIMIT 50
  `).catch(() => ({ rows: [] }));

  for (const row of dupIdem.rows) {
    const caseId = `case_idem_${String(row.idempotency_key).slice(0, 40)}_${Date.now()}`;
    await query(`
      INSERT INTO reconciliation_cases (id, reconciliation_type, entity_type, entity_id, expected_value, actual_value, difference, severity, status, notes)
      VALUES ($1, 'IDEMPOTENCY', 'transaction_idempotency_key', $2, 1, $3, $4, 'HIGH', 'OPEN', 'Duplicate idempotency key')
      ON CONFLICT DO NOTHING
    `, [caseId, row.idempotency_key, row.cnt, row.cnt - 1]).catch(() => null);
    casesCreated += 1;
  }

  return { casesCreated, warningSignals, negatives: negatives.rows.length, duplicateIdempotencyKeys: dupIdem.rows.length };
}

export async function runFullReconciliationAudit() {
  console.log('🔍 EXECUTING MULTI-DOMAIN RECONCILIATION & DATA INTEGRITY AUDIT...');

  const walletBuckets = await getWalletBucketTotals();
  const financialResult = await runFinancialLedgerAudit();
  const paymentResult = await runPaymentReconciliationAudit();
  const settlementResult = await runSettlementReconciliationAudit();
  const integrityResult = await runDataIntegrityChecker();
  const bucketIntegrity = await runWalletBucketIntegrityAudit();

  const totalCasesOpen = (financialResult.casesCreated || 0)
    + (paymentResult.casesCreated || 0)
    + (settlementResult.casesCreated || 0)
    + (integrityResult.casesCreated || 0)
    + (bucketIntegrity.casesCreated || 0);

  const critical = Number(bucketIntegrity.negatives || 0) + Number(paymentResult.duplicatesFound || 0);
  const high = Number(financialResult.mismatchCount || 0) + Number(settlementResult.missingPayoutsCount || 0);
  const healthStatus = mapOverallHealthStatus({
    totalCasesOpen,
    critical,
    high,
    warningSignals: bucketIntegrity.warningSignals || 0,
  });

  return {
    success: true,
    timestamp: new Date().toISOString(),
    // Legacy alias preserved for existing UI
    overallStatus: healthStatus === 'HEALTHY' ? 'HEALTHY_RECONCILED' : 'DISCREPANCIES_DETECTED',
    healthStatus,
    walletBuckets,
    financialResult,
    paymentResult,
    settlementResult,
    integrityResult,
    bucketIntegrity,
    totalNewCasesCreated: totalCasesOpen,
    autoRepair: false,
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

  // Promo bucket movements (spin/signup/deposit freebet/admin reward) write ledger rows
  // whose balance_after is the promo bucket — exclude them from cash ↔ ledger audit.
  const PROMO_METHOD_SQL = `
    COALESCE(t.method, '') ILIKE '%FREEBET%'
    OR COALESCE(t.method, '') ILIKE '%SPIN%'
    OR COALESCE(t.method, '') ILIKE '%SIGNUP%'
    OR COALESCE(t.method, '') IN ('ADMIN_REWARD', 'DEPOSIT_FREEBET', 'REFERRAL', 'SPIN_EXPIRED')
    OR COALESCE(le.description, '') ILIKE '%freebet%'
    OR COALESCE(le.description, '') ILIKE '%daily spin%'
    OR COALESCE(le.description, '') ILIKE '%signup promo%'
    OR COALESCE(le.description, '') ILIKE '%spin prize expired%'
  `;

  for (const w of walletsRes.rows) {
    const actualBalance = parseFloat(w.balance);

    const ledgerRes = await query(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'CREDIT' THEN amount ELSE 0 END), 0) AS total_credits,
        COALESCE(SUM(CASE WHEN type = 'DEBIT' THEN amount ELSE 0 END), 0) AS total_debits
      FROM ledger_entries le
      LEFT JOIN transactions t ON t.transaction_id = le.transaction_id
      WHERE le.wallet_id = $1
        AND NOT (${PROMO_METHOD_SQL});
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
      const caseId = `case_fin_${w.wallet_id}_${Date.now()}`;
      await query(`
        INSERT INTO reconciliation_cases (id, reconciliation_type, entity_type, entity_id, expected_value, actual_value, difference, severity, status, notes)
        VALUES ($1, 'FINANCIAL_LEDGER', 'wallet', $2, $3, $4, $5, 'HIGH', 'OPEN', $6)
        ON CONFLICT DO NOTHING;
      `, [caseId, w.wallet_id, expectedLedgerBalance, actualBalance, delta, `Cash wallet vs cash-only ledger for ${w.email}`]);
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
