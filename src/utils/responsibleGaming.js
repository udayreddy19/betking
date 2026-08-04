/** Responsible gaming — daily limits (IST calendar day) */
export const DEFAULT_DAILY_DEPOSIT_LIMIT = 50000;
export const DEFAULT_DAILY_STAKE_LIMIT = 25000;

export function getTodayKey() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export function normalizeRgState(user) {
  const today = getTodayKey();
  const day = user?.rgDayKey === today ? today : today;
  const sameDay = user?.rgDayKey === today;

  return {
    rgDayKey: day,
    dailyDepositLimit: user?.dailyDepositLimit ?? DEFAULT_DAILY_DEPOSIT_LIMIT,
    dailyStakeLimit: user?.dailyStakeLimit ?? DEFAULT_DAILY_STAKE_LIMIT,
    dailyDepositUsed: sameDay ? (user?.dailyDepositUsed ?? 0) : 0,
    dailyStakeUsed: sameDay ? (user?.dailyStakeUsed ?? 0) : 0,
    selfExcludedUntil: user?.selfExcludedUntil || null,
  };
}

export function isSelfExcluded(user, now = Date.now()) {
  const until = user?.selfExcludedUntil;
  if (!until) return false;
  return new Date(until).getTime() > now;
}

export function canDepositAmount(user, amount) {
  if (isSelfExcluded(user)) {
    return { ok: false, error: 'Account is self-excluded. Deposits are blocked.' };
  }
  const rg = normalizeRgState(user);
  const amt = Number(amount) || 0;
  if (amt <= 0) return { ok: false, error: 'Enter a valid deposit amount.' };
  if (rg.dailyDepositUsed + amt > rg.dailyDepositLimit) {
    const left = Math.max(0, rg.dailyDepositLimit - rg.dailyDepositUsed);
    return {
      ok: false,
      error: `Daily deposit limit reached. You can deposit up to ₹${left.toLocaleString('en-IN')} more today.`,
    };
  }
  return { ok: true, rg };
}

export function canStakeAmount(user, amount) {
  if (isSelfExcluded(user)) {
    return { ok: false, error: 'Account is self-excluded. Betting is blocked.' };
  }
  const rg = normalizeRgState(user);
  const amt = Number(amount) || 0;
  if (amt <= 0) return { ok: false, error: 'Enter a valid stake.' };
  if (rg.dailyStakeUsed + amt > rg.dailyStakeLimit) {
    const left = Math.max(0, rg.dailyStakeLimit - rg.dailyStakeUsed);
    return {
      ok: false,
      error: `Daily stake limit reached. You can stake up to ₹${left.toLocaleString('en-IN')} more today.`,
    };
  }
  return { ok: true, rg };
}
