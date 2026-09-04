/**
 * Withdrawal Risk Evaluation Layer
 * Additive to withdrawalEngine — never replaces fund hold / review pipeline.
 * Uses only existing data; does not invent bank ownership verification.
 */

import { query } from '../db/pg.js';
import { SUCCESSFUL_DEPOSIT_STATUS_SQL } from './depositStatuses.mjs';

const LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const LEVEL_RANK = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

function levelFromScore(score) {
  if (score >= 80) return 'CRITICAL';
  if (score >= 55) return 'HIGH';
  if (score >= 30) return 'MEDIUM';
  return 'LOW';
}

function maxLevel(a, b) {
  const la = String(a || 'LOW').toUpperCase();
  const lb = String(b || 'LOW').toUpperCase();
  return (LEVEL_RANK[la] || 0) >= (LEVEL_RANK[lb] || 0) ? la : lb;
}

/**
 * Evaluate withdrawal risk from existing KYC/profile/fraud/deposit/withdrawal signals.
 * @returns {{ score, level, signals, hardBlocks, recommendedAction }}
 */
export async function evaluateWithdrawalRisk({
  userId,
  amount,
  bankDetails = {},
  exec = query,
} = {}) {
  const signals = [];
  const hardBlocks = [];
  let score = 0;
  let forceMinLevel = 'LOW';
  const amt = Number(amount) || 0;

  const profile = await exec(
    `SELECT UPPER(COALESCE(p.kyc_status, 'NOT_STARTED')) AS kyc_status,
            UPPER(COALESCE(p.account_status, 'ACTIVE')) AS account_status,
            UPPER(COALESCE(p.risk_tier, 'LOW_RISK')) AS risk_tier,
            u.created_at AS registered_at
     FROM users u
     LEFT JOIN user_profiles p ON p.user_id = u.user_id
     WHERE u.user_id = $1`,
    [userId],
  );
  const p = profile.rows[0] || {};
  if (!['VERIFIED', 'APPROVED'].includes(String(p.kyc_status || ''))) {
    score += 40;
    signals.push({ rule: 'KYC_INCOMPLETE', weight: 40, detail: p.kyc_status || 'NOT_STARTED' });
  }
  if (['SUSPENDED', 'CLOSED', 'SELF_EXCLUDED', 'RESTRICTED'].includes(String(p.account_status || ''))) {
    score += 50;
    signals.push({ rule: 'ACCOUNT_RESTRICTED', weight: 50, detail: p.account_status });
  }
  if (['HIGH', 'HIGH_RISK', 'CRITICAL'].includes(String(p.risk_tier || ''))) {
    score += 25;
    signals.push({ rule: 'ACCOUNT_RISK_TIER', weight: 25, detail: p.risk_tier });
  }

  const ageDays = p.registered_at
    ? Math.floor((Date.now() - new Date(p.registered_at).getTime()) / 86400000)
    : 0;
  // Accounts younger than 7 days require dual control (min HIGH).
  if (ageDays < 7) {
    const weight = ageDays < 3 ? 30 : 20;
    score += weight;
    signals.push({ rule: 'NEW_ACCOUNT', weight, detail: `${ageDays}d` });
    forceMinLevel = 'HIGH';
  }

  const deposits = await exec(
    `SELECT COALESCE(SUM(amount),0)::float AS total,
            COUNT(*)::int AS cnt,
            MAX(created_at) AS last_at
     FROM deposits
     WHERE user_id = $1 AND UPPER(COALESCE(status,'')) IN (${SUCCESSFUL_DEPOSIT_STATUS_SQL})`,
    [userId],
  );
  const dep = deposits.rows[0] || {};
  const depTotal = Number(dep.total || 0);
  if (depTotal <= 0) {
    score += 35;
    signals.push({ rule: 'NO_CAPTURED_DEPOSITS', weight: 35 });
    hardBlocks.push({
      code: 'NO_CAPTURED_DEPOSITS',
      message: 'Withdrawal blocked: no successful deposits on this account. Deposit and wager first.',
    });
  } else if (amt > depTotal * 0.9) {
    score += 20;
    signals.push({ rule: 'WITHDRAW_NEAR_FULL_DEPOSITS', weight: 20, detail: `amt=${amt} dep=${depTotal}` });
  }
  if (dep.last_at) {
    const hoursSinceDep = (Date.now() - new Date(dep.last_at).getTime()) / 3600000;
    if (hoursSinceDep < 2 && amt >= 5000) {
      score += 30;
      signals.push({ rule: 'RAPID_DEPOSIT_WITHDRAW', weight: 30, detail: `${hoursSinceDep.toFixed(1)}h` });
    }
  }

  const openBets = await exec(
    `SELECT COUNT(*)::int AS cnt
     FROM bets
     WHERE user_id = $1
       AND UPPER(COALESCE(status, '')) IN ('ACCEPTED', 'PENDING', 'OPEN')`,
    [userId],
  ).catch(() => ({ rows: [{ cnt: 0 }] }));
  const openBetCount = Number(openBets.rows[0]?.cnt || 0);
  if (openBetCount > 0) {
    score += 25;
    signals.push({ rule: 'OPEN_BETS', weight: 25, detail: openBetCount });
    hardBlocks.push({
      code: 'OPEN_BETS',
      message: `Withdrawal blocked: you have ${openBetCount} open bet(s). Wait until they settle or cancel, then try again.`,
    });
  }

  const wdHist = await exec(
    `SELECT COUNT(*)::int AS cnt_24h,
            COUNT(*) FILTER (WHERE UPPER(status) IN ('REJECTED','FAILED'))::int AS rejected,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int AS cnt_7d
     FROM withdrawals
     WHERE user_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
    [userId],
  ).catch(() => ({ rows: [{}] }));
  const wh = wdHist.rows[0] || {};
  if (Number(wh.cnt_24h || 0) >= 3) {
    score += 25;
    signals.push({ rule: 'WITHDRAWAL_VELOCITY_24H', weight: 25, detail: wh.cnt_24h });
  }
  if (Number(wh.rejected || 0) >= 2) {
    score += 20;
    signals.push({ rule: 'PRIOR_REJECTED_WITHDRAWALS', weight: 20, detail: wh.rejected });
  }

  const bets = await exec(
    `SELECT COUNT(*)::int AS cnt, COALESCE(SUM(stake),0)::float AS stake
     FROM bets WHERE user_id = $1`,
    [userId],
  );
  const b = bets.rows[0] || {};
  if (Number(b.cnt || 0) === 0 && amt >= 2000) {
    score += 25;
    signals.push({ rule: 'NO_BETTING_ACTIVITY', weight: 25 });
  }

  const fraud = await exec(
    `SELECT COUNT(*)::int AS cnt
     FROM risk_signals
     WHERE user_id = $1 AND created_at > NOW() - INTERVAL '30 days'
       AND UPPER(COALESCE(severity,'')) IN ('HIGH','CRITICAL')`,
    [userId],
  ).catch(() => ({ rows: [{ cnt: 0 }] }));
  if (Number(fraud.rows[0]?.cnt || 0) > 0) {
    score += 30;
    signals.push({ rule: 'RECENT_HIGH_RISK_SIGNALS', weight: 30, detail: fraud.rows[0].cnt });
  }

  // Architecture-ready bank name rule: only if match metadata already present
  const matchCode = String(bankDetails?.kycNameMatchCode || bankDetails?.nameMatchCode || '').toUpperCase();
  if (matchCode === 'MISMATCH' || matchCode === 'NAME_MISMATCH') {
    score += 45;
    signals.push({ rule: 'BENEFICIARY_KYC_NAME_MISMATCH', weight: 45, detail: matchCode });
  } else if (!matchCode) {
    signals.push({
      rule: 'BANK_OWNERSHIP_UNVERIFIED',
      weight: 0,
      detail: 'No penny-drop / verified bank ownership — architecture-ready only',
    });
  }

  score = Math.min(100, score);
  let level = maxLevel(levelFromScore(score), forceMinLevel);
  if (hardBlocks.length) {
    level = maxLevel(level, 'CRITICAL');
  }

  let recommendedAction = 'REVIEW';
  if (hardBlocks.length) recommendedAction = 'HARD_BLOCK';
  else if (level === 'LOW') recommendedAction = 'APPROVE_ELIGIBLE';
  else if (level === 'HIGH') recommendedAction = 'HOLD';
  else if (level === 'CRITICAL') recommendedAction = 'REJECT_OR_HOLD';

  return {
    score,
    level,
    signals,
    hardBlocks,
    recommendedAction,
    evaluatedAt: new Date().toISOString(),
  };
}

/**
 * Re-check hard blocks at request or approval time (cannot be force-bypassed).
 */
export async function assertWithdrawalHardBlocks({ userId, exec = query } = {}) {
  if (!userId) {
    throw Object.assign(new Error('USER_REQUIRED'), { code: 'USER_REQUIRED', status: 400 });
  }

  const deposits = await exec(
    `SELECT COALESCE(SUM(amount),0)::float AS total
     FROM deposits
     WHERE user_id = $1 AND UPPER(COALESCE(status,'')) IN (${SUCCESSFUL_DEPOSIT_STATUS_SQL})`,
    [userId],
  );
  if (Number(deposits.rows[0]?.total || 0) <= 0) {
    throw Object.assign(
      new Error('Withdrawal blocked: no successful deposits on this account. Deposit and wager first.'),
      { code: 'NO_CAPTURED_DEPOSITS', status: 400 },
    );
  }

  const openBets = await exec(
    `SELECT COUNT(*)::int AS cnt
     FROM bets
     WHERE user_id = $1
       AND UPPER(COALESCE(status, '')) IN ('ACCEPTED', 'PENDING', 'OPEN')`,
    [userId],
  );
  const openCount = Number(openBets.rows[0]?.cnt || 0);
  if (openCount > 0) {
    throw Object.assign(
      new Error(`Withdrawal blocked: ${openCount} open bet(s) must settle before payout.`),
      { code: 'OPEN_BETS', status: 400, openBetCount: openCount },
    );
  }

  return { ok: true };
}

/**
 * Risk gate for withdrawal approval.
 * @param {'maker'|'checker'|'final'} [opts.stage]
 *   - maker: advance HIGH/CRITICAL to PENDING_CHECKER (no force required)
 *   - checker: final dual-control approval (CRITICAL still requires force+reason)
 *   - final: single-admin path for LOW/MEDIUM only
 * Hard blocks (no deposits / open bets) are never force-approvable — use assertWithdrawalHardBlocks.
 */
export function assertApprovalAllowedByRisk(riskLevel, { force = false, stage = 'final' } = {}) {
  const level = String(riskLevel || 'LOW').toUpperCase();
  const st = String(stage || 'final').toLowerCase();
  if (st === 'maker') {
    return { allowed: true };
  }
  if (force) return { allowed: true };
  if (level === 'CRITICAL') {
    return {
      allowed: false,
      code: 'RISK_BLOCK_AUTO_APPROVE',
      message: 'CRITICAL risk withdrawals cannot be approved without explicit force + reason',
    };
  }
  if (level === 'HIGH') {
    // Dual-control checker may finalize HIGH without force; single-admin final cannot.
    if (st === 'checker') return { allowed: true };
    return {
      allowed: false,
      code: 'RISK_REQUIRES_HOLD_OR_FORCE',
      message: 'HIGH risk withdrawals require maker→checker dual control (or force approve with reason)',
    };
  }
  return { allowed: true };
}

export function requiresWithdrawalDualControl(riskLevel) {
  const level = String(riskLevel || 'LOW').toUpperCase();
  return level === 'HIGH' || level === 'CRITICAL';
}

export { LEVELS as WITHDRAWAL_RISK_LEVELS, levelFromScore };
