/**
 * Withdrawal Engine & Fund Reservation Pipeline
 * Handles withdrawal requests, KYC validation, fund holds (reserved_balance), admin review, and reversals.
 */

import { query, withTransaction } from '../db/pg.js';
import { accountEligibilityEngine } from './accountEligibilityEngine.mjs';
import { requireVerifiedIdentity } from './userIdentity.mjs';
import { assertRealMoneyKycAge } from './kycAgeGate.mjs';
import { getBenefitsForTier } from './vipBenefits.mjs';
import { assertBeneficiaryKycNameMatchForWithdrawal } from './beneficiaryKycNameMatch.mjs';
import { evaluateWithdrawalRisk, assertApprovalAllowedByRisk, requiresWithdrawalDualControl } from './withdrawalRiskEngine.mjs';

const REVIEWABLE_STATUSES = ['PENDING_REVIEW', 'HOLD', 'PENDING_CHECKER'];
const MAKER_SOURCE_STATUSES = ['PENDING_REVIEW', 'HOLD'];
const PAYOUT_REF_RE = /^[A-Z0-9][A-Z0-9\-\/]{7,39}$/;

function asRupees(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100) / 100;
}

/**
 * Manual UPI/bank payout proof collected when admin marks a withdrawal Paid.
 * Amount must match the requested withdrawal; UTR/reference is required and unique.
 */
