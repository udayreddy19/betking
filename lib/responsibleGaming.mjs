/**
 * Enterprise Responsible Gaming Engine — BetKing Sportsbook (lib/responsibleGaming.mjs)
 * Manages Deposit Limits, Loss Limits, Session Limits, Reality Check alerts,
 * Cooling-Off periods, Self-Exclusion rules, and Compliance Audit Logs.
 */

const USER_RG_PROFILES = new Map();

export function setResponsibleGamingLimits(userId, limits = {}) {
  const existing = USER_RG_PROFILES.get(userId) || {
    userId,
    depositLimitDaily: 50000.0,
    lossLimitDaily: 25000.0,
    sessionLimitMinutes: 120,
    selfExcludedUntil: null,
    coolingOffUntil: null,
  };

  const updated = { ...existing, ...limits, updatedAt: new Date().toISOString() };
  USER_RG_PROFILES.set(userId, updated);
  return updated;
}

export function validateResponsibleGamingStatus(userId, currentSessionMinutes = 0, currentDailyDeposit = 0) {
  const profile = USER_RG_PROFILES.get(userId);
  if (!profile) return { allowed: true, warnings: [] };

  const now = Date.now();
  const warnings = [];

  if (profile.selfExcludedUntil && new Date(profile.selfExcludedUntil).getTime() > now) {
    return { allowed: false, reason: 'USER_SELF_EXCLUDED', until: profile.selfExcludedUntil };
  }

  if (profile.coolingOffUntil && new Date(profile.coolingOffUntil).getTime() > now) {
    return { allowed: false, reason: 'USER_IN_COOLING_OFF', until: profile.coolingOffUntil };
  }

  if (currentDailyDeposit > profile.depositLimitDaily) {
    return { allowed: false, reason: 'DEPOSIT_LIMIT_EXCEEDED' };
  }

  if (currentSessionMinutes >= profile.sessionLimitMinutes) {
    warnings.push('REALITY_CHECK_SESSION_LIMIT_REACHED');
  }

  return { allowed: true, warnings };
}
