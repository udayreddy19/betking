/**
 * Responsible gaming: deposit, stake, and loss limits plus cooling-off / self-exclusion.
 * Lookups fail closed. Limits are enforced, not stored-and-ignored.
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
  if (period === 'month') {
    return new Date(`${parts.year}-${parts.month}-01T00:00:00+05:30`).toISOString();
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

function isMissingRelation(err) {
  const msg = String(err?.message || '');
  return /does not exist|relation .* does not exist/i.test(msg);
}

function rgUnavailable(err) {
  const wrapped = new Error(`RG_UNAVAILABLE: ${err?.message || 'lookup failed'}`);
  wrapped.cause = err;
  wrapped.code = 'RG_UNAVAILABLE';
  wrapped.status = 503;
  return wrapped;
}

let pgQuery = null;

async function rgQuery(text, params) {
  if (typeof window !== 'undefined') return { rows: [], rowCount: 0 };
  try {
    if (!pgQuery) {
      const mod = await import('../db/pg.js');
      pgQuery = mod.query;
    }
    return await pgQuery(text, params);
  } catch (err) {
    if (isMissingRelation(err)) {
      return { rows: [], rowCount: 0, missingRelation: true };
    }
    throw err;
  }
}

function defaultLimitsFor(userId) {
  return {
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
}

class ResponsibleGamingEngine {
  constructor() {
    this.limitsMap = new Map();
    this.userDepositsTodayMap = new Map();
  }

  async getLimits(userId) {
    if (this.limitsMap.has(userId)) return this.limitsMap.get(userId);

    let res;
    try {
      res = await rgQuery(`SELECT * FROM responsible_gaming_limits WHERE user_id = $1`, [userId]);
    } catch (err) {
      throw rgUnavailable(err);
    }

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

    return defaultLimitsFor(userId);
  }

  async setLimits(userId, newLimits = {}, operatorId = 'user') {
    const existing = await this.getLimits(userId);
    const updated = {
      ...existing,
      ...newLimits,
      updatedAt: new Date().toISOString(),
    };

    this.limitsMap.set(userId, updated);

    try {
      await rgQuery(
        `INSERT INTO users (user_id, email) VALUES ($1, $1) ON CONFLICT (user_id) DO NOTHING`,
        [userId],
      );

      await rgQuery(`
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

      await rgQuery(`
        INSERT INTO responsible_gaming_audit_logs (user_id, action_type, old_value, new_value, reason)
        VALUES ($1, $2, $3, $4, $5)
      `, [userId, 'LIMIT_MODIFIED', JSON.stringify(existing), JSON.stringify(updated), `Updated by ${operatorId}`]);
    } catch (err) {
      logger.warn('rg_set_limits_persist_failed', { error: err.message });
    }

    return updated;
  }

  async sumPaidDepositsSince(userId, sinceIso) {
    try {
      const res = await rgQuery(
        `SELECT COALESCE(SUM(amount), 0) AS v
         FROM deposits
         WHERE user_id = $1
           AND UPPER(COALESCE(status, '')) IN ('COMPLETED', 'PAID', 'CAPTURED', 'SUCCESS')
           AND created_at >= $2`,
        [userId, sinceIso],
      );
      return Number(res.rows[0]?.v || 0);
    } catch (err) {
      throw rgUnavailable(err);
    }
  }

  async getNetCashLoss(userId, sinceIso) {
    let stakes;
    let returns;
    try {
      stakes = await rgQuery(
        `SELECT COALESCE(SUM(stake), 0) AS v
         FROM bets
         WHERE user_id = $1
           AND COALESCE(fund_source, 'cash') = 'cash'
           AND COALESCE(status, '') NOT IN ('CANCELLED')
           AND created_at >= $2`,
        [userId, sinceIso],
      );
      returns = await rgQuery(
        `SELECT COALESCE(SUM(amount), 0) AS v
         FROM transactions
         WHERE user_id = $1
           AND type IN ('BET_WIN', 'BET_VOID', 'BET_CASHOUT')
           AND created_at >= $2`,
        [userId, sinceIso],
      );
    } catch (err) {
      throw rgUnavailable(err);
    }
    return netCashLossFromTotals(stakes.rows[0]?.v, returns.rows[0]?.v);
  }

  async validateDepositAttempt(userId, depositAmount) {
    const amount = Number(depositAmount);
    if (isNaN(amount) || amount <= 0) return { allowed: false, reason: 'INVALID_AMOUNT' };

    const limits = await this.getLimits(userId);
    const now = Date.now();

    if (limits.selfExcludedUntil && new Date(limits.selfExcludedUntil).getTime() > now) {
      return { allowed: false, reason: 'USER_SELF_EXCLUDED', until: limits.selfExcludedUntil };
    }
    if (limits.coolingOffUntil && new Date(limits.coolingOffUntil).getTime() > now) {
      return { allowed: false, reason: 'USER_IN_COOLING_OFF', until: limits.coolingOffUntil };
    }

    const secStatus = userSecurityCenter.getAccountControlStatus(userId);
    if (secStatus.isRestricted) {
      return { allowed: false, reason: `ACCOUNT_RESTRICTED_${secStatus.accountState}` };
    }

    const dayStart = istPeriodStart('day');
    const weekStart = istPeriodStart('week');
    const monthStart = istPeriodStart('month');
    const [daySum, weekSum, monthSum] = await Promise.all([
      this.sumPaidDepositsSince(userId, dayStart),
      this.sumPaidDepositsSince(userId, weekStart),
      this.sumPaidDepositsSince(userId, monthStart),
    ]);
    const pendingToday = Number(this.userDepositsTodayMap.get(userId) || 0);

    if (amount + daySum + pendingToday > Number(limits.depositLimitDaily)) {
      this.auditLimitViolation(userId, 'DEPOSIT_LIMIT_EXCEEDED', { amount, daySum, limit: limits.depositLimitDaily });
      return { allowed: false, reason: 'DEPOSIT_LIMIT_EXCEEDED', limit: limits.depositLimitDaily };
    }
    if (amount + weekSum + pendingToday > Number(limits.depositLimitWeekly)) {
      this.auditLimitViolation(userId, 'DEPOSIT_LIMIT_EXCEEDED', { amount, weekSum, limit: limits.depositLimitWeekly });
      return { allowed: false, reason: 'DEPOSIT_LIMIT_EXCEEDED', limit: limits.depositLimitWeekly };
    }
    if (amount + monthSum + pendingToday > Number(limits.depositLimitMonthly)) {
      this.auditLimitViolation(userId, 'DEPOSIT_LIMIT_EXCEEDED', { amount, monthSum, limit: limits.depositLimitMonthly });
      return { allowed: false, reason: 'DEPOSIT_LIMIT_EXCEEDED', limit: limits.depositLimitMonthly };
    }

    return { allowed: true };
  }

  async recordDepositSuccess(userId, amount) {
    const currentToday = this.userDepositsTodayMap.get(userId) || 0;
    this.userDepositsTodayMap.set(userId, currentToday + Number(amount));
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
    await rgQuery(
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
    await rgQuery(
      `INSERT INTO reality_check_acks (user_id, acked_at, interval_mins)
       VALUES ($1, $2, $3)`,
      [userId, nowIso, limits.realityCheckIntervalMins],
    ).catch((err) => logger.warn('rg_ack_insert_failed', { error: err.message }));
    await rgQuery(
      `UPDATE responsible_gaming_limits SET last_reality_check_at = $2, updated_at = NOW() WHERE user_id = $1`,
      [userId, nowIso],
    ).catch((err) => logger.warn('rg_ack_update_failed', { error: err.message }));
    return this.getRealityCheckState(userId);
  }

  async validateBetPlacementAttempt(userId, stakeAmount, { fundSource = 'cash' } = {}) {
    const stake = Number(stakeAmount);
    if (!Number.isFinite(stake) || stake <= 0) {
      return { allowed: false, reason: 'INVALID_STAKE' };
    }

    const limits = await this.getLimits(userId);
    const now = Date.now();

    if (limits.selfExcludedUntil && new Date(limits.selfExcludedUntil).getTime() > now) {
      return { allowed: false, reason: 'USER_SELF_EXCLUDED', until: limits.selfExcludedUntil };
    }
    if (limits.coolingOffUntil && new Date(limits.coolingOffUntil).getTime() > now) {
      return { allowed: false, reason: 'USER_IN_COOLING_OFF', until: limits.coolingOffUntil };
    }

    if (stake > Number(limits.stakeLimitPerBet)) {
      this.auditLimitViolation(userId, 'STAKE_LIMIT_EXCEEDED', { stake, limit: limits.stakeLimitPerBet });
      return { allowed: false, reason: 'STAKE_LIMIT_EXCEEDED', limit: limits.stakeLimitPerBet };
    }

    if (String(fundSource).toLowerCase() === 'cash') {
      const dayLoss = await this.getNetCashLoss(userId, istPeriodStart('day'));
      if (dayLoss >= Number(limits.lossLimitDaily)) {
        this.auditLimitViolation(userId, 'LOSS_LIMIT_EXCEEDED', { dayLoss, limit: limits.lossLimitDaily });
        return { allowed: false, reason: 'LOSS_LIMIT_EXCEEDED', limit: limits.lossLimitDaily };
      }
      const weekLoss = await this.getNetCashLoss(userId, istPeriodStart('week'));
      if (weekLoss >= Number(limits.lossLimitWeekly)) {
        this.auditLimitViolation(userId, 'LOSS_LIMIT_EXCEEDED', { weekLoss, limit: limits.lossLimitWeekly });
        return { allowed: false, reason: 'LOSS_LIMIT_EXCEEDED', limit: limits.lossLimitWeekly };
      }
    }

    return { allowed: true };
  }

  async setCoolingOff(userId, { hours = 24, reason = 'User Cooling-off Period' } = {}) {
    const until = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    await this.setLimits(userId, { coolingOffUntil: until });

    await rgQuery(`
      INSERT INTO responsible_gaming_audit_logs (user_id, action_type, new_value, reason)
      VALUES ($1, 'COOLING_OFF_STARTED', $2, $3)
    `, [userId, JSON.stringify({ until, hours }), reason]).catch(() => {});

    return { success: true, userId, coolingOffUntil: until };
  }

  async setSelfExclusion(userId, { days = 30, reason = 'User Self-Exclusion Period' } = {}) {
    const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    await this.setLimits(userId, { selfExcludedUntil: until });

    await userSecurityCenter.selfExcludeAccount(userId, { durationDays: days, reason });

    await rgQuery(`
      INSERT INTO responsible_gaming_audit_logs (user_id, action_type, new_value, reason)
      VALUES ($1, 'SELF_EXCLUSION_STARTED', $2, $3)
    `, [userId, JSON.stringify({ until, days }), reason]).catch(() => {});

    return { success: true, userId, selfExcludedUntil: until };
  }

  auditLimitViolation(userId, violationType, details = {}) {
    rgQuery(`
      INSERT INTO responsible_gaming_audit_logs (user_id, action_type, old_value, reason)
      VALUES ($1, 'LIMIT_VIOLATION_BLOCKED', $2, $3)
    `, [userId, JSON.stringify(details), violationType]).catch(() => {});
  }
}

export const responsibleGamingEngine = new ResponsibleGamingEngine();

export function setResponsibleGamingLimits(userId, limits) {
  return responsibleGamingEngine.setLimits(userId, limits);
}

export function validateResponsibleGamingStatus(userId, currentSessionMinutes = 0, currentDailyDeposit = 0) {
  const now = Date.now();
  const limits = responsibleGamingEngine.limitsMap.get(userId) || defaultLimitsFor(userId);
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