export function normalizeManualPayoutProof({
  paidAmount,
  payoutRef,
  utr,
  referenceNumber,
  expectedAmount,
} = {}) {
  const ref = String(payoutRef || utr || referenceNumber || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  if (!ref) {
    throw Object.assign(
      new Error('Enter the paid amount and UTR / reference number from your UPI or bank app'),
      { status: 400, code: 'PAYOUT_PROOF_REQUIRED' },
    );
  }
  if (!PAYOUT_REF_RE.test(ref)) {
    throw Object.assign(
      new Error('UTR / reference number must be 8–40 letters or digits'),
      { status: 400, code: 'PAYOUT_REF_INVALID' },
    );
  }
  const amount = asRupees(paidAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw Object.assign(
      new Error('Enter the amount you actually sent'),
      { status: 400, code: 'PAYOUT_AMOUNT_REQUIRED' },
    );
  }
  const expected = asRupees(expectedAmount);
  if (Number.isFinite(expected) && amount !== expected) {
    throw Object.assign(
      new Error(`Paid amount ₹${amount.toFixed(2)} must match requested ₹${expected.toFixed(2)}`),
      { status: 400, code: 'PAYOUT_AMOUNT_MISMATCH' },
    );
  }
  return { paidAmount: amount, payoutRef: ref };
}

function mergeWithdrawalBankDetails(existing, extra) {
  let base = existing;
  if (typeof base === 'string') {
    try { base = JSON.parse(base); } catch { base = { details: existing }; }
  }
  if (!base || typeof base !== 'object') base = {};
  return { ...base, ...extra };
}

async function writeWithdrawalAudit(clientOrQuery, {
  withdrawalId,
  actorId,
  action,
  details = {},
}) {
  const run = typeof clientOrQuery === 'function' ? clientOrQuery : clientOrQuery.query.bind(clientOrQuery);
  try {
    await run(
      `INSERT INTO audit_events (actor_id, target_id, action, details, created_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW())`,
      [
        actorId || 'system',
        withdrawalId,
        action,
        JSON.stringify(details),
      ],
    );
  } catch {
    /* audit table shape may vary; non-fatal */
  }
}

export class WithdrawalEngine {
  constructor(options = {}) {
    this.minWithdrawal = options.minWithdrawal || 1000.00;
    this.maxWithdrawal = options.maxWithdrawal || 100000.00;
  }

  /** Submit Withdrawal Request & Hold Funds */
  async requestWithdrawal({ userId, amount, bankDetails = {} }, correlationId = null) {
    if (!userId) {
      throw new Error('USER_UNAUTHENTICATED: User ID is required');
    }

    await accountEligibilityEngine.verifyEligibility(userId);
    const { assertEmergencyAllows } = await import('./emergencyState.mjs');
    await assertEmergencyAllows('withdrawal');
    await assertRealMoneyKycAge(userId);
    await requireVerifiedIdentity(userId, query, 'withdraw');

    const { assertWithdrawalDestinationComplete } = await import('./beneficiaryKycNameMatch.mjs');
    const normalizedBankDetails = assertWithdrawalDestinationComplete(bankDetails);

    await assertBeneficiaryKycNameMatchForWithdrawal(userId, normalizedBankDetails, query);

    const loyaltyRes = await query(`SELECT tier FROM user_loyalty WHERE user_id = $1`, [userId]);
    const benefits = getBenefitsForTier(loyaltyRes.rows[0]?.tier);

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      throw new Error('INVALID_AMOUNT: Withdrawal amount must be a positive number');
    }

    const strAmount = String(numericAmount);
    if (strAmount.includes('.') && strAmount.split('.')[1].length > 2) {
      throw new Error('INVALID_AMOUNT: Withdrawal amount cannot exceed 2 decimal places');
    }

    if (numericAmount < benefits.minWithdraw) {
      throw new Error(`WITHDRAWAL_LIMIT_EXCEEDED: Minimum withdrawal amount is ₹${benefits.minWithdraw.toFixed(2)}`);
    }
    if (numericAmount > benefits.maxWithdraw) {
      throw new Error(`WITHDRAWAL_LIMIT_EXCEEDED: Maximum withdrawal amount is ₹${benefits.maxWithdraw.toFixed(2)}`);
    }

    // Risk layer (additive) — evaluate before hold so score is stored with the request
    const risk = await evaluateWithdrawalRisk({
      userId,
      amount: numericAmount,
      bankDetails: normalizedBankDetails,
    });

    const withdrawalId = `wdr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const initialStatus = risk.level === 'CRITICAL' || risk.level === 'HIGH'
      ? 'PENDING_REVIEW'
      : 'PENDING_REVIEW';

    // Execute Fund Hold inside PostgreSQL Transaction
    const result = await withTransaction(async (client) => {
      const walletRes = await client.query(
        `SELECT wallet_id, balance, COALESCE(reserved_balance, 0.00) as reserved_balance,
                COALESCE(bonus_balance, 0.00) as bonus_balance,
                COALESCE(locked_deposit_balance, 0.00) as locked_deposit_balance
         FROM wallets WHERE user_id = $1 FOR UPDATE`,
        [userId]
      );

      if (walletRes.rows.length === 0) {
        throw new Error(`Wallet not found for user ${userId}`);
      }

      const wallet = walletRes.rows[0];
      const currentBalance = parseFloat(wallet.balance);
      const reservedBalance = parseFloat(wallet.reserved_balance);
      const bonusBalance = parseFloat(wallet.bonus_balance);
      const lockedDeposit = parseFloat(wallet.locked_deposit_balance || 0);
      const availableBalance = parseFloat(Math.max(0, currentBalance - lockedDeposit).toFixed(2));

      if (availableBalance < numericAmount) {
        throw new Error(`INSUFFICIENT_FUNDS: Withdrawable balance ₹${availableBalance} is less than requested withdrawal ₹${numericAmount}`);
      }

      const newReserved = parseFloat((reservedBalance + numericAmount).toFixed(2));
      const newBalance = parseFloat((currentBalance - numericAmount).toFixed(2));
      if (bonusBalance > 0) {
        await client.query(
          `UPDATE wallets
           SET reserved_balance = $1,
               balance = $2,
               bonus_balance = 0.00,
               updated_at = NOW()
           WHERE wallet_id = $3`,
          [newReserved, newBalance, wallet.wallet_id]
        );
      } else {
        await client.query(
          `UPDATE wallets
           SET reserved_balance = $1,
               balance = $2,
               updated_at = NOW()
           WHERE wallet_id = $3`,
          [newReserved, newBalance, wallet.wallet_id]
        );
      }

      if (bonusBalance > 0) {
        await client.query(
          `UPDATE user_bonuses
           SET status = 'FORFEITED'
           WHERE user_id = $1 AND status IN ('ACTIVE', 'COMPLETED', 'RELEASED')`,
          [userId]
        );
        const forfeitTxId = `tx_forfeit_${withdrawalId}`;
        await client.query(
          `INSERT INTO transactions (transaction_id, user_id, type, amount, status, created_at)
           VALUES ($1, $2, 'BONUS_FORFEIT', $3, 'SUCCESS', NOW())`,
          [forfeitTxId, userId, bonusBalance]
        );
        await client.query(
          `INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description, created_at)
           VALUES ($1, $2, 'DEBIT', $3, $4, 'Bonus forfeited on withdrawal', NOW())`,
          [wallet.wallet_id, forfeitTxId, bonusBalance, currentBalance]
        );
      }

      const bankPayload = {
        ...normalizedBankDetails,
        vipPriority: benefits.priorityWithdraw,
        vipTier: benefits.tier,
        reviewHours: benefits.withdrawReviewHours,
        riskScore: risk.score,
        riskLevel: risk.level,
        riskSignals: risk.signals,
        riskRecommendedAction: risk.recommendedAction,
      };

      await client.query(
        `INSERT INTO withdrawals (withdrawal_id, user_id, amount, currency, status, bank_details, created_at,
           risk_score, risk_level, risk_signals, risk_evaluated_at)
         VALUES ($1, $2, $3, 'INR', $5, $4, NOW(), $6, $7, $8::jsonb, NOW())`,
        [
          withdrawalId,
          userId,
          numericAmount,
          JSON.stringify(bankPayload),
          initialStatus,
          risk.score,
          risk.level,
          JSON.stringify(risk.signals || []),
        ],
      ).catch(async () => {
        // Pre-migration fallback: columns may not exist yet
        await client.query(
          `INSERT INTO withdrawals (withdrawal_id, user_id, amount, currency, status, bank_details, created_at)
           VALUES ($1, $2, $3, 'INR', $5, $4, NOW())`,
          [withdrawalId, userId, numericAmount, JSON.stringify(bankPayload), initialStatus],
        );
      });

      const txId = `tx_${withdrawalId}`;
      await client.query(
        `INSERT INTO transactions (transaction_id, user_id, type, amount, status, created_at)
         VALUES ($1, $2, 'WITHDRAWAL', $3, 'PENDING', NOW())`,
        [txId, userId, numericAmount]
      );

      await client.query(
        `INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description, created_at)
         VALUES ($1, $2, 'DEBIT', $3, $4, 'Withdrawal Funds Hold', NOW())`,
        [wallet.wallet_id, txId, numericAmount, newBalance]
      );

      await client.query(
        `INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, payload, status, correlation_id, created_at)
         VALUES ($1, 'withdrawal.created', 'withdrawal', $2, $3, 'PENDING', $4, NOW())`,
        [`evt_${withdrawalId}`, withdrawalId, JSON.stringify({
          withdrawalId, userId, amount: numericAmount, riskLevel: risk.level, riskScore: risk.score,
        }), correlationId || null]
      );

      return {
        withdrawalId,
        amount: numericAmount,
        reservedBalance: newReserved,
        availableBalance: newBalance,
        forfeitedBonus: bonusBalance,
        risk,
      };
    });

    // Fail-safe ops alert — never blocks withdrawal path
    if (risk.level === 'HIGH' || risk.level === 'CRITICAL') {
      import('./opsAlertEngine.mjs')
        .then(({ raiseOpsAlert }) => raiseOpsAlert({
          title: `${risk.level} risk withdrawal`,
          message: `Withdrawal ${withdrawalId} scored ${risk.score} (${risk.level})`,
          severity: risk.level === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
          category: 'FINANCIAL',
          source: 'withdrawalEngine',
          entityType: 'withdrawal',
          entityId: withdrawalId,
          dedupeKey: `wd_risk:${withdrawalId}`,
          actionType: 'REVIEW_WITHDRAWAL',
          actionTargetType: 'withdrawal',
          actionTargetId: withdrawalId,
          actionLabel: 'Review',
          metadata: { riskScore: risk.score, riskLevel: risk.level, signals: risk.signals },
          soft: true,
        }))
        .catch(() => null);
    }

    return {
      success: true,
      status: initialStatus,
      ...result,
    };
  }

  /** Review Withdrawal Request (Admin Approval / Rejection / Hold / Maker-Checker) */
  async reviewWithdrawal({
    withdrawalId,
    adminId,
    decision,
    reason = '',
    forceApprove = false,
    paidAmount = null,
    payoutRef = null,
    utr = null,
    referenceNumber = null,
  }) {
    const dec = String(decision || '').toUpperCase();
    if (!['APPROVE', 'REJECT', 'HOLD'].includes(dec)) {
      throw new Error(`Invalid decision '${decision}'. Must be 'APPROVE', 'REJECT', or 'HOLD'`);
    }

    if (dec === 'HOLD') {
      return this.holdWithdrawal({ withdrawalId, adminId, reason });
    }

    if (dec === 'APPROVE') {
      let outcome = null;
      await withTransaction(async (client) => {
        const run = client.query.bind(client);
        const wRes = await client.query(
          `SELECT * FROM withdrawals WHERE withdrawal_id = $1 FOR UPDATE`,
          [withdrawalId],
        );
        if (wRes.rows.length === 0) {
          throw new Error(`Withdrawal record ${withdrawalId} not found`);
        }
        const withdrawal = wRes.rows[0];
        const st = String(withdrawal.status || '').toUpperCase();

        // Idempotent: already approved
        if (st === 'APPROVED') {
          outcome = {
            success: true,
            withdrawalId,
            status: 'APPROVED',
            reviewedBy: adminId || null,
            idempotent: true,
            makerAdminId: withdrawal.maker_admin_id || null,
            checkerAdminId: withdrawal.checker_admin_id || null,
            riskLevel: withdrawal.risk_level || null,
          };
          return;
        }

        if (!REVIEWABLE_STATUSES.includes(st)) {
          throw new Error(`Withdrawal ${withdrawalId} is already in status '${withdrawal.status}'`);
        }

        const riskLevel = String(
          withdrawal.risk_level
          || (typeof withdrawal.bank_details === 'object' ? withdrawal.bank_details?.riskLevel : null)
          || 'LOW',
        ).toUpperCase();
        const needsDual = requiresWithdrawalDualControl(riskLevel);

        // ── Maker step: HIGH/CRITICAL from PENDING_REVIEW|HOLD → PENDING_CHECKER ──
        if (needsDual && MAKER_SOURCE_STATUSES.includes(st)) {
          const gate = assertApprovalAllowedByRisk(riskLevel, { force: false, stage: 'maker' });
          if (!gate.allowed) {
            throw Object.assign(new Error(gate.message), { status: 403, code: gate.code });
          }
          if (!adminId) {
            throw Object.assign(new Error('Maker admin id required'), { status: 400, code: 'ADMIN_REQUIRED' });
          }

          await assertBeneficiaryKycNameMatchForWithdrawal(
            withdrawal.user_id,
            withdrawal.bank_details || {},
            run,
          );

          const cas = await client.query(
            `UPDATE withdrawals SET
               status = 'PENDING_CHECKER',
               updated_at = NOW(),
               maker_admin_id = $2,
               maker_reviewed_at = NOW(),
               risk_decision = 'MAKER_REVIEW',
               risk_reviewed_by = $2,
               risk_review_notes = $3
             WHERE withdrawal_id = $1 AND status IN ('PENDING_REVIEW', 'HOLD')
             RETURNING withdrawal_id, maker_admin_id, risk_level, risk_score, risk_signals`,
            [withdrawalId, adminId, reason || 'Maker reviewed — awaiting checker'],
          ).catch(async () => client.query(
            `UPDATE withdrawals SET status = 'PENDING_CHECKER', updated_at = NOW()
             WHERE withdrawal_id = $1 AND status IN ('PENDING_REVIEW', 'HOLD')
             RETURNING withdrawal_id`,
            [withdrawalId],
          ));
          if (cas.rowCount === 0) {
            throw new Error(`Withdrawal ${withdrawalId} raced to another status`);
          }

          await writeWithdrawalAudit(run, {
            withdrawalId,
            actorId: adminId,
            action: 'WITHDRAWAL_MAKER_REVIEW',
            details: {
              riskLevel,
              riskScore: withdrawal.risk_score != null ? Number(withdrawal.risk_score) : null,
              riskSignals: withdrawal.risk_signals || [],
              reason: reason || null,
              nextStatus: 'PENDING_CHECKER',
            },
          });

          outcome = {
            success: true,
            withdrawalId,
            status: 'PENDING_CHECKER',
            role: 'maker',
            reviewedBy: adminId,
            makerAdminId: adminId,
            riskLevel,
            riskScore: withdrawal.risk_score != null ? Number(withdrawal.risk_score) : null,
            message: 'Maker review recorded — awaiting different checker admin',
          };
          return;
        }

        // ── Checker / final approve ──
        const isCheckerStage = st === 'PENDING_CHECKER';
        if (needsDual && !isCheckerStage) {
          throw Object.assign(
            new Error('HIGH/CRITICAL withdrawals require maker review before approval'),
            { status: 403, code: 'MAKER_REVIEW_REQUIRED' },
          );
        }

        if (isCheckerStage) {
          const makerId = withdrawal.maker_admin_id || null;
          if (!makerId) {
            throw Object.assign(new Error('Withdrawal missing maker_admin_id'), {
              status: 409,
              code: 'MAKER_MISSING',
            });
          }
          if (!adminId) {
            throw Object.assign(new Error('Checker admin id required'), { status: 400, code: 'ADMIN_REQUIRED' });
          }
          if (String(adminId) === String(makerId)) {
            throw Object.assign(
              new Error('Maker cannot approve their own review — checker must be a different admin'),
              { status: 403, code: 'MAKER_CHECKER_SAME_ADMIN' },
            );
          }
        }

        const gate = assertApprovalAllowedByRisk(riskLevel, {
          force: Boolean(forceApprove),
          stage: isCheckerStage ? 'checker' : 'final',
        });
        if (!gate.allowed) {
          throw Object.assign(new Error(gate.message), { status: 403, code: gate.code });
        }
        if (forceApprove && !String(reason || '').trim()) {
          throw Object.assign(new Error('Force-approve requires a reason'), {
            status: 400,
            code: 'REASON_REQUIRED',
          });
        }
        // CRITICAL always needs force on final/checker approve
        if (riskLevel === 'CRITICAL' && !forceApprove) {
          throw Object.assign(
            new Error('CRITICAL risk withdrawals cannot be approved without explicit force + reason'),
            { status: 403, code: 'RISK_BLOCK_AUTO_APPROVE' },
          );
        }

        const amount = parseFloat(withdrawal.amount);
        const userId = withdrawal.user_id;

        await assertBeneficiaryKycNameMatchForWithdrawal(
          userId,
          withdrawal.bank_details || {},
          run,
        );

        const walletRes = await client.query(
          'SELECT wallet_id, balance, reserved_balance FROM wallets WHERE user_id = $1 FOR UPDATE',
          [userId],
        );
        if (walletRes.rows.length === 0) {
          throw new Error(`Wallet not found for user ${userId}`);
        }
        const wallet = walletRes.rows[0];
        const currentReserved = parseFloat(wallet.reserved_balance);
        const newReserved = Math.max(0, parseFloat((currentReserved - amount).toFixed(2)));

        if (currentReserved < amount) {
          throw new Error(`INSUFFICIENT_RESERVED: Reserved balance ₹${currentReserved} cannot support withdrawal of ₹${amount}`);
        }

        const proof = normalizeManualPayoutProof({
          paidAmount,
          payoutRef,
          utr,
          referenceNumber,
          expectedAmount: amount,
        });
        const dupWd = await client.query(
          `SELECT withdrawal_id FROM withdrawals
           WHERE payout_id = $1 AND withdrawal_id <> $2
           LIMIT 1`,
          [proof.payoutRef, withdrawalId],
        );
        if (dupWd.rows.length > 0) {
          throw Object.assign(
            new Error(`UTR / reference ${proof.payoutRef} is already used on ${dupWd.rows[0].withdrawal_id}`),
            { status: 409, code: 'PAYOUT_REF_DUPLICATE' },
          );
        }
        const txId = `tx_${withdrawalId}`;
        const dupTx = await client.query(
          `SELECT transaction_id FROM transactions
           WHERE utr = $1 AND transaction_id <> $2
           LIMIT 1`,
          [proof.payoutRef, txId],
        );
        if (dupTx.rows.length > 0) {
          throw Object.assign(
            new Error(`UTR / reference ${proof.payoutRef} is already used on another transaction`),
            { status: 409, code: 'PAYOUT_REF_DUPLICATE' },
          );
        }

        const nextBankDetails = mergeWithdrawalBankDetails(withdrawal.bank_details, {
          utr: proof.payoutRef,
          paidAmount: proof.paidAmount,
          paidAt: new Date().toISOString(),
          paidByAdminId: adminId || null,
        });

        const statusFilter = isCheckerStage
          ? `status = 'PENDING_CHECKER'`
          : `status IN ('PENDING_REVIEW', 'HOLD')`;

        const cas = await client.query(
          `UPDATE withdrawals SET status = 'APPROVED', updated_at = NOW(),
             payout_id = $5,
             bank_details = $6::jsonb,
             risk_decision = 'APPROVE',
             risk_reviewed_by = $2,
             risk_review_notes = $3,
             checker_admin_id = COALESCE($4, checker_admin_id),
             checker_approved_at = CASE WHEN $4::text IS NOT NULL THEN NOW() ELSE checker_approved_at END
           WHERE withdrawal_id = $1 AND ${statusFilter}
           RETURNING withdrawal_id`,
          [
            withdrawalId,
            adminId || null,
            reason || null,
            isCheckerStage ? adminId : null,
            proof.payoutRef,
            JSON.stringify(nextBankDetails),
          ],
        ).catch(async (err) => {
          if (err?.code === '23505') {
            throw Object.assign(
              new Error(`UTR / reference ${proof.payoutRef} is already used on another withdrawal`),
              { status: 409, code: 'PAYOUT_REF_DUPLICATE' },
            );
          }
          return client.query(
          `UPDATE withdrawals SET status = 'APPROVED', updated_at = NOW(),
             payout_id = $2, bank_details = $3::jsonb
           WHERE withdrawal_id = $1 AND ${statusFilter}
           RETURNING withdrawal_id`,
          [withdrawalId, proof.payoutRef, JSON.stringify(nextBankDetails)],
        );
        });
        if (cas.rowCount === 0) {
          throw new Error(`Withdrawal ${withdrawalId} is already in status '${withdrawal.status}'`);
        }

        await client.query(
          `UPDATE wallets SET reserved_balance = $1, updated_at = NOW() WHERE wallet_id = $2`,
          [newReserved, wallet.wallet_id],
        );

        // transactions schema has created_at only (no updated_at) — do not invent columns
        await client.query(
          `UPDATE transactions SET status = 'SUCCESS', utr = $2 WHERE transaction_id = $1`,
          [txId, proof.payoutRef],
        ).catch(async (err) => {
          if (err?.code === '23505') {
            throw Object.assign(
              new Error(`UTR / reference ${proof.payoutRef} is already used on another transaction`),
              { status: 409, code: 'PAYOUT_REF_DUPLICATE' },
            );
          }
          return client.query(
            `UPDATE transactions SET status = 'SUCCESS' WHERE transaction_id = $1`,
            [txId],
          );
        });

        await writeWithdrawalAudit(run, {
          withdrawalId,
          actorId: adminId,
          action: isCheckerStage ? 'WITHDRAWAL_CHECKER_APPROVED' : 'WITHDRAWAL_APPROVED',
          details: {
            riskLevel,
            riskScore: withdrawal.risk_score != null ? Number(withdrawal.risk_score) : null,
            riskSignals: withdrawal.risk_signals || [],
            forceApprove: Boolean(forceApprove),
            reason: reason || null,
            makerAdminId: withdrawal.maker_admin_id || null,
            checkerAdminId: isCheckerStage ? adminId : null,
            paidAmount: proof.paidAmount,
            payoutRef: proof.payoutRef,
          },
        });

        outcome = {
          success: true,
          withdrawalId,
          status: 'APPROVED',
          role: isCheckerStage ? 'checker' : 'approver',
          reviewedBy: adminId || null,
          makerAdminId: withdrawal.maker_admin_id || null,
          checkerAdminId: isCheckerStage ? adminId : null,
          riskLevel,
          paidAmount: proof.paidAmount,
          payoutRef: proof.payoutRef,
        };
      });
      if (outcome?.status === 'APPROVED' && !outcome.idempotent) {
        try {
          const { query: q } = await import('../db/pg.js');
          const wr = await q(
            `SELECT user_id, amount FROM withdrawals WHERE withdrawal_id = $1`,
            [withdrawalId],
          );
          const row = wr.rows[0];
          if (row) {
            const { emailUserPaymentEvent } = await import('./supportNotify.mjs');
            void emailUserPaymentEvent('withdrawal', {
              userId: row.user_id,
              amount: parseFloat(row.amount),
              status: 'APPROVED',
              withdrawalId,
            });
          }
        } catch (err) {
          console.error('[withdrawalEngine] approve email', err.message);
        }
      }
      return outcome;
    }

    // REJECT — reverse hold; restore balance once (PENDING_REVIEW | HOLD | PENDING_CHECKER)
    await withTransaction(async (client) => {
      const run = client.query.bind(client);
      const wRes = await client.query(
        `SELECT * FROM withdrawals WHERE withdrawal_id = $1 FOR UPDATE`,
        [withdrawalId],
      );
      if (wRes.rows.length === 0) {
        throw new Error(`Withdrawal record ${withdrawalId} not found`);
      }
      const withdrawal = wRes.rows[0];
      const st = String(withdrawal.status || '').toUpperCase();
      if (st === 'REJECTED') {
        return; // idempotent
      }
      if (!REVIEWABLE_STATUSES.includes(st)) {
        throw new Error(`Withdrawal ${withdrawalId} is already in status '${withdrawal.status}'`);
      }

      const amount = parseFloat(withdrawal.amount);
      const userId = withdrawal.user_id;

      const walletRes = await client.query(
        'SELECT wallet_id, balance, reserved_balance FROM wallets WHERE user_id = $1 FOR UPDATE',
        [userId],
      );
      const wallet = walletRes.rows[0];
      if (!wallet) throw new Error(`Wallet not found for user ${userId}`);

      const currentBalance = parseFloat(wallet.balance);
      const currentReserved = parseFloat(wallet.reserved_balance);
      if (currentReserved < amount) {
        throw new Error(`INSUFFICIENT_RESERVED: Cannot reject/release ₹${amount} from reserved ₹${currentReserved}`);
      }
      const newReserved = Math.max(0, parseFloat((currentReserved - amount).toFixed(2)));
      const newBalance = parseFloat((currentBalance + amount).toFixed(2));

      const cas = await client.query(
        `UPDATE withdrawals
         SET status = 'REJECTED', rejection_reason = $1, updated_at = NOW(),
             risk_decision = 'REJECT', risk_reviewed_by = $3, risk_review_notes = $1
         WHERE withdrawal_id = $2 AND status IN ('PENDING_REVIEW', 'HOLD', 'PENDING_CHECKER')
         RETURNING withdrawal_id`,
        [reason, withdrawalId, adminId || null],
      ).catch(async () => client.query(
        `UPDATE withdrawals
         SET status = 'REJECTED', rejection_reason = $1, updated_at = NOW()
         WHERE withdrawal_id = $2 AND status IN ('PENDING_REVIEW', 'HOLD', 'PENDING_CHECKER')
         RETURNING withdrawal_id`,
        [reason, withdrawalId],
      ));
      if (cas.rowCount === 0) {
        throw new Error(`Withdrawal ${withdrawalId} raced to another status`);
      }

      await client.query(
        `UPDATE wallets
         SET reserved_balance = $1, balance = $2, updated_at = NOW()
         WHERE wallet_id = $3`,
        [newReserved, newBalance, wallet.wallet_id],
      );

      const txId = `tx_rev_${withdrawalId}`;
      const txIns = await client.query(
        `INSERT INTO transactions (transaction_id, user_id, type, amount, status, created_at)
         VALUES ($1, $2, 'WITHDRAWAL_REVERSAL', $3, 'SUCCESS', NOW())
         ON CONFLICT (transaction_id) DO NOTHING
         RETURNING transaction_id`,
        [txId, userId, amount],
      );
      if (txIns.rowCount === 0) {
        throw new Error('IDEMPOTENCY_CONFLICT: Withdrawal reversal already recorded');
      }

      await client.query(
        `INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description, created_at)
         VALUES ($1, $2, 'CREDIT', $3, $4, $5, NOW())`,
        [wallet.wallet_id, txId, amount, newBalance, `Withdrawal Reversal: ${reason}`],
      );

      await writeWithdrawalAudit(run, {
        withdrawalId,
        actorId: adminId,
        action: 'WITHDRAWAL_REJECTED',
        details: {
          reason,
          priorStatus: st,
          makerAdminId: withdrawal.maker_admin_id || null,
          riskLevel: withdrawal.risk_level || null,
        },
      });
    });

    try {
      const { query } = await import('../db/pg.js');
      const wr = await query(
        `SELECT user_id, amount FROM withdrawals WHERE withdrawal_id = $1`,
        [withdrawalId],
      );
      const row = wr.rows[0];
      if (row) {
        const { emailUserPaymentEvent } = await import('./supportNotify.mjs');
        void emailUserPaymentEvent('withdrawal', {
          userId: row.user_id,
          amount: parseFloat(row.amount),
          status: 'REJECTED',
          withdrawalId,
          reason,
        });
      }
    } catch (err) {
      console.error('[withdrawalEngine] reject email', err.message);
    }

    return { success: true, withdrawalId, status: 'REJECTED', reviewedBy: adminId || null };
  }

  /**
   * Hold withdrawal for enhanced review. Funds remain reserved. No balance mutation.
   */
  async holdWithdrawal({ withdrawalId, adminId, reason = '' }) {
    const res = await query(
      `UPDATE withdrawals SET
         status = 'HOLD',
         updated_at = NOW(),
         risk_decision = 'HOLD',
         risk_reviewed_by = $2,
         risk_review_notes = $3
       WHERE withdrawal_id = $1 AND status IN ('PENDING_REVIEW', 'HOLD', 'PENDING_CHECKER')
       RETURNING withdrawal_id, status, risk_level, risk_score`,
      [withdrawalId, adminId || null, reason || 'Held for risk review'],
    ).catch(async () => {
      // Column fallback: store hold in status only
      return query(
        `UPDATE withdrawals SET status = 'HOLD', updated_at = NOW()
         WHERE withdrawal_id = $1 AND status IN ('PENDING_REVIEW', 'HOLD', 'PENDING_CHECKER')
         RETURNING withdrawal_id, status`,
        [withdrawalId],
      );
    });
    if (!res.rows[0]) {
      throw Object.assign(new Error('Withdrawal not found or not holdable'), {
        status: 404,
        code: 'NOT_HOLDABLE',
      });
    }
    return {
      success: true,
      withdrawalId,
      status: 'HOLD',
      reviewedBy: adminId || null,
      reason: reason || null,
      riskLevel: res.rows[0].risk_level || null,
      riskScore: res.rows[0].risk_score != null ? Number(res.rows[0].risk_score) : null,
    };
  }

  /** List cancellable withdrawals for the authenticated user (PENDING_REVIEW only). */
  async listCancellableWithdrawals(userId, { limit = 50 } = {}) {
    if (!userId) throw new Error('USER_UNAUTHENTICATED: User ID is required');
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const res = await query(
      `SELECT withdrawal_id, amount, status, bank_details, created_at, updated_at
       FROM withdrawals
       WHERE user_id = $1 AND UPPER(status) = 'PENDING_REVIEW'
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, safeLimit],
    );
    return {
      success: true,
      count: res.rows.length,
      withdrawals: res.rows.map((row) => {
        let method = 'UPI';
        let details = '';
        try {
          const bd = typeof row.bank_details === 'string'
            ? JSON.parse(row.bank_details)
            : (row.bank_details || {});
          method = bd.method || method;
          details = bd.details || '';
        } catch {
          // ignore malformed bank_details
        }
        return {
          id: row.withdrawal_id,
          amount: parseFloat(row.amount),
          status: row.status,
          method,
          details,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      }),
    };
  }

  /**
   * User cancels their own PENDING_REVIEW withdrawal.
   * Reverses the fund hold (same money path as admin REJECT) — no balance invention.
   */
  async cancelWithdrawal({ userId, withdrawalId }) {
    if (!userId) throw new Error('USER_UNAUTHENTICATED: User ID is required');
    if (!withdrawalId) throw new Error('INVALID_REQUEST: withdrawalId is required');

    const result = await withTransaction(async (client) => {
      const wRes = await client.query(
        `SELECT * FROM withdrawals WHERE withdrawal_id = $1 FOR UPDATE`,
        [withdrawalId],
      );
      if (wRes.rows.length === 0) {
        const err = new Error(`Withdrawal record ${withdrawalId} not found`);
        err.status = 404;
        err.code = 'WITHDRAWAL_NOT_FOUND';
        throw err;
      }
      const withdrawal = wRes.rows[0];
      if (withdrawal.user_id !== userId) {
        const err = new Error('FORBIDDEN: Withdrawal does not belong to this user');
        err.status = 403;
        err.code = 'WITHDRAWAL_FORBIDDEN';
        throw err;
      }
      if (withdrawal.status !== 'PENDING_REVIEW') {
        const err = new Error(
          `WITHDRAWAL_NOT_CANCELLABLE: Status is '${withdrawal.status}'. Only pending review requests can be cancelled.`,
        );
        err.status = 409;
        err.code = 'WITHDRAWAL_NOT_CANCELLABLE';
        throw err;
      }

      const amount = parseFloat(withdrawal.amount);
      const walletRes = await client.query(
        'SELECT wallet_id, balance, reserved_balance FROM wallets WHERE user_id = $1 FOR UPDATE',
        [userId],
      );
      const wallet = walletRes.rows[0];
      if (!wallet) throw new Error(`Wallet not found for user ${userId}`);

      const currentBalance = parseFloat(wallet.balance);
      const currentReserved = parseFloat(wallet.reserved_balance);
      if (currentReserved < amount) {
        throw new Error(`INSUFFICIENT_RESERVED: Cannot cancel/release ₹${amount} from reserved ₹${currentReserved}`);
      }
      const newReserved = Math.max(0, parseFloat((currentReserved - amount).toFixed(2)));
      const newBalance = parseFloat((currentBalance + amount).toFixed(2));

      const cas = await client.query(
        `UPDATE withdrawals
         SET status = 'CANCELLED', rejection_reason = $1, updated_at = NOW()
         WHERE withdrawal_id = $2 AND status = 'PENDING_REVIEW' AND user_id = $3
         RETURNING withdrawal_id`,
        ['USER_CANCELLED', withdrawalId, userId],
      );
      if (cas.rowCount === 0) {
        const err = new Error(`Withdrawal ${withdrawalId} raced to another status`);
        err.status = 409;
        err.code = 'WITHDRAWAL_RACE';
        throw err;
      }

      await client.query(
        `UPDATE wallets
         SET reserved_balance = $1, balance = $2, updated_at = NOW()
         WHERE wallet_id = $3`,
        [newReserved, newBalance, wallet.wallet_id],
      );

      await client.query(
        `UPDATE transactions
         SET status = 'CANCELLED'
         WHERE transaction_id = $1 AND user_id = $2`,
        [`tx_${withdrawalId}`, userId],
      );

      const txId = `tx_rev_${withdrawalId}`;
      const txIns = await client.query(
        `INSERT INTO transactions (transaction_id, user_id, type, amount, status, created_at)
         VALUES ($1, $2, 'WITHDRAWAL_REVERSAL', $3, 'SUCCESS', NOW())
         ON CONFLICT (transaction_id) DO NOTHING
         RETURNING transaction_id`,
        [txId, userId, amount],
      );
      if (txIns.rowCount === 0) {
        throw new Error('IDEMPOTENCY_CONFLICT: Withdrawal reversal already recorded');
      }

      await client.query(
        `INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description, created_at)
         VALUES ($1, $2, 'CREDIT', $3, $4, $5, NOW())`,
        [wallet.wallet_id, txId, amount, newBalance, 'Withdrawal cancelled by user'],
      );

      await client.query(
        `INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, payload, status, created_at)
         VALUES ($1, 'withdrawal.cancelled', 'withdrawal', $2, $3, 'PENDING', NOW())
         ON CONFLICT (id) DO NOTHING`,
        [
          `evt_cancel_${withdrawalId}`,
          withdrawalId,
          JSON.stringify({ withdrawalId, userId, amount }),
        ],
      );

      return {
        withdrawalId,
        amount,
        balance: newBalance,
        reservedBalance: newReserved,
      };
    });

    return { success: true, status: 'CANCELLED', ...result };
  }
}

export const withdrawalEngine = new WithdrawalEngine();
