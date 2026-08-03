import { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { STARTING_BALANCE, WELCOME_BONUS } from '../data/mockData';
import { formatInr } from '../utils/walletBalance';
import { getWithdrawableAmount, splitBetWinPayout } from '../utils/wageringRules';
import {
  pointsFromSpend,
  pointsToRupees,
  LOYALTY_MIN_REDEEM_POINTS,
  canRedeemLoyaltyPoints,
  getUserLoyaltyPoints,
} from '../utils/loyaltyPoints';

const AuthContext = createContext(null);

const USERS_KEY = 'betking_users';
const SESSION_KEY = 'betking_session';
const CLAIMED_PROMOS_KEY = 'betking_claimed_promos';
const SEED_USER = {
  email: 'demo@betking.com',
  password: 'demo1234',
  displayName: 'Demo User',
  balance: 8500,
  lockedDepositBalance: 0,
  bonusBalance: 1200,
  freebetBalance: 300,
  loyaltyLevel: 1,
  loyaltyRank: 'Rookie',
  xpToNext: 1000,
  notifications: 0,
  loyaltyPoints: 850,
  coins: 850,
};

function ensureSeedUser() {
  const users = getStoredUsers();
  if (!users.some(u => u.email === SEED_USER.email)) {
    saveStoredUsers([...users, SEED_USER]);
  }
}

function getStoredUsers() {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveStoredUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function toSessionUser(stored) {
  return {
    email: stored.email,
    username: stored.email,
    displayName: stored.displayName,
    phone: stored.phone,
    balance: stored.balance,
    lockedDepositBalance: stored.lockedDepositBalance ?? 0,
    bonusBalance: stored.bonusBalance ?? 0,
    freebetBalance: stored.freebetBalance ?? 0,
    loyaltyLevel: stored.loyaltyLevel ?? 1,
    loyaltyRank: stored.loyaltyRank ?? 'Rookie',
    xpToNext: stored.xpToNext ?? 1000,
    notifications: stored.notifications ?? 0,
    loyaltyPoints: stored.loyaltyPoints ?? stored.coins ?? 0,
    coins: stored.loyaltyPoints ?? stored.coins ?? 0,
  };
}

function persistSession(user) {
  if (user) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
}

function syncStoredUser(sessionUser) {
  const users = getStoredUsers();
  const idx = users.findIndex(u => u.email === sessionUser.email);
  if (idx < 0) return;
  users[idx] = {
    ...users[idx],
    displayName: sessionUser.displayName,
    phone: sessionUser.phone ?? users[idx].phone,
    balance: sessionUser.balance,
    lockedDepositBalance: sessionUser.lockedDepositBalance ?? users[idx].lockedDepositBalance ?? 0,
    bonusBalance: sessionUser.bonusBalance ?? users[idx].bonusBalance ?? 0,
    freebetBalance: sessionUser.freebetBalance ?? users[idx].freebetBalance ?? 0,
    loyaltyLevel: sessionUser.loyaltyLevel,
    loyaltyRank: sessionUser.loyaltyRank,
    xpToNext: sessionUser.xpToNext,
    notifications: sessionUser.notifications,
    loyaltyPoints: sessionUser.loyaltyPoints ?? sessionUser.coins ?? users[idx].loyaltyPoints ?? users[idx].coins ?? 0,
    coins: sessionUser.loyaltyPoints ?? sessionUser.coins ?? users[idx].loyaltyPoints ?? users[idx].coins ?? 0,
  };
  saveStoredUsers(users);
}

function getClaimedPromos(email) {
  try {
    const all = JSON.parse(localStorage.getItem(CLAIMED_PROMOS_KEY) || '{}');
    return all[email] || [];
  } catch {
    return [];
  }
}

function saveClaimedPromo(email, promoId) {
  const all = JSON.parse(localStorage.getItem(CLAIMED_PROMOS_KEY) || '{}');
  all[email] = [...(all[email] || []), promoId];
  localStorage.setItem(CLAIMED_PROMOS_KEY, JSON.stringify(all));
}

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(null);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(null);
  }, []);

  const showToast = useCallback((msg, variant = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message: msg, variant });
    toastTimerRef.current = setTimeout(() => setToast(null), 4500);
  }, []);

  const setUser = useCallback((next) => {
    setUserState(prev => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      persistSession(resolved);
      if (resolved) syncStoredUser(resolved);
      return resolved;
    });
  }, []);

  useEffect(() => {
    ensureSeedUser();
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      if (saved) setUserState(JSON.parse(saved));
    } catch {
      localStorage.removeItem(SESSION_KEY);
    }

    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const register = useCallback(({ email, password, displayName, phone }) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password || !displayName?.trim()) {
      return { ok: false, error: 'Please fill in all required fields.' };
    }

    const users = getStoredUsers();
    if (users.some(u => u.email === normalizedEmail)) {
      return { ok: false, error: 'An account with this email already exists.' };
    }

    const welcomeCredit = WELCOME_BONUS.registrationCredit || 0;
    const stored = {
      email: normalizedEmail,
      password,
      displayName: displayName.trim(),
      phone: phone?.trim() || '',
      balance: STARTING_BALANCE,
      lockedDepositBalance: 0,
      bonusBalance: welcomeCredit,
      freebetBalance: 0,
      loyaltyLevel: 1,
      loyaltyRank: 'Rookie',
      xpToNext: 1000,
      notifications: 0,
      loyaltyPoints: 50,
      coins: 50,
      welcomeBonusApplied: true,
    };

    saveStoredUsers([...users, stored]);
    return { ok: true, welcomeCredit };
  }, []);

  const claimPromotion = useCallback((promo) => {
    if (!user) {
      return { ok: false, error: 'Please log in to claim this promotion.' };
    }

    const claimed = getClaimedPromos(user.email);
    if (claimed.includes(promo.id)) {
      return { ok: false, error: 'You have already claimed this promotion.' };
    }

    const amount = promo.bonusAmount || 500;
    saveClaimedPromo(user.email, promo.id);
    setUser(prev => (prev ? { ...prev, bonusBalance: (prev.bonusBalance ?? 0) + amount } : prev));
    showToast(`₹${amount.toLocaleString('en-IN')} bonus credited! Bet at 1.80+ odds to use it.`, 'success');
    return { ok: true, amount };
  }, [user, setUser, showToast]);

  const isPromotionClaimed = useCallback((promoId) => {
    if (!user) return false;
    return getClaimedPromos(user.email).includes(promoId);
  }, [user]);

  const login = useCallback((email, password) => {
    const normalizedEmail = email.trim().toLowerCase();
    const stored = getStoredUsers().find(
      u => u.email === normalizedEmail && u.password === password
    );

    if (!stored) return false;

    const sessionUser = toSessionUser(stored);
    setUser(sessionUser);
    setIsLoginModalOpen(false);
    showToast(`Welcome back, ${sessionUser.displayName}!`);
    return true;
  }, [setUser, showToast]);

  const logout = useCallback(() => {
    setUser(null);
    setIsSidebarOpen(false);
    showToast('You have been logged out.', 'info');
  }, [setUser, showToast]);

  const addFunds = useCallback((amount, method = 'Deposit') => {
    setUser(prev => {
      if (!prev) return prev;
      const deposit = Number(amount) || 0;
      return {
        ...prev,
        balance: prev.balance + deposit,
        lockedDepositBalance: (prev.lockedDepositBalance ?? 0) + deposit,
      };
    });
    showToast(
      `Deposited ${formatInr(amount)} via ${method}. Wager this amount before withdrawal.`,
      'success',
    );
  }, [setUser, showToast]);

  const deductStake = useCallback(({ cashAmount = 0, bonusAmount = 0 } = {}) => {
    const cash = Number(cashAmount) || 0;
    const bonus = Number(bonusAmount) || 0;
    const result = { success: false, pointsEarned: 0, wageringApplied: 0 };

    setUser(prev => {
      if (!prev) return prev;
      if (cash > 0 && prev.balance < cash) return prev;
      if (bonus > 0 && (prev.bonusBalance ?? 0) < bonus) return prev;

      const locked = prev.lockedDepositBalance ?? 0;
      const wageringApplied = Math.min(cash, locked);
      const spendTotal = cash + bonus;
      const pointsEarned = pointsFromSpend(spendTotal);
      const currentPoints = getUserLoyaltyPoints(prev);
      const nextPoints = currentPoints + pointsEarned;

      result.success = true;
      result.pointsEarned = pointsEarned;
      result.wageringApplied = wageringApplied;

      return {
        ...prev,
        balance: prev.balance - cash,
        bonusBalance: (prev.bonusBalance ?? 0) - bonus,
        lockedDepositBalance: locked - wageringApplied,
        loyaltyPoints: nextPoints,
        coins: nextPoints,
      };
    });

    if (result.success && result.pointsEarned > 0) {
      showToast(`+${result.pointsEarned} loyalty points earned`, 'success');
    }
    return result;
  }, [setUser, showToast]);

  const refundStake = useCallback(({ cashAmount = 0, bonusAmount = 0, wageringApplied = 0 } = {}) => {
    setUser(prev => {
      if (!prev) return prev;
      const cash = Number(cashAmount) || 0;
      const bonus = Number(bonusAmount) || 0;
      const wagering = Number(wageringApplied) || 0;
      return {
        ...prev,
        balance: prev.balance + cash,
        bonusBalance: (prev.bonusBalance ?? 0) + bonus,
        lockedDepositBalance: (prev.lockedDepositBalance ?? 0) + wagering,
      };
    });
  }, [setUser]);

  /** @deprecated Use deductStake — kept for any legacy callers */
  const deductFunds = useCallback((amount) => {
    return deductStake({ cashAmount: amount }).success;
  }, [deductStake]);

  const redeemLoyaltyPoints = useCallback(() => {
    let redeemedPoints = 0;
    let creditedRupees = 0;
    let error = null;

    setUser(prev => {
      if (!prev) {
        error = 'Please log in to redeem points.';
        return prev;
      }
      const points = getUserLoyaltyPoints(prev);
      if (!canRedeemLoyaltyPoints(points)) {
        error = `You need at least ${LOYALTY_MIN_REDEEM_POINTS} points to redeem.`;
        return prev;
      }
      redeemedPoints = points;
      creditedRupees = pointsToRupees(points);
      return {
        ...prev,
        balance: prev.balance + creditedRupees,
        loyaltyPoints: 0,
        coins: 0,
      };
    });

    if (error) {
      showToast(error, 'info');
      return { ok: false, error };
    }

    showToast(
      'Redeemed ' + redeemedPoints + ' points - ' + formatInr(creditedRupees) + ' credited to wallet',
      'success',
    );
    return { ok: true, points: redeemedPoints, rupees: creditedRupees };
  }, [setUser, showToast]);

  const updateUserBalance = useCallback((delta) => {
    let success = false;
    setUser(prev => {
      if (!prev) return prev;
      const nextBalance = prev.balance + delta;
      if (nextBalance < 0) return prev;
      success = true;
      return { ...prev, balance: nextBalance };
    });
    return success;
  }, [setUser]);

  const creditBetWin = useCallback((bet) => {
    const { cashCredit, bonusCredit } = splitBetWinPayout(bet);
    if (cashCredit <= 0 && bonusCredit <= 0) return { cashCredit: 0, bonusCredit: 0 };

    setUser(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        balance: prev.balance + cashCredit,
        bonusBalance: (prev.bonusBalance ?? 0) + bonusCredit,
      };
    });
    return { cashCredit, bonusCredit };
  }, [setUser]);

  const withdrawFunds = useCallback((amount) => {
    const amt = Number(amount) || 0;
    let success = false;
    let maxWithdrawable = 0;

    setUser(prev => {
      if (!prev) return prev;
      maxWithdrawable = getWithdrawableAmount(prev);
      if (amt <= 0 || amt > maxWithdrawable) return prev;
      success = true;
      return { ...prev, balance: prev.balance - amt };
    });

    return { success, maxWithdrawable };
  }, [setUser]);

  const openLoginModal = useCallback(() => setIsLoginModalOpen(true), []);
  const closeLoginModal = useCallback(() => setIsLoginModalOpen(false), []);
  const openDepositModal = useCallback(() => setIsDepositModalOpen(true), []);
  const closeDepositModal = useCallback(() => setIsDepositModalOpen(false), []);
  const toggleSidebar = useCallback(() => setIsSidebarOpen(prev => !prev), []);
  const closeSidebar = useCallback(() => setIsSidebarOpen(false), []);

  const value = useMemo(() => ({
    user,
    isLoggedIn: !!user,
    register,
    claimPromotion,
    isPromotionClaimed,
    login,
    logout,
    addFunds,
    deductFunds,
    deductStake,
    refundStake,
    redeemLoyaltyPoints,
    updateUserBalance,
    creditBetWin,
    withdrawFunds,
    toast,
    showToast,
    dismissToast,
    isLoginModalOpen,
    openLoginModal,
    closeLoginModal,
    isDepositModalOpen,
    openDepositModal,
    closeDepositModal,
    isSidebarOpen,
    toggleSidebar,
    closeSidebar,
  }), [
    user,
    register,
    claimPromotion,
    isPromotionClaimed,
    login,
    logout,
    addFunds,
    deductFunds,
    deductStake,
    refundStake,
    redeemLoyaltyPoints,
    updateUserBalance,
    creditBetWin,
    withdrawFunds,
    toast,
    showToast,
    dismissToast,
    isLoginModalOpen,
    openLoginModal,
    closeLoginModal,
    isDepositModalOpen,
    openDepositModal,
    closeDepositModal,
    isSidebarOpen,
    toggleSidebar,
    closeSidebar,
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
