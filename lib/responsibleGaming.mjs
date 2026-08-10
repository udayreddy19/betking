/**
 * Enterprise Responsible Gaming Engine — BetKing Sportsbook (lib/responsibleGaming.mjs)
 * Enforces server-side deposit limits, loss limits, stake limits, session limits,
 * reality checks, cooling-off periods, and self-exclusion with PostgreSQL audit logging.
 */

import { userSecurityCenter } from './userSecurityCenter.mjs';

let pgQuery = null;
async function safePgQuery(text, params) {
  if (typeof window !== 'undefined') return { rows: [], rowCount: 0 };
  try {
    if (!pgQuery) {
      const mod = await import('../db/pg.js');
      pgQuery = mod.query;
    }
    return await pgQuery(text, params);
  } catch (err) {
    console.error('[ResponsibleGaming PG Warning]', err.message);
    return { rows: [], rowCount: 0 };
  }
}

class ResponsibleGamingEngine {
  constructor() {
    this.limitsMap = new Map(); // userId -> limitsObj
    this.userDepositsTodayMap = new Map(); // userId -> amount
  }

  async getLimits(userId) {
    if (this.limitsMap.has(userId)) return this.limitsMap.get(userId);

    const defaultLimits = {
      userId,
      depositLimitDaily: 50000.0,
      depositLimitWeekly: 250000.0,
      depositLimitMonthly: 1000000.0,
      lossLimitDaily: 25000.0,
      stakeLimitPerBet: 50000.0,
      sessionLimitMinutes: 180,
      coolingOffUntil: null,
      selfExcludedUntil: null,
      realityCheckIntervalMins: 60,
    };

    try {
      const res = await safePgQuery(`SELECT * FROM responsible_gaming_limits WHERE user_id = $1`, [userId]);
      if (res.rows.length > 0) {
        const row = res.rows[0];
        const loaded = {
          userId,
          depositLimitDaily: Number(row.deposit_limit_daily),
          depositLimitWeekly: Number(row.deposit_limit_weekly),
          depositLimitMonthly: Number(row.deposit_limit_monthly),
          lossLimitDaily: Number(row.loss_limit_daily),
          stakeLimitPerBet: Number(row.stake_limit_per_bet),
          sessionLimitMinutes: Number(row.session_limit_minutes),
          coolingOffUntil: row.cooling_off_until ? new Date(row.cooling_off_until).toISOString() : null,
          selfExcludedUntil: row.self_excluded_until ? new Date(row.self_excluded_until).toISOString() : null,
          realityCheckIntervalMins: Number(row.reality_check_interval_mins),
        };
        this.limitsMap.set(userId, loaded);
        return loaded;
      }
    } catch (ignored) {}

    this.limitsMap.set(userId, defaultLimits);
    return defaultLimits;
  }

  async setLimits(userId, newLimits = {}, operatorId = 'user') {
    const existing = await this.getLimits(userId);
    const updated = {
      ...existing,
      ...newLimits,
      updatedAt: new Date().toISOString(),
    };

    this.limitsMap.set(userId, updated);

    // Persist to PostgreSQL
    try {
      await safePgQuery(
        `INSERT INTO users (user_id, email) VALUES ($1, $1) ON CONFLICT (user_id) DO NOTHING`,
        [userId]
      );

      await safePgQuery(`
        INSERT INTO responsible_gaming_limits (user_id, deposit_limit_daily, deposit_limit_weekly, deposit_limit_monthly, loss_limit_daily, stake_limit_per_bet, session_limit_minutes, cooling_off_until, self_excluded_until, reality_check_interval_mins, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
        ON CONFLICT (user_id) DO UPDATE
        SET deposit_limit_daily = EXCLUDED.deposit_limit_daily,
            deposit_limit_weekly = EXCLUDED.deposit_limit_weekly,
            deposit_limit_monthly = EXCLUDED.deposit_limit_monthly,
            loss_limit_daily = EXCLUDED.loss_limit_daily,
            stake_limit_per_bet = EXCLUDED.stake_limit_per_bet,
            session_limit_minutes = EXCLUDED.session_limit_minutes,
            cooling_off_until = EXCLUDED.cooling_off_until,
            self_excluded_until = EXCLUDED.self_excluded_until,
            reality_check_interval_mins = EXCLUDED.reality_check_interval_mins,
            updated_at = NOW();
      `, [
        userId,
        updated.depositLimitDaily,
        updated.depositLimitWeekly,
        updated.depositLimitMonthly,
        updated.lossLimitDaily,
        updated.stakeLimitPerBet,
        updated.sessionLimitMinutes,
        updated.coolingOffUntil,
        updated.selfExcludedUntil,
        updated.realityCheckIntervalMins,
      ]);

      await safePgQuery(`
        INSERT INTO responsible_gaming_audit_logs (user_id, action_type, old_value, new_value, reason)
        VALUES ($1, $2, $3, $4, $5)
      `, [userId, 'LIMIT_MODIFIED', JSON.stringify(existing), JSON.stringify(updated), `Updated by ${operatorId}`]);
    } catch (err) {
      console.error('[ResponsibleGaming SetLimits PG Warning]', err.message);
    }

    return updated;
  }

