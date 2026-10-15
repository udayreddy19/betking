/**
 * Read-mostly reconciliation triage playbook.
 * Investigates OPEN cases, recommends actions, and only mutates when an
 * explicit repair action is requested (never from audit alone).
 */
import { query } from '../db/pg.js';

function classifyLedgerMismatch({ cashBalance, ledgerSum, entryCount, reservedBalance = 0 }) {
  const cashDelta = Number(cashBalance) - Number(ledgerSum);
  const absCash = Math.abs(cashDelta);
  if (absCash < 0.05) {
    return { mismatchType: 'IN_BALANCE', likelyCause: 'NONE', financialRisk: 'LOW' };
  }
  if (Number(reservedBalance) > 0.01 && Math.abs(cashDelta - Number(reservedBalance)) < 0.01) {
    return { mismatchType: 'ACTIVE_WITHDRAWAL_HOLD', likelyCause: 'RESERVED_BALANCE_HOLD', financialRisk: 'LOW' };
  }
  if (entryCount === 0 && cashBalance > 0.01) {
    return {
      mismatchType: 'EMPTY_LEDGER_POSITIVE_WALLET',
      likelyCause: 'LEGACY_PRE_LEDGER_OR_MIGRATION',
      financialRisk: 'MEDIUM',
    };
  }
  if (entryCount > 0 && cashBalance === 0 && ledgerSum > 0.01) {
    return {
      mismatchType: 'WALLET_ZERO_LEDGER_POSITIVE',
      likelyCause: 'MISSING_WALLET_UPDATE_OR_EXTRA_LEDGER_CREDIT',
      financialRisk: 'HIGH',
    };
  }
  if (ledgerSum < -0.01 && cashBalance >= 0) {
    return {
      mismatchType: 'LEDGER_NET_NEGATIVE',
      likelyCause: 'MISSING_OPENING_CREDIT_OR_EXTRA_DEBIT',
      financialRisk: 'HIGH',
    };
  }
  return {
    mismatchType: 'CASH_LEDGER_DELTA',
    likelyCause: 'UNSPECIFIED_MISMATCH',
    financialRisk: 'HIGH',
  };
}

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

function money(n) {
  return Number(Number(n || 0).toFixed(2));
}

async function loadWalletSnapshot(walletId) {
  const w = await query(
    `SELECT w.*, u.email
     FROM wallets w
     LEFT JOIN users u ON u.user_id = w.user_id
     WHERE w.wallet_id = $1`,
    [walletId],
  );
  const wallet = w.rows[0] || null;
  if (!wallet) return null;

  const ledger = await query(
    `SELECT
       COALESCE(SUM(CASE WHEN le.type = 'CREDIT' THEN le.amount ELSE 0 END), 0)::float8 AS credits,
       COALESCE(SUM(CASE WHEN le.type = 'DEBIT' THEN le.amount ELSE 0 END), 0)::float8 AS debits,
       COUNT(*)::int AS entry_count
     FROM ledger_entries le
     LEFT JOIN transactions t ON t.transaction_id = le.transaction_id
     WHERE le.wallet_id = $1
       AND NOT (${PROMO_METHOD_SQL})`,
    [walletId],
  );
  const row = ledger.rows[0] || {};
  const credits = money(row.credits);
  const debits = money(row.debits);
  const ledgerSum = money(credits - debits);
  const cash = money(wallet.balance);
  const bonus = money(wallet.bonus_balance);
  const freebet = money(wallet.freebet_balance);
  const locked = money(wallet.locked_deposit_balance);
  const reserved = money(wallet.reserved_balance);
  const winnings = money(wallet.winnings_balance);
  const spendableNegatives = {
    balance: cash < -0.01,
    bonus_balance: bonus < -0.01,
    freebet_balance: freebet < -0.01,
    locked_deposit_balance: locked < -0.01,
    reserved_balance: reserved < -0.01,
  };
  const hasSpendableNegative = Object.values(spendableNegatives).some(Boolean);

  return {
    walletId: wallet.wallet_id,
    userId: wallet.user_id,
    email: wallet.email || null,
    cash,
    bonus,
    freebet,
    locked,
    reserved,
    winnings,
    ledgerSum,
    ledgerCredits: credits,
    ledgerDebits: debits,
    entryCount: Number(row.entry_count || 0),
    cashVsLedgerDelta: money(cash - ledgerSum),
    spendableNegatives,
    hasSpendableNegative,
  };
}

