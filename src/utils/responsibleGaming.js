/** Responsible gaming — daily limits (IST calendar day) */
export const DEFAULT_DAILY_DEPOSIT_LIMIT = 50000;
export const DEFAULT_DAILY_STAKE_LIMIT = 25000;

export function getTodayKey() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export function normalizeRgState(user) {
  const today = getTodayKey();
  const sameDay = user?.rgDayKey === today;
  const day = sameDay ? user.rgDayKey : today;

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
  const lim = Number(rg.dailyDepositLimit);
  if (Number.isFinite(lim) && lim > 0 && rg.dailyDepositUsed + amt > lim) {
    return {
      ok: false,
      error: `Daily deposit limit of ₹${lim.toLocaleString('en-IN')} would be exceeded.`,
      rg,
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
  const lim = Number(rg.dailyStakeLimit);
  if (Number.isFinite(lim) && lim > 0 && rg.dailyStakeUsed + amt > lim) {
    return {
      ok: false,
      error: `Daily stake limit of ₹${lim.toLocaleString('en-IN')} would be exceeded.`,
      rg,
    };
  }
  return { ok: true, rg };
}
