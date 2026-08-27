/**
 * E2E money flow (DB): synthetic deposit credit → place bet → settle WIN →
 * requestWithdrawal → review APPROVE or HOLD by risk → wallet/ledger invariants.
 * Skips gracefully when DATABASE_URL / PG_CONNECTION_STRING is unset.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const hasDb = Boolean(process.env.DATABASE_URL || process.env.PG_CONNECTION_STRING);

vi.mock('../../lib/oddsQuoteService.mjs', () => ({
  resolveServerOdds: vi.fn(async ({ clientOdds, marketId, selectionId }) => ({
    odds: clientOdds != null ? Number(clientOdds) : 1.06,
    changed: false,
    previousOdds: clientOdds != null ? Number(clientOdds) : null,
    marketId,
    selectionId,
    stateVersion: 1,
    oddsVersion: 1,
    generatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 5000).toISOString(),
  })),
  unwrapServerOddsQuote: (quote) => (quote?.odds != null ? Number(quote.odds) : Number(quote)),
}));

describe.runIf(hasDb)('Full money flow: deposit → bet → WIN → withdraw', () => {
  /** @type {typeof import('../../db/pg.js').query} */
  let query;
  /** @type {import('../../lib/betPlacementEngine.mjs').betPlacementEngine} */
  let betPlacementEngine;
  /** @type {import('../../lib/betSettlementEngine.mjs').betSettlementEngine} */
  let betSettlementEngine;
  /** @type {import('../../lib/marketSuspensionEngine.mjs').marketSuspensionEngine} */
  let marketSuspensionEngine;
  /** @type {import('../../lib/withdrawalEngine.mjs').withdrawalEngine} */
  let withdrawalEngine;
  /** @type {import('../../lib/financialReconciliationEngine.mjs').financialReconciliationEngine} */
  let financialReconciliationEngine;
  /** @type {typeof import('../../lib/withdrawalRiskEngine.mjs').levelFromScore} */
  let levelFromScore;

  const userId = 'usr_e2e_money_flow';
  const walletId = 'wal_e2e_money_flow';
  const matchId = 'm_e2e_money_flow';
  const marketId = 'match_winner_e2e_flow';
  const selectionId = 'sel_home_e2e_flow';

  beforeEach(async () => {
    ({ query } = await import('../../db/pg.js'));
    ({ betPlacementEngine } = await import('../../lib/betPlacementEngine.mjs'));
    ({ betSettlementEngine } = await import('../../lib/betSettlementEngine.mjs'));
    ({ marketSuspensionEngine } = await import('../../lib/marketSuspensionEngine.mjs'));
    ({ withdrawalEngine } = await import('../../lib/withdrawalEngine.mjs'));
    ({ financialReconciliationEngine } = await import('../../lib/financialReconciliationEngine.mjs'));
    ({ levelFromScore } = await import('../../lib/withdrawalRiskEngine.mjs'));

    await marketSuspensionEngine.clearSuspensionCause(marketId, 'STALE_ODDS');
    await marketSuspensionEngine.clearSuspensionCause(marketId, 'MANUAL_ADMIN');
    await query(`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS winnings_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00`);
    await query(`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS reserved_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00`);
    await query(`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS locked_deposit_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00`);
    await query(`ALTER TABLE bets ADD COLUMN IF NOT EXISTS winnings_credited NUMERIC(14,2)`);
    // Phase 1 withdrawal risk columns (migration 067) — ensure present for engine insert path
    await query(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS risk_score NUMERIC(6,2) DEFAULT NULL`);
    await query(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS risk_level VARCHAR(16) DEFAULT NULL`);
    await query(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS risk_signals JSONB NOT NULL DEFAULT '[]'::jsonb`);
    await query(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS risk_evaluated_at TIMESTAMPTZ DEFAULT NULL`);
    await query(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS risk_decision VARCHAR(16) DEFAULT NULL`);
    await query(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS risk_reviewed_by VARCHAR(64) DEFAULT NULL`);
    await query(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS risk_review_notes TEXT DEFAULT NULL`);
    await query(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS maker_admin_id VARCHAR(64)`);
    await query(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS maker_reviewed_at TIMESTAMPTZ`);
    await query(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS checker_admin_id VARCHAR(64)`);
    await query(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS checker_approved_at TIMESTAMPTZ`);
    await query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NULL`);

    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT DO NOTHING`, [
      userId,
      `${userId}@test.com`,
    ]);
    await query(`
      INSERT INTO user_profiles (user_id, account_status, kyc_status, date_of_birth)
      VALUES ($1, 'ACTIVE', 'VERIFIED', '1995-05-05')
      ON CONFLICT (user_id) DO UPDATE SET
        kyc_status = 'VERIFIED',
        account_status = 'ACTIVE',
        date_of_birth = '1995-05-05';
    `, [userId]);
    // Age gate may be enforced outside NODE_ENV=test depending on env; DOB is required.
    await query(`DELETE FROM kyc_cases WHERE user_id = $1`, [userId]);
    await query(`
      INSERT INTO kyc_cases (case_id, user_id, status, pan_number, aadhaar_number, updated_at)
      VALUES ($1, $2, 'VERIFIED', 'E2EWL1234A', '900011113333', NOW())
      ON CONFLICT (case_id) DO UPDATE SET status = 'VERIFIED';
    `, [`kyc_${userId}`, userId]);

    await query(`DELETE FROM ledger_entries WHERE wallet_id = $1`, [walletId]);
    await query(`DELETE FROM transactions WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM bets WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM withdrawals WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM deposits WHERE user_id = $1`, [userId]).catch(() => null);
    await query(`DELETE FROM wallets WHERE user_id = $1`, [userId]);
    await query(
      `INSERT INTO wallets (wallet_id, user_id, balance, winnings_balance, locked_deposit_balance, reserved_balance, currency)
       VALUES ($1, $2, 0, 0, 0, 0, 'INR')`,
      [walletId, userId],
    );
    await query(
      `INSERT INTO matches (match_id, status) VALUES ($1, 'LIVE')
       ON CONFLICT (match_id) DO UPDATE SET status = 'LIVE'`,
      [matchId],
    );
    await query(
      `INSERT INTO markets (market_id, match_id, name, status) VALUES ($1, $2, 'Winner', 'OPEN')
       ON CONFLICT (market_id) DO UPDATE SET status = 'OPEN'`,
      [marketId, matchId],
    );
    await query(
      `INSERT INTO selections (selection_id, market_id, name, odds, status)
       VALUES ($1, $2, 'Home', 1.06, 'OPEN')
       ON CONFLICT (selection_id) DO UPDATE SET odds = 1.06, status = 'OPEN'`,
      [selectionId, marketId],
    );
  });

  async function creditDeposit(amount) {
    const txId = `tx_dep_${userId}_${Date.now()}`;
    const depId = `dep_${userId}_${Date.now()}`;
    await query(
      `UPDATE wallets SET balance = balance + $1, locked_deposit_balance = COALESCE(locked_deposit_balance,0) + $1 WHERE wallet_id = $2`,
      [amount, walletId],
    );
    const bal = await query(`SELECT balance FROM wallets WHERE wallet_id = $1`, [walletId]);
    const newBal = Number(bal.rows[0].balance);
    await query(
      `INSERT INTO transactions (transaction_id, user_id, type, amount, status, created_at)
       VALUES ($1, $2, 'DEPOSIT', $3, 'SUCCESS', NOW())`,
      [txId, userId, amount],
    );
    await query(
      `INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description, created_at)
       VALUES ($1, $2, 'CREDIT', $3, $4, 'E2E test deposit', NOW())`,
      [walletId, txId, amount, newBal],
    );
    await query(
      `INSERT INTO deposits (id, deposit_id, user_id, order_id, amount, currency, status, created_at)
       VALUES ($1, $1, $2, $3, $4, 'INR', 'CAPTURED', NOW())
       ON CONFLICT DO NOTHING`,
      [depId, userId, `ord_${depId}`, amount],
    ).catch(() => null);
    return newBal;
  }

  async function wallet() {
    const w = await query(
      `SELECT balance, winnings_balance, reserved_balance, locked_deposit_balance FROM wallets WHERE wallet_id = $1`,
      [walletId],
    );
    return w.rows[0];
  }

  it('deposit → WIN settle → withdraw → APPROVE or HOLD by risk', async () => {
    await creditDeposit(5000);
    let w = await wallet();
    expect(parseFloat(w.balance)).toBe(5000);

    const place = await betPlacementEngine.placeBet({
      userId,
      matchId,
      marketId,
      selectionId,
      stake: 1000,
      clientOdds: 1.06,
      fundSource: 'cash',
      idempotencyKey: `e2e_flow_${Date.now()}`,
    });
    expect(place.success).toBe(true);
    const betId = place.betId;

    w = await wallet();
    expect(parseFloat(w.balance)).toBe(4000);

    await query(
      `UPDATE bets SET odds = 1.06, accepted_odds = 1.06, potential_payout = 1060 WHERE bet_id = $1`,
      [betId],
    );

    const settled = await betSettlementEngine.settleSingleBet({
      betId,
      matchState: { matchId, status: 'COMPLETED', __forcedOutcome: 'WON' },
    });
    expect(settled.outcome).toBe('WON');
    expect(settled.payout).toBe(1060);

    w = await wallet();
    expect(parseFloat(w.balance)).toBe(5060);
    expect(parseFloat(w.winnings_balance)).toBe(60);

    const stakeDebits = await query(
      `SELECT COUNT(*)::int AS c FROM ledger_entries WHERE wallet_id = $1 AND type = 'DEBIT' AND description LIKE $2`,
      [walletId, `%${betId}%`],
    );
    expect(stakeDebits.rows[0].c).toBeGreaterThanOrEqual(1);

    const payoutCredits = await query(
      `SELECT COUNT(*)::int AS c FROM ledger_entries WHERE wallet_id = $1 AND type = 'CREDIT' AND description LIKE $2`,
      [walletId, `%${betId}%`],
    );
    expect(payoutCredits.rows[0].c).toBeGreaterThanOrEqual(1);

    // Locked deposits limit withdrawable amount; stake unlocked ~₹1000 → withdrawable ≈ ₹1060.
    // Use min withdrawal ₹1000 within that band.
    const withdrawAmt = 1000;
    const wd = await withdrawalEngine.requestWithdrawal({
      userId,
      amount: withdrawAmt,
      bankDetails: { account: '9999', method: 'UPI' },
    });
    expect(wd.success).toBe(true);
    expect(['PENDING_REVIEW', 'HOLD'].includes(wd.status)).toBe(true);

    w = await wallet();
    expect(parseFloat(w.reserved_balance)).toBe(withdrawAmt);
    expect(parseFloat(w.balance)).toBe(4060);

    const riskLevel = String(wd.risk?.level || wd.riskLevel || 'LOW').toUpperCase();
    expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(riskLevel);
    if (wd.risk?.score != null) {
      expect(levelFromScore(wd.risk.score)).toBe(wd.risk.level);
    }

    if (riskLevel === 'HIGH' || riskLevel === 'CRITICAL') {
      const held = await withdrawalEngine.reviewWithdrawal({
        withdrawalId: wd.withdrawalId,
        adminId: 'admin_e2e_maker',
        decision: 'HOLD',
        reason: 'E2E high-risk hold',
      });
      expect(held.status).toBe('HOLD');
      w = await wallet();
      expect(parseFloat(w.reserved_balance)).toBe(withdrawAmt);
      expect(parseFloat(w.balance)).toBe(4060);

      // Maker → PENDING_CHECKER (no fund release)
      const maker = await withdrawalEngine.reviewWithdrawal({
        withdrawalId: wd.withdrawalId,
        adminId: 'admin_e2e_maker',
        decision: 'APPROVE',
        reason: 'E2E maker review',
      });
      expect(maker.status).toBe('PENDING_CHECKER');
      w = await wallet();
      expect(parseFloat(w.reserved_balance)).toBe(withdrawAmt);

      // Same admin cannot checker-approve
      await expect(
        withdrawalEngine.reviewWithdrawal({
          withdrawalId: wd.withdrawalId,
          adminId: 'admin_e2e_maker',
          decision: 'APPROVE',
        }),
      ).rejects.toMatchObject({ code: 'MAKER_CHECKER_SAME_ADMIN' });

      const checkerOpts = {
        withdrawalId: wd.withdrawalId,
        adminId: 'admin_e2e_checker',
        decision: 'APPROVE',
        reason: 'E2E checker approve',
      };
      if (riskLevel === 'CRITICAL') {
        checkerOpts.forceApprove = true;
        checkerOpts.reason = 'E2E force checker for CRITICAL';
      }
      const approved = await withdrawalEngine.reviewWithdrawal(checkerOpts);
      expect(approved.status).toBe('APPROVED');
      w = await wallet();
      expect(parseFloat(w.reserved_balance)).toBe(0);
    } else {
      const approved = await withdrawalEngine.reviewWithdrawal({
        withdrawalId: wd.withdrawalId,
        adminId: 'admin_e2e',
        decision: 'APPROVE',
        reason: 'E2E low-risk approve',
      });
      expect(approved.success).toBe(true);
      w = await wallet();
      expect(parseFloat(w.reserved_balance)).toBe(0);
    }

    const audit = await financialReconciliationEngine.auditUser(userId);
    expect(audit.ledger?.reconciled !== false || audit.reconciled).toBeTruthy();
  });
});

describe.runIf(!hasDb)('Full money flow (skipped — no DATABASE_URL)', () => {
  it('skips when database is unavailable', () => {
    expect(hasDb).toBe(false);
  });
});
