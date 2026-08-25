/**
 * Enterprise Responsible Gaming Engine — OddsYra Sportsbook (lib/responsibleGaming.mjs)
 * Enforces server-side deposit limits, loss limits, stake limits,
 * cooling-off periods, and self-exclusion with PostgreSQL audit logging.
 */

import { userSecurityCenter } from './userSecurityCenter.mjs';
import { logger } from './logger.mjs';

export function istPeriodStart(period, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
    }).formatToParts(now).map((p) => [p.type, p.value]),
  );
  const dayStart = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00+05:30`);
  if (period === 'week') {
    const weekdayOffset = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[parts.weekday] ?? 0;
    return new Date(dayStart.getTime() - weekdayOffset * 24 * 60 * 60 * 1000).toISOString();
  }
  return dayStart.toISOString();
}

export function netCashLossFromTotals(staked, returned) {
  return Math.max(0, Number(staked || 0) - Number(returned || 0));
}

export function isRealityCheckDue({
  lastAckAt,
  sessionStartedAt,
  intervalMins,
  now = Date.now(),
} = {}) {
  const mins = Number(intervalMins);
  if (!Number.isFinite(mins) || mins <= 0) return false;
  const anchor = lastAckAt || sessionStartedAt;
  if (!anchor) return false;
  return now - new Date(anchor).getTime() >= mins * 60 * 1000;
}

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
      lossLimitWeekly: 100000.0,
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
          lossLimitWeekly: Number(row.loss_limit_weekly ?? 100000),
          stakeLimitPerBet: Number(row.stake_limit_per_bet),
          lastRealityCheckAt: row.last_reality_check_at ? new Date(row.last_reality_check_at).toISOString() : null,
          sessionStartedAt: row.session_started_at ? new Date(row.session_started_at).toISOString() : null,
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
        INSERT INTO responsible_gaming_limits (
          user_id, deposit_limit_daily, deposit_limit_weekly, deposit_limit_monthly,
          loss_limit_daily, loss_limit_weekly, stake_limit_per_bet, session_limit_minutes,
          cooling_off_until, self_excluded_until, reality_check_interval_mins,
          last_reality_check_at, session_started_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
        ON CONFLICT (user_id) DO UPDATE
        SET deposit_limit_daily = EXCLUDED.deposit_limit_daily,
            deposit_limit_weekly = EXCLUDED.deposit_limit_weekly,
            deposit_limit_monthly = EXCLUDED.deposit_limit_monthly,
            loss_limit_daily = EXCLUDED.loss_limit_daily,
            loss_limit_weekly = EXCLUDED.loss_limit_weekly,
            stake_limit_per_bet = EXCLUDED.stake_limit_per_bet,
            session_limit_minutes = EXCLUDED.session_limit_minutes,
            cooling_off_until = EXCLUDED.cooling_off_until,
            self_excluded_until = EXCLUDED.self_excluded_until,
            reality_check_interval_mins = EXCLUDED.reality_check_interval_mins,
            last_reality_check_at = COALESCE(EXCLUDED.last_reality_check_at, responsible_gaming_limits.last_reality_check_at),
            session_started_at = COALESCE(EXCLUDED.session_started_at, responsible_gaming_limits.session_started_at),
            updated_at = NOW();
      `, [
        userId,
        updated.depositLimitDaily,
        updated.depositLimitWeekly,
        updated.depositLimitMonthly,
        updated.lossLimitDaily,
        updated.lossLimitWeekly,
        updated.stakeLimitPerBet,
        updated.sessionLimitMinutes,
        updated.coolingOffUntil,
        updated.selfExcludedUntil,
        updated.realityCheckIntervalMins,
        updated.lastRealityCheckAt || null,
        updated.sessionStartedAt || null,
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

  async getNetCashLoss(userId, sinceIso) {
    const stakes = await safePgQuery(
      `SELECT COALESCE(SUM(stake), 0) AS v
       FROM bets
       WHERE user_id = $1
         AND COALESCE(fund_source, 'cash') = 'cash'
         AND COALESCE(status, '') NOT IN ('CANCELLED')
         AND created_at >= $2`,
      [userId, sinceIso],
    );
    const returns = await safePgQuery(
      `SELECT COALESCE(SUM(amount), 0) AS v
       FROM transactions
       WHERE user_id = $1
         AND type IN ('BET_WIN', 'BET_VOID', 'BET_CASHOUT')
         AND created_at >= $2`,
      [userId, sinceIso],
    );
    return netCashLossFromTotals(stakes.rows[0]?.v, returns.rows[0]?.v);
  }

  async startSession(userId) {
    const nowIso = new Date().toISOString();
    const limits = await this.getLimits(userId);
    const next = {
      ...limits,
      sessionStartedAt: nowIso,
      lastRealityCheckAt: nowIso,
    };
    this.limitsMap.set(userId, next);
    await safePgQuery(
      `INSERT INTO responsible_gaming_limits (user_id, session_started_at, last_reality_check_at, updated_at)
       VALUES ($1, $2, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE
       SET session_started_at = EXCLUDED.session_started_at,
           last_reality_check_at = EXCLUDED.last_reality_check_at,
           updated_at = NOW()`,
      [userId, nowIso],
    ).catch((err) => logger.warn('rg_session_start_failed', { error: err.message }));
    return {
      due: false,
      intervalMins: next.realityCheckIntervalMins,
      lastAckAt: nowIso,
      sessionStartedAt: nowIso,
      lossLimitDaily: next.lossLimitDaily,
      lossLimitWeekly: next.lossLimitWeekly,
    };
  }

  async getRealityCheckState(userId) {
    const limits = await this.getLimits(userId);
    if (!limits.sessionStartedAt && !limits.lastRealityCheckAt) {
      return this.startSession(userId);
    }
    const due = isRealityCheckDue({
      lastAckAt: limits.lastRealityCheckAt,
      sessionStartedAt: limits.sessionStartedAt,
      intervalMins: limits.realityCheckIntervalMins,
    });
    return {
      due,
      intervalMins: limits.realityCheckIntervalMins,
      lastAckAt: limits.lastRealityCheckAt,
      sessionStartedAt: limits.sessionStartedAt,
      lossLimitDaily: limits.lossLimitDaily,
      lossLimitWeekly: limits.lossLimitWeekly,
    };
  }

  async acknowledgeRealityCheck(userId) {
    const nowIso = new Date().toISOString();
    const limits = await this.getLimits(userId);
    const next = { ...limits, lastRealityCheckAt: nowIso };
    this.limitsMap.set(userId, next);
    await safePgQuery(
      `INSERT INTO reality_check_acks (user_id, acked_at, interval_mins)
       VALUES ($1, $2, $3)`,
      [userId, nowIso, limits.realityCheckIntervalMins],
    ).catch((err) => logger.warn('rg_ack_insert_failed', { error: err.message }));
    await safePgQuery(
      `UPDATE responsible_gaming_limits SET last_reality_check_at = $2, updated_at = NOW() WHERE user_id = $1`,
      [userId, nowIso],
    ).catch((err) => logger.warn('rg_ack_update_failed', { error: err.message }));
    return this.getRealityCheckState(userId);
  }

  async validateBetPlacementAttempt(userId, stakeAmount, { fundSource = 'cash' } = {}) {
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

    if (fundSource === 'cash') {
      const dailyLoss = await this.getNetCashLoss(userId, istPeriodStart('day'));
      if (dailyLoss + stake > Number(limits.lossLimitDaily)) {
        this.auditLimitViolation(userId, 'LOSS_LIMIT_DAILY_EXCEEDED', { dailyLoss, stake, limit: limits.lossLimitDaily });
        return {
          allowed: false,
          reason: 'LOSS_LIMIT_EXCEEDED',
          message: `This bet would exceed your daily loss limit of ₹${limits.lossLimitDaily} (net cash loss today: ₹${dailyLoss}).`,
          period: 'daily',
          currentLoss: dailyLoss,
          limit: limits.lossLimitDaily,
        };
      }
      const weeklyLoss = await this.getNetCashLoss(userId, istPeriodStart('week'));
      if (weeklyLoss + stake > Number(limits.lossLimitWeekly)) {
        this.auditLimitViolation(userId, 'LOSS_LIMIT_WEEKLY_EXCEEDED', { weeklyLoss, stake, limit: limits.lossLimitWeekly });
        return {
          allowed: false,
          reason: 'LOSS_LIMIT_EXCEEDED',
          message: `This bet would exceed your weekly loss limit of ₹${limits.lossLimitWeekly} (net cash loss this week: ₹${weeklyLoss}).`,
          period: 'weekly',
          currentLoss: weeklyLoss,
          limit: limits.lossLimitWeekly,
        };
      }
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
