/**
 * Offset orphan "System adjustment: Reset seed/mock…" DEBIT rows so cash-ledger
 * matches wallet cash — without changing wallet balances.
 *
 * Safe only when dry-run proves post-offset |cash − cash_ledger| < 0.05.
 */
import crypto from 'crypto';
import { query } from '../db/pg.js';
import { isKnownTestFundingUser } from './knownTestFundingExclusions.mjs';

const SEED_DEBIT_SQL = `
  (le.description ILIKE 'System adjustment: Reset seed/mock%'
   OR le.description ILIKE 'System adjustment: Reset to net deposited%')
`;

const PROMO_EXCL_SQL = `
  COALESCE(t.method, '') ILIKE '%FREEBET%'
  OR COALESCE(t.method, '') ILIKE '%SPIN%'
  OR COALESCE(t.method, '') ILIKE '%SIGNUP%'
  OR COALESCE(t.method, '') IN ('ADMIN_REWARD', 'DEPOSIT_FREEBET', 'REFERRAL', 'SPIN_EXPIRED')
  OR COALESCE(le.description, '') ILIKE '%freebet%'
  OR COALESCE(le.description, '') ILIKE '%daily spin%'
  OR COALESCE(le.description, '') ILIKE '%signup promo%'
  OR COALESCE(le.description, '') ILIKE '%spin prize expired%'
`;

async function cashLedgerSum(walletId) {
  const res = await query(
    `SELECT COALESCE(SUM(CASE WHEN le.type='CREDIT' THEN le.amount ELSE -le.amount END),0)::float8 AS s
     FROM ledger_entries le
     LEFT JOIN transactions t ON t.transaction_id = le.transaction_id
     WHERE le.wallet_id = $1 AND NOT (${PROMO_EXCL_SQL})`,
    [walletId],
  );
  return Number(res.rows[0]?.s || 0);
}

/**
 * Preview / apply offset credits for orphan seed-reset debits.
 */
export async function offsetSeedResetLedgerDebits({
  dryRun = true,
  adminId = 'admin',
  walletIds = null,
} = {}) {
  const params = [];
  let filter = '';
  if (Array.isArray(walletIds) && walletIds.length) {
    params.push(walletIds);
    filter = `AND w.wallet_id = ANY($${params.length}::text[])`;
  }

  const candidates = await query(
    `SELECT w.wallet_id, w.user_id, w.balance::float8 AS cash,
            COALESCE(SUM(le.amount),0)::float8 AS seed_debit_total,
            COUNT(*)::int AS seed_debit_count
     FROM wallets w
     JOIN ledger_entries le ON le.wallet_id = w.wallet_id
     WHERE le.type = 'DEBIT'
       AND ${SEED_DEBIT_SQL}
       AND NOT EXISTS (
         SELECT 1 FROM ledger_entries c
         WHERE c.wallet_id = le.wallet_id
           AND c.type = 'CREDIT'
           AND c.description ILIKE 'Recon offset: seed-reset debit%'
           AND ABS(c.amount - le.amount) < 0.01
       )
     ${filter}
     GROUP BY w.wallet_id, w.user_id, w.balance
     HAVING COALESCE(SUM(le.amount),0) > 0.01`,
    params,
  );

  const plan = [];
  for (const row of candidates.rows) {
    const cash = Number(row.cash || 0);
    const seedDebit = Number(row.seed_debit_total || 0);
    const before = await cashLedgerSum(row.wallet_id);
    const after = Number((before + seedDebit).toFixed(2));
    const deltaAfter = Math.abs(cash - after);
    const safe = deltaAfter < 0.05
      || (Math.abs(cash) < 0.01 && Math.abs(after) < 0.05)
      || (Math.abs(cash) < 0.01 && Math.abs(before + seedDebit) < Math.abs(before) + 0.01 && Math.abs(before + seedDebit) < 1);
    // Prefer offsets that make zero-cash wallets reconcile, or improve to <0.05
    const recommend = Math.abs(cash) < 0.01 && Math.abs(after) < 0.05;
    plan.push({
      walletId: row.wallet_id,
      userId: row.user_id,
      knownTest: isKnownTestFundingUser(row.user_id),
      cash,
      seedDebitTotal: seedDebit,
      seedDebitCount: row.seed_debit_count,
      cashLedgerBefore: Number(before.toFixed(2)),
      cashLedgerAfter: after,
      deltaAfter: Number(deltaAfter.toFixed(2)),
      recommend,
      safe: recommend || safe,
    });
  }

  const applicable = plan.filter((p) => p.recommend);
  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      autoRepairWallet: false,
      candidates: plan,
      wouldOffset: applicable,
      count: applicable.length,
      note: 'Pass dryRun=false to insert offset CREDITs only for recommend=true rows. Wallet balances unchanged.',
    };
  }

  const applied = [];
  for (const p of applicable) {
    const txId = `tx_recon_seed_offset_${crypto.randomBytes(8).toString('hex')}`;
    await query(
      `INSERT INTO transactions (
         transaction_id, user_id, type, amount, status, method, created_at
       ) VALUES ($1, $2, 'ADJUSTMENT', $3, 'COMPLETED', 'RECON_SEED_OFFSET', NOW())`,
      [txId, p.userId, p.seedDebitTotal],
    );

    await query(
      `INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description, created_at)
       VALUES ($1, $2, 'CREDIT', $3, $4, $5, NOW())`,
      [
        p.walletId,
        txId,
        p.seedDebitTotal,
        p.cash,
        `Recon offset: seed-reset debit ₹${p.seedDebitTotal} (no wallet mutation) by ${adminId}`,
      ],
    );

    // Resolve OPEN FINANCIAL_LEDGER / WALLET_BUCKET cases for this wallet if now clean
    const after = await cashLedgerSum(p.walletId);
    if (Math.abs(p.cash - after) < 0.05) {
      await query(
        `UPDATE reconciliation_cases
         SET status = 'RESOLVED',
             resolution = $2,
             resolution_classification = 'RESOLVED_BY_APPROVED_ADJUSTMENT',
             linked_adjustment_id = $3,
             resolved_at = NOW(),
             reviewer = $4,
             investigation_status = 'RESOLVED_BY_APPROVED_ADJUSTMENT',
             last_checked_at = NOW()
         WHERE entity_id = $1
           AND UPPER(status) = 'OPEN'
           AND UPPER(reconciliation_type) IN ('FINANCIAL_LEDGER','WALLET_BUCKET')`,
        [
          p.walletId,
          `Seed-reset DEBIT offset via ${txId}; wallet balance unchanged; cash↔ledger within 0.05`,
          txId,
          adminId,
        ],
      ).catch(() => null);
    }

    applied.push({ ...p, adjustmentId: txId, cashLedgerAfter: Number(after.toFixed(2)) });
  }

  return {
    success: true,
    dryRun: false,
    autoRepairWallet: false,
    applied,
    count: applied.length,
    note: 'Offset CREDITs inserted. Wallet balances unchanged.',
  };
}