function buildRecommendation(caseRow, snap) {
  const type = String(caseRow.reconciliation_type || '').toUpperCase();
  if (!snap) {
    return {
      verdict: 'MISSING_WALLET',
      financialRisk: 'HIGH',
      recommendedAction: 'investigate_manual',
      canAutoResolveFlag: false,
      canApplyOpeningLedger: false,
      steps: ['Wallet row missing for entity_id — investigate manually; do not resolve yet.'],
    };
  }

  if (type === 'WALLET_BUCKET') {
    if (!snap.hasSpendableNegative) {
      return {
        verdict: 'STALE_CLEARED',
        financialRisk: 'LOW',
        recommendedAction: 'resolve_flag_only',
        canAutoResolveFlag: true,
        canApplyOpeningLedger: false,
        steps: [
          'Recheck: spendable buckets (cash/bonus/freebet/locked/reserved) are all ≥ 0.',
          'winnings_balance is reporting P&L and may be negative by design — ignore for bucket integrity.',
          'Safe action: resolve the OPEN flag with note CLEARED_ON_RECHECK (balances unchanged).',
        ],
      };
    }
    return {
      verdict: 'ACTIVE_NEGATIVE_BUCKET',
      financialRisk: 'CRITICAL',
      recommendedAction: 'investigate_manual',
      canAutoResolveFlag: false,
      canApplyOpeningLedger: false,
      steps: [
        `Negative spendable bucket(s): ${JSON.stringify(snap.spendableNegatives)}`,
        'Do not auto-repair. Trace last debit that drove the bucket below zero.',
        'After manual correction, re-run open-summary and resolve the flag.',
      ],
    };
  }

  if (type === 'FINANCIAL_LEDGER') {
    const classified = classifyLedgerMismatch({
      cashBalance: snap.cash,
      ledgerSum: snap.ledgerSum,
      entryCount: snap.entryCount,
      reservedBalance: snap.reserved,
    });

    if (Math.abs(snap.cashVsLedgerDelta) < 0.05) {
      return {
        verdict: 'STALE_CLEARED',
        financialRisk: 'LOW',
        recommendedAction: 'resolve_flag_only',
        canAutoResolveFlag: true,
        canApplyOpeningLedger: false,
        classification: classified,
        steps: [
          'Recheck: |cash − cash-ledger| < 0.05.',
          'Safe action: resolve flag only (CLEARED_ON_RECHECK).',
        ],
      };
    }

    if (classified.mismatchType === 'EMPTY_LEDGER_POSITIVE_WALLET') {
      return {
        verdict: classified.mismatchType,
        financialRisk: classified.financialRisk,
        recommendedAction: 'apply_opening_ledger',
        canAutoResolveFlag: false,
        canApplyOpeningLedger: true,
        classification: classified,
        steps: [
          'Wallet has cash but no cash-ledger rows (legacy/opening gap).',
          'Use legacy apply-opening-ledger with explicit admin confirmation.',
          'Then resolve the flag — never invent ledger silently from audit.',
        ],
      };
    }

    return {
      verdict: classified.mismatchType || 'LEDGER_MISMATCH',
      financialRisk: classified.financialRisk || 'HIGH',
      recommendedAction: 'investigate_manual',
      canAutoResolveFlag: false,
      canApplyOpeningLedger: false,
      classification: classified,
      steps: [
        `Cash=${snap.cash} ledger=${snap.ledgerSum} delta=${snap.cashVsLedgerDelta} entries=${snap.entryCount}`,
        `Likely cause: ${classified.likelyCause || 'UNKNOWN'}`,
        'Investigate deposits/withdrawals/settlements; correct ledger or wallet explicitly; then resolve flag.',
      ],
    };
  }

  return {
    verdict: 'UNSUPPORTED_TYPE',
    financialRisk: 'MEDIUM',
    recommendedAction: 'investigate_manual',
    canAutoResolveFlag: false,
    canApplyOpeningLedger: false,
    steps: [`No automated playbook for type ${type}. Review in Finance Health.`],
  };
}