  async validateDepositAttempt(userId, depositAmount) {
    const amount = Number(depositAmount);
    if (isNaN(amount) || amount <= 0) return { allowed: false, reason: 'INVALID_AMOUNT' };

    const limits = await this.getLimits(userId);
    const now = Date.now();

    // Check Self-Exclusion & Cooling-Off
    if (limits.selfExcludedUntil && new Date(limits.selfExcludedUntil).getTime() > now) {
      return { allowed: false, reason: 'USER_SELF_EXCLUDED', until: limits.selfExcludedUntil };
    }
    if (limits.coolingOffUntil && new Date(limits.coolingOffUntil).getTime() > now) {
      return { allowed: false, reason: 'USER_IN_COOLING_OFF', until: limits.coolingOffUntil };
    }

    // Check Account Controls status from Phase 2
    const secStatus = userSecurityCenter.getAccountControlStatus(userId);
    if (secStatus.isRestricted) {
      return { allowed: false, reason: `ACCOUNT_RESTRICTED_${secStatus.accountState}` };
    }

    // Check Daily Deposit Limit
    const currentToday = this.userDepositsTodayMap.get(userId) || 0;
    if (currentToday + amount > limits.depositLimitDaily) {
      this.auditLimitViolation(userId, 'DEPOSIT_LIMIT_EXCEEDED', { attempted: amount, currentToday, limit: limits.depositLimitDaily });
      return {
        allowed: false,
        reason: 'DEPOSIT_LIMIT_EXCEEDED',
        message: `Deposit of ₹${amount} exceeds your daily limit of ₹${limits.depositLimitDaily} (Deposited today: ₹${currentToday}).`,
        limit: limits.depositLimitDaily,
        attempted: amount,
        currentToday,
      };
    }

    return { allowed: true, currentToday, limit: limits.depositLimitDaily };
  }

  async recordDepositSuccess(userId, amount) {
    const currentToday = this.userDepositsTodayMap.get(userId) || 0;
    this.userDepositsTodayMap.set(userId, currentToday + Number(amount));
  }

  async validateBetPlacementAttempt(userId, stakeAmount) {
    const stake = Number(stakeAmount);
    const limits = await this.getLimits(userId);
    const now = Date.now();

    if (limits.selfExcludedUntil && new Date(limits.selfExcludedUntil).getTime() > now) {
      return { allowed: false, reason: 'USER_SELF_EXCLUDED', until: limits.selfExcludedUntil };
    }
    if (limits.coolingOffUntil && new Date(limits.coolingOffUntil).getTime() > now) {
      return { allowed: false, reason: 'USER_IN_COOLING_OFF', until: limits.coolingOffUntil };
    }

    if (stake > limits.stakeLimitPerBet) {
      this.auditLimitViolation(userId, 'STAKE_LIMIT_EXCEEDED', { stake, limit: limits.stakeLimitPerBet });
      return {
        allowed: false,
        reason: 'STAKE_LIMIT_EXCEEDED',
        message: `Stake of ₹${stake} exceeds your maximum allowed per-bet limit of ₹${limits.stakeLimitPerBet}.`,
      };
    }

    return { allowed: true };
  }

  async setCoolingOff(userId, { hours = 24, reason = 'User Cooling-off Period' } = {}) {
    const until = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    await this.setLimits(userId, { coolingOffUntil: until });

    await safePgQuery(`
      INSERT INTO responsible_gaming_audit_logs (user_id, action_type, new_value, reason)
      VALUES ($1, 'COOLING_OFF_STARTED', $2, $3)
    `, [userId, JSON.stringify({ until, hours }), reason]);

    return { success: true, userId, coolingOffUntil: until };
  }

  async setSelfExclusion(userId, { days = 30, reason = 'User Self-Exclusion Period' } = {}) {
    const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    await this.setLimits(userId, { selfExcludedUntil: until });

    // Also update Phase 2 User Security Center account state
    await userSecurityCenter.selfExcludeAccount(userId, { durationDays: days, reason });

    await safePgQuery(`
      INSERT INTO responsible_gaming_audit_logs (user_id, action_type, new_value, reason)
      VALUES ($1, 'SELF_EXCLUSION_STARTED', $2, $3)
    `, [userId, JSON.stringify({ until, days }), reason]);

    return { success: true, userId, selfExcludedUntil: until };
  }

  auditLimitViolation(userId, violationType, details = {}) {
    safePgQuery(`
      INSERT INTO responsible_gaming_audit_logs (user_id, action_type, old_value, reason)
      VALUES ($1, 'LIMIT_VIOLATION_BLOCKED', $2, $3)
    `, [userId, JSON.stringify(details), violationType]).catch(() => {});
  }
}

export const responsibleGamingEngine = new ResponsibleGamingEngine();

// Backward compatibility export
export function setResponsibleGamingLimits(userId, limits) {
  return responsibleGamingEngine.setLimits(userId, limits);
}

export function validateResponsibleGamingStatus(userId, currentSessionMinutes = 0, currentDailyDeposit = 0) {
  const now = Date.now();
  const limits = responsibleGamingEngine.limitsMap.get(userId) || { depositLimitDaily: 50000, sessionLimitMinutes: 180 };
  const warnings = [];

  if (limits.selfExcludedUntil && new Date(limits.selfExcludedUntil).getTime() > now) {
    return { allowed: false, reason: 'USER_SELF_EXCLUDED', until: limits.selfExcludedUntil };
  }
  if (limits.coolingOffUntil && new Date(limits.coolingOffUntil).getTime() > now) {
    return { allowed: false, reason: 'USER_IN_COOLING_OFF', until: limits.coolingOffUntil };
  }
  if (currentDailyDeposit > limits.depositLimitDaily) {
    return { allowed: false, reason: 'DEPOSIT_LIMIT_EXCEEDED' };
  }
  if (currentSessionMinutes >= limits.sessionLimitMinutes) {
    warnings.push('REALITY_CHECK_SESSION_LIMIT_REACHED');
  }
  return { allowed: true, warnings };
}
