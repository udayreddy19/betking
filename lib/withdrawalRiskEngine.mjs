/**
 * Withdrawal Risk Evaluation Layer
 * Additive to withdrawalEngine — never replaces fund hold / review pipeline.
 * Uses only existing data; does not invent bank ownership verification.
 */

import { query } from '../db/pg.js';

const LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

function levelFromScore(score) {
  if (score >= 80) return 'CRITICAL';
  if (score >= 55) return 'HIGH';
  if (score >= 30) return 'MEDIUM';
  return 'LOW';
}

/**
 * Evaluate withdrawal risk from existing KYC/profile/fraud/deposit/withdrawal signals.
 * @returns {{ score, level, signals, recommendedAction }}
 */
export async function evaluateWithdrawalRisk({
  userId,
  amount,
  bankDetails = {},
  exec = query,
} = {}) {
  const signals = [];
  let score = 0;
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
  if (ageDays < 3) {
    score += 20;
    signals.push({ rule: 'NEW_ACCOUNT', weight: 20, detail: `${ageDays}d` });
  }

  const deposits = await exec(
    `SELECT COALESCE(SUM(amount),0)::float AS total,
            COUNT(*)::int AS cnt,
            MAX(created_at) AS last_at
     FROM deposits
     WHERE user_id = $1 AND UPPER(COALESCE(status,'')) IN ('CAPTURED','SUCCESS','COMPLETED')`,
    [userId],
  );
  const dep = deposits.rows[0] || {};
  const depTotal = Number(dep.total || 0);
  if (depTotal <= 0) {
    score += 35;
    signals.push({ rule: 'NO_CAPTURED_DEPOSITS', weight: 35 });
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
  const level = levelFromScore(score);
  let recommendedAction = 'REVIEW';
  if (level === 'LOW') recommendedAction = 'APPROVE_ELIGIBLE';
  if (level === 'HIGH') recommendedAction = 'HOLD';
  if (level === 'CRITICAL') recommendedAction = 'REJECT_OR_HOLD';

  return {
    score,
    level,
    signals,
    recommendedAction,
    evaluatedAt: new Date().toISOString(),
  };
}

/**
 * Risk gate for withdrawal approval.
 * @param {'maker'|'checker'|'final'} [opts.stage]
 *   - maker: advance HIGH/CRITICAL to PENDING_CHECKER (no force required)
 *   - checker: final dual-control approval (CRITICAL still requires force+reason)
 *   - final: single-admin path for LOW/MEDIUM only
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
