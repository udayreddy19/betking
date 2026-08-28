/**
 * Finance Daily Closing — flag-only pack.
 * Aggregates day activity from authoritative tables. Does NOT mutate wallets/ledger.
 */

import crypto from 'crypto';
import { query, queryRead } from '../db/pg.js';

function closingIdFor(dateStr) {
  return `fdc_${String(dateStr).replace(/-/g, '')}`;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Build a read-only day pack from deposits / withdrawals / transactions / ledger.
 */
export async function computeDailyClosingSnapshot(closingDate) {
  const dateStr = String(closingDate).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const err = new Error('closingDate must be YYYY-MM-DD');
    err.code = 'INVALID_DATE';
    err.status = 400;
    throw err;
  }

  const dayStart = `${dateStr}T00:00:00.000Z`;
  const dayEndExclusive = new Date(Date.parse(dayStart) + 86400000).toISOString();

  const [
    deposits,
    withdrawals,
    bets,
    wins,
    freebet,
    bonus,
    ledgerNet,
    walletTotals,
  ] = await Promise.all([
    queryRead(
      `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*)::int AS cnt
       FROM transactions
       WHERE type = 'DEPOSIT' AND status = 'SUCCESS'
         AND created_at >= $1::timestamptz AND created_at < $2::timestamptz`,
      [dayStart, dayEndExclusive],
    ).catch(() => ({ rows: [{ total: 0, cnt: 0 }] })),
    queryRead(
      `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*)::int AS cnt
       FROM withdrawals
       WHERE status IN ('APPROVED', 'PAID', 'COMPLETED', 'SUCCESS')
         AND created_at >= $1::timestamptz
         AND created_at < $2::timestamptz`,
      [dayStart, dayEndExclusive],
    ).catch(() => ({ rows: [{ total: 0, cnt: 0 }] })),
    queryRead(
      `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*)::int AS cnt
       FROM transactions
       WHERE type = 'BET_STAKE' AND status = 'SUCCESS'
         AND created_at >= $1::timestamptz AND created_at < $2::timestamptz`,
      [dayStart, dayEndExclusive],
    ).catch(() => ({ rows: [{ total: 0, cnt: 0 }] })),
    queryRead(
      `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*)::int AS cnt
       FROM transactions
       WHERE type IN ('BET_WIN', 'SETTLEMENT_PAYOUT', 'CASHOUT') AND status = 'SUCCESS'
         AND created_at >= $1::timestamptz AND created_at < $2::timestamptz`,
      [dayStart, dayEndExclusive],
    ).catch(() => ({ rows: [{ total: 0, cnt: 0 }] })),
    queryRead(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM ledger_entries
       WHERE type = 'CREDIT'
         AND description ILIKE '%freebet%'
         AND created_at >= $1::timestamptz AND created_at < $2::timestamptz`,
      [dayStart, dayEndExclusive],
    ).catch(() => ({ rows: [{ total: 0 }] })),
    queryRead(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM ledger_entries
       WHERE type = 'CREDIT'
         AND (description ILIKE '%bonus%' OR description ILIKE '%promo%')
         AND created_at >= $1::timestamptz AND created_at < $2::timestamptz`,
      [dayStart, dayEndExclusive],
    ).catch(() => ({ rows: [{ total: 0 }] })),
    queryRead(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'CREDIT' THEN amount ELSE 0 END), 0) AS credits,
         COALESCE(SUM(CASE WHEN type = 'DEBIT' THEN amount ELSE 0 END), 0) AS debits
       FROM ledger_entries
       WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz`,
      [dayStart, dayEndExclusive],
    ).catch(() => ({ rows: [{ credits: 0, debits: 0 }] })),
    queryRead(
      `SELECT
         COALESCE(SUM(balance), 0) AS cash_total,
         COALESCE(SUM(COALESCE(reserved_balance, 0)), 0) AS reserved_total,
         COUNT(*)::int AS wallet_count
       FROM wallets`,
    ).catch(() => ({ rows: [{ cash_total: 0, reserved_total: 0, wallet_count: 0 }] })),
  ]);

  const depositsTotal = num(deposits.rows[0]?.total);
  const withdrawalsTotal = num(withdrawals.rows[0]?.total);
  const betStakesTotal = num(bets.rows[0]?.total);
  const betPayoutsTotal = num(wins.rows[0]?.total);
  const freebetTotal = num(freebet.rows[0]?.total);
  const bonusTotal = num(bonus.rows[0]?.total);
  const credits = num(ledgerNet.rows[0]?.credits);
  const debits = num(ledgerNet.rows[0]?.debits);
  const ledgerNetVal = credits - debits;
  const actualClosing = num(walletTotals.rows[0]?.cash_total);

  // Opening is not historically snapshotted — mark UNAVAILABLE for past days.
  // For today we can only present current wallet total as ACTUAL (point-in-time).
  const openingWalletTotal = null;
  const expectedClosing = null;
  const difference = null;

  let reconStatus = 'REVIEW_REQUIRED';
  try {
    const openCases = await queryRead(
      `SELECT COUNT(*)::int AS cnt FROM reconciliation_cases
       WHERE status IN ('OPEN', 'INVESTIGATING')`,
    );
    reconStatus = num(openCases.rows[0]?.cnt) > 0 ? 'EXCEPTIONS_OPEN' : 'NO_OPEN_EXCEPTIONS';
  } catch {
    reconStatus = 'RECON_UNAVAILABLE';
  }

  const lines = [
    {
      metric: 'opening_wallet_total',
      expected: openingWalletTotal,
      actual: openingWalletTotal,
      difference: null,
      status: 'UNAVAILABLE',
      note: 'Historical opening balances are not snapshotted; do not invent.',
    },
    {
      metric: 'deposits',
      expected: depositsTotal,
      actual: depositsTotal,
      difference: 0,
      status: 'OK',
      count: deposits.rows[0]?.cnt || 0,
    },
    {
      metric: 'withdrawals_completed',
      expected: withdrawalsTotal,
      actual: withdrawalsTotal,
      difference: 0,
      status: 'OK',
      count: withdrawals.rows[0]?.cnt || 0,
    },
    {
      metric: 'bet_stakes',
      expected: betStakesTotal,
      actual: betStakesTotal,
      difference: 0,
      status: 'OK',
      count: bets.rows[0]?.cnt || 0,
    },
    {
      metric: 'bet_payouts',
      expected: betPayoutsTotal,
      actual: betPayoutsTotal,
      difference: 0,
      status: 'OK',
      count: wins.rows[0]?.cnt || 0,
    },
    {
      metric: 'freebet_credits',
      expected: freebetTotal,
      actual: freebetTotal,
      difference: 0,
      status: 'OK',
    },
    {
      metric: 'bonus_promo_credits',
      expected: bonusTotal,
      actual: bonusTotal,
      difference: 0,
      status: 'OK',
    },
    {
      metric: 'ledger_net',
      expected: ledgerNetVal,
      actual: ledgerNetVal,
      difference: 0,
      status: 'OK',
      credits,
      debits,
    },
    {
      metric: 'closing_wallet_total',
      expected: expectedClosing,
      actual: actualClosing,
      difference,
      status: 'POINT_IN_TIME',
      note: 'Actual is current wallet SUM(balance), not end-of-day historical.',
    },
  ];

  return {
    closingDate: dateStr,
    methodology:
      'Day totals from transactions/withdrawals/ledger. Opening/expected closing UNAVAILABLE without historical wallet snapshots. Never auto-repairs.',
    depositsTotal,
    withdrawalsTotal,
    betStakesTotal,
    betPayoutsTotal,
    freebetTotal,
    bonusTotal,
    ledgerNet: ledgerNetVal,
    openingWalletTotal,
    closingWalletTotal: actualClosing,
    expectedClosing,
    actualClosing,
    difference,
    reconStatus,
    walletCount: walletTotals.rows[0]?.wallet_count || 0,
    lines,
    computedAt: new Date().toISOString(),
  };
}

export async function getOrOpenDailyClosing(closingDate, { adminId = null } = {}) {
  const snap = await computeDailyClosingSnapshot(closingDate);
  const id = closingIdFor(snap.closingDate);

  const existing = await query(
    `SELECT * FROM finance_daily_closings WHERE closing_date = $1::date`,
    [snap.closingDate],
  ).catch(() => ({ rows: [] }));

  if (existing.rows[0]) {
    return { success: true, closing: existing.rows[0], snapshot: snap };
  }

  await query(
    `INSERT INTO finance_daily_closings (
       closing_id, closing_date, status,
       opening_wallet_total, closing_wallet_total,
       deposits_total, withdrawals_total, bet_stakes_total, bet_payouts_total,
       freebet_total, bonus_total, ledger_net,
       expected_closing, actual_closing, difference, recon_status, snapshot
     ) VALUES (
       $1, $2::date, 'OPEN',
       $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb
     )
     ON CONFLICT (closing_date) DO NOTHING`,
    [
      id,
      snap.closingDate,
      snap.openingWalletTotal,
      snap.closingWalletTotal,
      snap.depositsTotal,
      snap.withdrawalsTotal,
      snap.betStakesTotal,
      snap.betPayoutsTotal,
      snap.freebetTotal,
      snap.bonusTotal,
      snap.ledgerNet,
      snap.expectedClosing,
      snap.actualClosing,
      snap.difference,
      snap.reconStatus,
      JSON.stringify({ ...snap, openedBy: adminId || null }),
    ],
  );

  const row = await query(`SELECT * FROM finance_daily_closings WHERE closing_date = $1::date`, [
    snap.closingDate,
  ]);
  return { success: true, closing: row.rows[0], snapshot: snap };
}

export async function listDailyClosings({ limit = 30 } = {}) {
  const lim = Math.min(90, Math.max(1, Number(limit) || 30));
  const res = await query(
    `SELECT closing_id, closing_date, status, deposits_total, withdrawals_total,
            bet_stakes_total, bet_payouts_total, difference, recon_status,
            signed_off_by, signed_off_at, created_at, updated_at
     FROM finance_daily_closings
     ORDER BY closing_date DESC
     LIMIT $1`,
    [lim],
  );
  return { success: true, closings: res.rows };
}

export async function transitionDailyClosing({
  closingDate,
  action,
  adminId,
  reason = null,
  notes = null,
}) {
  const allowed = {
    review: { from: ['OPEN', 'REOPENED'], to: 'IN_REVIEW' },
    'sign-off': { from: ['IN_REVIEW', 'OPEN'], to: 'SIGNED_OFF' },
    reopen: { from: ['SIGNED_OFF', 'IN_REVIEW'], to: 'REOPENED' },
  };
  const spec = allowed[action];
  if (!spec) {
    const err = new Error('action must be review | sign-off | reopen');
    err.status = 400;
    err.code = 'INVALID_ACTION';
    throw err;
  }
  if (action === 'reopen' && !reason) {
    const err = new Error('reopen requires reason');
    err.status = 400;
    err.code = 'REASON_REQUIRED';
    throw err;
  }

  const snap = await computeDailyClosingSnapshot(closingDate);
  const current = await getOrOpenDailyClosing(closingDate, { adminId });
  const row = current.closing;
  if (!spec.from.includes(row.status)) {
    const err = new Error(`Cannot ${action} from status ${row.status}`);
    err.status = 409;
    err.code = 'INVALID_STATE';
    throw err;
  }

  const res = await query(
    `UPDATE finance_daily_closings SET
       status = $2,
       opening_wallet_total = $3,
       closing_wallet_total = $4,
       deposits_total = $5,
       withdrawals_total = $6,
       bet_stakes_total = $7,
       bet_payouts_total = $8,
       freebet_total = $9,
       bonus_total = $10,
       ledger_net = $11,
       expected_closing = $12,
       actual_closing = $13,
       difference = $14,
       recon_status = $15,
       signed_off_by = CASE WHEN $2 = 'SIGNED_OFF' THEN $16 ELSE signed_off_by END,
       signed_off_at = CASE WHEN $2 = 'SIGNED_OFF' THEN NOW() ELSE signed_off_at END,
       reopen_reason = CASE WHEN $2 = 'REOPENED' THEN $17 ELSE reopen_reason END,
       notes = COALESCE($18, notes),
       snapshot = $19::jsonb,
       updated_at = NOW()
     WHERE closing_id = $1
     RETURNING *`,
    [
      row.closing_id,
      spec.to,
      snap.openingWalletTotal,
      snap.closingWalletTotal,
      snap.depositsTotal,
      snap.withdrawalsTotal,
      snap.betStakesTotal,
      snap.betPayoutsTotal,
      snap.freebetTotal,
      snap.bonusTotal,
      snap.ledgerNet,
      snap.expectedClosing,
      snap.actualClosing,
      snap.difference,
      snap.reconStatus,
      adminId,
      reason,
      notes,
      JSON.stringify({ ...snap, lastAction: action, adminId }),
    ],
  );

  return { success: true, closing: res.rows[0], snapshot: snap };
}

export async function getFinanceControlCenterKpis() {
  const [
    deposits,
    withdrawalsByStatus,
    makerChecker,
    recon,
    failedTx,
    settlement,
  ] = await Promise.all([
    queryRead(
      `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*)::int AS cnt
       FROM transactions
       WHERE type = 'DEPOSIT' AND status = 'SUCCESS'
         AND created_at >= NOW() - INTERVAL '24 hours'`,
    ).catch(() => ({ rows: [{ total: 0, cnt: 0 }] })),
    queryRead(
      `SELECT status, COUNT(*)::int AS cnt, COALESCE(SUM(amount), 0) AS total
       FROM withdrawals
       WHERE created_at >= NOW() - INTERVAL '7 days'
       GROUP BY status`,
    ).catch(() => ({ rows: [] })),
    queryRead(
      `SELECT COUNT(*)::int AS cnt FROM maker_checker_requests
       WHERE status IN ('PENDING', 'AWAITING_CHECKER')`,
    ).catch(() => ({ rows: [{ cnt: 0 }] })),
    queryRead(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('OPEN', 'INVESTIGATING'))::int AS open_cases,
         COUNT(*) FILTER (WHERE severity = 'CRITICAL')::int AS critical_cases
       FROM reconciliation_cases`,
    ).catch(() => ({ rows: [{ open_cases: 0, critical_cases: 0 }] })),
    queryRead(
      `SELECT COUNT(*)::int AS cnt FROM transactions
       WHERE status IN ('FAILED', 'FAILURE')
         AND created_at >= NOW() - INTERVAL '24 hours'`,
    ).catch(() => ({ rows: [{ cnt: 0 }] })),
    queryRead(
      `SELECT status, COUNT(*)::int AS cnt FROM settlement_queue
       GROUP BY status`,
    ).catch(() => ({ rows: [] })),
  ]);

  const wd = {};
  for (const r of withdrawalsByStatus.rows) {
    wd[r.status] = { count: r.cnt, total: num(r.total) };
  }

  return {
    success: true,
    window: { deposits: '24h', withdrawals: '7d' },
    kpis: {
      deposits24h: { total: num(deposits.rows[0]?.total), count: deposits.rows[0]?.cnt || 0 },
      withdrawals: wd,
      pendingWithdrawals: wd.PENDING || wd.QUEUED || { count: 0, total: 0 },
      heldWithdrawals: wd.HELD || wd.ON_HOLD || { count: 0, total: 0 },
      approvedWithdrawals: wd.APPROVED || wd.PAID || wd.COMPLETED || { count: 0, total: 0 },
      rejectedWithdrawals: wd.REJECTED || wd.DENIED || { count: 0, total: 0 },
      pendingMakerChecker: makerChecker.rows[0]?.cnt || 0,
      reconciliationWarnings: recon.rows[0]?.open_cases || 0,
      criticalIssues: recon.rows[0]?.critical_cases || 0,
      failedTransactions24h: failedTx.rows[0]?.cnt || 0,
      settlementQueue: settlement.rows,
    },
    generatedAt: new Date().toISOString(),
  };
}

/** Test helper — deterministic id */
export function _closingIdForTest(dateStr) {
  return closingIdFor(dateStr) || `fdc_${crypto.randomBytes(4).toString('hex')}`;
}