/**
 * Accept remaining OPEN FINANCIAL_LEDGER cases for known test-funding users
 * (or explicit caseIds) with ACCEPTED_WITH_EVIDENCE — no money movement.
 */
export async function acceptKnownTestFundingReconCases({
  dryRun = true,
  adminId = 'admin',
  caseIds = null,
} = {}) {
  const open = await query(
    `SELECT c.id, c.entity_id, c.reconciliation_type, c.difference, w.user_id, w.balance
     FROM reconciliation_cases c
     JOIN wallets w ON w.wallet_id = c.entity_id
     WHERE UPPER(c.status) = 'OPEN'
       AND UPPER(c.reconciliation_type) = 'FINANCIAL_LEDGER'`,
  );

  const targets = open.rows.filter((r) => {
    if (Array.isArray(caseIds) && caseIds.length) return caseIds.includes(r.id);
    return isKnownTestFundingUser(r.user_id);
  });

  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      wouldAccept: targets.map((t) => t.id),
      count: targets.length,
      note: 'Pass dryRun=false to mark ACCEPTED_WITH_EVIDENCE. Balances unchanged.',
    };
  }

  const accepted = [];
  for (const t of targets) {
    await query(
      `UPDATE reconciliation_cases
       SET status = 'RESOLVED',
           resolution = $2,
           resolution_classification = 'ACCEPTED_WITH_EVIDENCE',
           resolved_at = NOW(),
           reviewer = $3,
           investigation_status = 'ACCEPTED_WITH_EVIDENCE',
           last_checked_at = NOW(),
           evidence = COALESCE(evidence, '{}'::jsonb) || $4::jsonb
       WHERE id = $1 AND UPPER(status) = 'OPEN'`,
      [
        t.id,
        `Known test-funding / seed-reset ledger skew accepted with evidence by ${adminId}. No wallet mutation.`,
        adminId,
        JSON.stringify({
          acceptedAt: new Date().toISOString(),
          userId: t.userId,
          cash: t.balance,
          difference: t.difference,
          policy: 'KNOWN_TEST_FUNDING_ACCEPTANCE',
        }),
      ],
    );
    accepted.push(t.id);
  }

  return {
    success: true,
    dryRun: false,
    accepted,
    count: accepted.length,
    note: 'Flags accepted with evidence. Balances unchanged.',
  };
}
