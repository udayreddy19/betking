import { normalizeRgState } from '../../utils/responsibleGaming';
import { storageGet, storageSet, storageRemove } from '../../utils/browserCompat';

const USERS_KEY = 'oddsyra_users';
export const SESSION_KEY = 'oddsyra_session';
const CLAIMED_PROMOS_KEY = 'oddsyra_claimed_promos';
const SEED_USER = {
  email: 'demo@oddsyra.com',
  password: 'demo1234',
  displayName: 'Demo User',
  balance: 8500,
  lockedDepositBalance: 0,
  winningsBalance: 8500,
  bonusBalance: 1200,
  freebetBalance: 300,
  loyaltyLevel: 1,
  loyaltyRank: 'SILVER',
  loyaltyTier: 'SILVER',
  xpToNext: 1000,
  notifications: 0,
  loyaltyPoints: 850,
  coins: 850,
};

export function ensureSeedUser() {
  const users = getStoredUsers();
  if (!users.some(u => u.email === SEED_USER.email)) {
    saveStoredUsers([...users, SEED_USER]);
  }
}

export function getStoredUsers() {
  try {
    return JSON.parse(storageGet(USERS_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveStoredUsers(users) {
  storageSet(USERS_KEY, JSON.stringify(users));
}

export function toSessionUser(stored) {
  return {
    email: stored.email,
    username: stored.email,
    displayName: stored.displayName,
    phone: stored.phone,
    balance: stored.balance,
    lockedDepositBalance: stored.lockedDepositBalance ?? 0,
    winningsBalance: stored.winningsBalance ?? Math.max(
      0,
      (stored.balance ?? 0) - (stored.lockedDepositBalance ?? 0),
    ),
    bonusBalance: stored.bonusBalance ?? 0,
    freebetBalance: stored.freebetBalance ?? 0,
    loyaltyLevel: stored.loyaltyLevel ?? 1,
    loyaltyTier: stored.loyaltyTier || stored.loyaltyRank || 'BRONZE',
    loyaltyRank: stored.loyaltyTier || stored.loyaltyRank || 'BRONZE',
    xpToNext: stored.xpToNext ?? 1000,
    notifications: stored.notifications ?? 0,
    loyaltyPoints: stored.loyaltyPoints ?? stored.coins ?? 0,
    coins: stored.loyaltyPoints ?? stored.coins ?? 0,
    ...normalizeRgState(stored),
  };
}

export function persistSession(user) {
  if (user) {
    storageSet(SESSION_KEY, JSON.stringify(user));
  } else {
    storageRemove(SESSION_KEY);
  }
}

export function syncStoredUser(sessionUser) {
  const users = getStoredUsers();
  const idx = users.findIndex(u => u.email.toLowerCase() === sessionUser.email.toLowerCase());
  if (idx < 0) return;
  users[idx] = {
    ...users[idx],
    displayName: sessionUser.displayName,
    phone: sessionUser.phone ?? users[idx].phone,
    balance: sessionUser.balance,
    lockedDepositBalance: sessionUser.lockedDepositBalance ?? users[idx].lockedDepositBalance ?? 0,
    winningsBalance: sessionUser.winningsBalance ?? users[idx].winningsBalance ?? 0,
    bonusBalance: sessionUser.bonusBalance ?? users[idx].bonusBalance ?? 0,
    freebetBalance: sessionUser.freebetBalance ?? users[idx].freebetBalance ?? 0,
    loyaltyLevel: sessionUser.loyaltyLevel,
    loyaltyRank: sessionUser.loyaltyRank,
    loyaltyTier: sessionUser.loyaltyTier || sessionUser.loyaltyRank,
    xpToNext: sessionUser.xpToNext,
    notifications: sessionUser.notifications,
    loyaltyPoints: sessionUser.loyaltyPoints ?? sessionUser.coins ?? users[idx].loyaltyPoints ?? users[idx].coins ?? 0,
    coins: sessionUser.loyaltyPoints ?? sessionUser.coins ?? users[idx].loyaltyPoints ?? users[idx].coins ?? 0,
    dailyDepositLimit: sessionUser.dailyDepositLimit ?? users[idx].dailyDepositLimit,
    dailyStakeLimit: sessionUser.dailyStakeLimit ?? users[idx].dailyStakeLimit,
    dailyDepositUsed: sessionUser.dailyDepositUsed ?? users[idx].dailyDepositUsed ?? 0,
    dailyStakeUsed: sessionUser.dailyStakeUsed ?? users[idx].dailyStakeUsed ?? 0,
    rgDayKey: sessionUser.rgDayKey ?? users[idx].rgDayKey,
    selfExcludedUntil: sessionUser.selfExcludedUntil ?? users[idx].selfExcludedUntil ?? null,
  };
  saveStoredUsers(users);
}

export function getClaimedPromos(email) {
  try {
    const all = JSON.parse(storageGet(CLAIMED_PROMOS_KEY) || '{}');
    return all[email] || [];
  } catch {
    return [];
  }
}

export function saveClaimedPromo(email, promoId) {
  try {
    const all = JSON.parse(storageGet(CLAIMED_PROMOS_KEY) || '{}');
    all[email] = [...(all[email] || []), promoId];
    storageSet(CLAIMED_PROMOS_KEY, JSON.stringify(all));
  } catch {
    // ignore quota / private mode
  }
}