/**
 * Investigate all OPEN cases (or a single id) and return playbook rows.
 */
export async function investigateOpenReconCases({ caseId = null, limit = 50 } = {}) {
  const params = [];
  let sql = `
    SELECT id, reconciliation_type, entity_type, entity_id, severity, status,
           expected_value, actual_value, difference, notes, detected_at,
           mismatch_category, suspected_cause
    FROM reconciliation_cases
    WHERE UPPER(status) = 'OPEN'
  `;
  if (caseId) {
    params.push(caseId);
    sql += ` AND id = $${params.length}`;
  }
  params.push(Math.min(200, Math.max(1, Number(limit) || 50)));
  sql += ` ORDER BY
      CASE UPPER(severity) WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 ELSE 2 END,
      ABS(COALESCE(difference, 0)) DESC
    LIMIT $${params.length}`;

  const cases = await query(sql, params);
  const playbook = [];
  for (const row of cases.rows) {
    const snap = row.entity_type && String(row.entity_type).toLowerCase() === 'wallet'
      ? await loadWalletSnapshot(row.entity_id)
      : null;
    const rec = buildRecommendation(row, snap);
    playbook.push({
      caseId: row.id,
      type: row.reconciliation_type,
      severity: row.severity,
      entityId: row.entity_id,
      notes: row.notes,
      snapshot: snap,
      ...rec,
    });
  }

  const summary = {
    openInvestigated: playbook.length,
    staleCleared: playbook.filter((p) => p.verdict === 'STALE_CLEARED').length,
    activeNegative: playbook.filter((p) => p.verdict === 'ACTIVE_NEGATIVE_BUCKET').length,
    needsManual: playbook.filter((p) => p.recommendedAction === 'investigate_manual').length,
    openingLedgerCandidates: playbook.filter((p) => p.canApplyOpeningLedger).length,
  };

  return {
    success: true,
    autoRepair: false,
    note: 'Investigation only. Resolve/repair requires explicit admin action.',
    summary,
    playbook,
  };
}

/**
 * Resolve OPEN flags that recheck as STALE_CLEARED. Does not change balances.
 */
export async function resolveStaleClearedReconCases({
  caseIds = null,
  adminId = 'admin',
  dryRun = true,
} = {}) {
  const report = await investigateOpenReconCases({ limit: 200 });
  const targets = report.playbook.filter((p) => {
    if (!p.canAutoResolveFlag || p.verdict !== 'STALE_CLEARED') return false;
    if (Array.isArray(caseIds) && caseIds.length) return caseIds.includes(p.caseId);
    return true;
  });

  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      wouldResolve: targets.map((t) => t.caseId),
      count: targets.length,
      note: 'Pass dryRun=false to resolve flags only. Balances unchanged.',
    };
  }

  const resolved = [];
  const note = `CLEARED_ON_RECHECK by ${adminId} at ${new Date().toISOString()} (balances unchanged)`;
  for (const t of targets) {
    try {
      await query(
        `UPDATE reconciliation_cases
         SET status = 'RESOLVED', resolution = $1, resolved_at = NOW()
         WHERE id = $2 AND UPPER(status) = 'OPEN'`,
        [note, t.caseId],
      );
    } catch {
      await query(
        `UPDATE reconciliation_cases
         SET status = 'RESOLVED', notes = COALESCE(notes,'') || $1
         WHERE id = $2 AND UPPER(status) = 'OPEN'`,
        [` | ${note}`, t.caseId],
      );
    }
    resolved.push(t.caseId);
  }

  return {
    success: true,
    dryRun: false,
    resolved,
    count: resolved.length,
    note: 'Flags resolved only. No wallet or ledger mutations.',
  };
}
