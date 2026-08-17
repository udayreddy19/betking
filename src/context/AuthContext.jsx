import { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { STARTING_BALANCE, WELCOME_BONUS } from '../data/mockData';
import { formatInr } from '../utils/walletBalance';
import {
  getWithdrawableAmount,
  splitBetWinPayout,
  allocateCashStake,
} from '../utils/wageringRules';
import { appendTransaction, loadTransactions, updateTransactionStatus } from '../utils/transactions';
import {
  pointsFromSpend,
  pointsToRupees,
  LOYALTY_MIN_REDEEM_POINTS,
  canRedeemLoyaltyPoints,
  getUserLoyaltyPoints,
} from '../utils/loyaltyPoints';
import {
  normalizeRgState,
  canDepositAmount,
  canStakeAmount,
} from '../utils/responsibleGaming';
import { storageGet, storageSet, storageRemove } from '../utils/browserCompat';
import {
  apiFetch,
  fetchMe,
  mapServerUserToSession,
  setAccessToken,
  clearAccessToken,
} from '../utils/apiClient';

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === '1' || import.meta.env.DEV;


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
  winningsBalance: 8500,
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
    return JSON.parse(storageGet(USERS_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveStoredUsers(users) {
  storageSet(USERS_KEY, JSON.stringify(users));
}

function toSessionUser(stored) {
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
    loyaltyRank: stored.loyaltyRank ?? 'Rookie',
    xpToNext: stored.xpToNext ?? 1000,
    notifications: stored.notifications ?? 0,
    loyaltyPoints: stored.loyaltyPoints ?? stored.coins ?? 0,
    coins: stored.loyaltyPoints ?? stored.coins ?? 0,
    ...normalizeRgState(stored),
  };
}

function persistSession(user) {
  if (user) {
    storageSet(SESSION_KEY, JSON.stringify(user));
  } else {
    storageRemove(SESSION_KEY);
  }
}

function syncStoredUser(sessionUser) {
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

function getClaimedPromos(email) {
  try {
    const all = JSON.parse(storageGet(CLAIMED_PROMOS_KEY) || '{}');
    return all[email] || [];
  } catch {
    return [];
  }
}

function saveClaimedPromo(email, promoId) {
  try {
    const all = JSON.parse(storageGet(CLAIMED_PROMOS_KEY) || '{}');
    all[email] = [...(all[email] || []), promoId];
    storageSet(CLAIMED_PROMOS_KEY, JSON.stringify(all));
  } catch {
    // ignore quota / private mode
  }
}

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(null);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [finModalType, setFinModalType] = useState(null);
  const [toast, setToast] = useState(null);
  const [transactions, setTransactions] = useState([]);
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
    if (DEMO_MODE) ensureSeedUser();

    const restoreSession = async () => {
      const token = sessionStorage.getItem('bk_access_token');
      if (token) {
        const me = await fetchMe();
        if (me) {
          const session = mapServerUserToSession(me);
          setUserState(session);
          setTransactions(loadTransactions(session.email));
          return;
        }
        clearAccessToken();
      }

      if (!DEMO_MODE) {
        storageRemove(SESSION_KEY);
        return;
      }

      try {
        const saved = storageGet(SESSION_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          const session = {
            ...parsed,
            winningsBalance: parsed.winningsBalance ?? Math.max(
              0,
              (parsed.balance ?? 0) - (parsed.lockedDepositBalance ?? 0),
            ),
          };
          setUserState(session);
          setTransactions(loadTransactions(session.email));
        }
      } catch {
        storageRemove(SESSION_KEY);
      }
    };

    restoreSession();

    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const recordTx = useCallback((email, entry) => {
    if (!email) return;
    setTransactions(appendTransaction(email, entry));
  }, []);

  const register = useCallback(async ({ email, password, displayName, phone }) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password || !displayName?.trim()) {
      return { ok: false, error: 'Please fill in all required fields.' };
    }

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: normalizedEmail,
          password,
          firstName: displayName.trim(),
          phone: phone?.trim() || '',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data.error || 'Registration failed.' };
      }

      if (data.accessToken) {
        setAccessToken(data.accessToken);
      }

      const me = await fetchMe();
      const sessionUser = mapServerUserToSession(me) || toSessionUser({
        userId: data.user?.userId,
        email: normalizedEmail,
        displayName: displayName.trim(),
        phone: phone?.trim() || '',
        balance: 0,
        lockedDepositBalance: 0,
        winningsBalance: 0,
        bonusBalance: 0,
        freebetBalance: 0,
        loyaltyLevel: 1,
        loyaltyRank: 'Rookie',
        xpToNext: 1000,
        notifications: 0,
        loyaltyPoints: 0,
        coins: 0,
      });

      if (DEMO_MODE) {
        const users = getStoredUsers();
        saveStoredUsers([...users.filter(u => u.email !== normalizedEmail), {
          ...sessionUser,
          password,
          welcomeBonusApplied: true,
        }]);
      }

      setUser(sessionUser);
      return { ok: true, welcomeCredit: 0 };
    } catch {
      if (!DEMO_MODE) {
        return { ok: false, error: 'Unable to reach registration service.' };
      }
      // Offline demo fallback
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
        winningsBalance: 0,
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
    }
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
    recordTx(user.email, {
      type: 'bonus',
      amount,
      label: `Bonus claimed · ${promo.title || promo.id}`,
    });
    showToast(`₹${amount.toLocaleString('en-IN')} bonus credited! Bet at 1.80+ odds to use it.`, 'success');
    return { ok: true, amount };
  }, [user, setUser, showToast, recordTx]);

  const isPromotionClaimed = useCallback((promoId) => {
    if (!user) return false;
    return getClaimedPromos(user.email).includes(promoId);
  }, [user]);

  const login = useCallback(async (email, password) => {
    const normalizedEmail = email.trim().toLowerCase();

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: normalizedEmail, password }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        if (data.accessToken) {
          setAccessToken(data.accessToken);
        }

        const me = await fetchMe();
        const sessionUser = me
          ? mapServerUserToSession(me)
          : toSessionUser({
            userId: data.user.userId,
            email: data.user.email,
            displayName: data.user.displayName || normalizedEmail.split('@')[0],
            balance: 0,
            winningsBalance: 0,
          });

        setUser(sessionUser);
        setTransactions(loadTransactions(sessionUser.email));
        setIsLoginModalOpen(false);
        showToast(`Welcome back, ${sessionUser.displayName}!`);
        return true;
      }
    } catch {
      if (!DEMO_MODE) return false;
    }

    if (!DEMO_MODE) return false;

    // Demo-only offline fallback
    const stored = getStoredUsers().find(
      u => u.email === normalizedEmail && u.password === password
    );

    if (!stored) return false;

    const sessionUser = toSessionUser(stored);
    setUser(sessionUser);
    setTransactions(loadTransactions(sessionUser.email));
    setIsLoginModalOpen(false);
    showToast(`Welcome back, ${sessionUser.displayName}!`);
    return true;
  }, [setUser, showToast]);

  const forgotPassword = useCallback(async (email) => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      return { ok: false, error: 'Please enter a valid email address.' };
    }

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      const data = await res.json();
      return {
        ok: true,
        message: data.message || 'If that account exists, a reset code was generated.',
        resetToken: data.resetToken, // Returned in dev mode for instant testing
      };
    } catch {
      return {
        ok: true,
        message: 'Password reset link sent.',
      };
    }
  }, []);

  const resetPassword = useCallback(async (tokenOrEmail, newPassword) => {
    const trimmedToken = String(tokenOrEmail || '').trim();
    if (!trimmedToken || !newPassword || String(newPassword).length < 6) {
      return { ok: false, error: 'Enter a valid verification code and a password of at least 6 characters.' };
    }

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: trimmedToken, password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data.error || 'Password reset failed. Invalid or expired code.' };
      }
      return { ok: true, message: data.message || 'Password reset successfully.' };
    } catch {
      // Local fallback
      const users = getStoredUsers();
      const idx = users.findIndex((u) => u.email === trimmedToken.toLowerCase());
      if (idx >= 0) {
        users[idx] = { ...users[idx], password: String(newPassword) };
        saveStoredUsers(users);
        return { ok: true };
      }
      return { ok: false, error: 'Unable to connect to server.' };
    }
  }, []);

  const verifyEmail = useCallback(async (token) => {
    const trimmed = String(token || '').trim();
    if (!trimmed) {
      return { ok: false, error: 'Verification token is required.' };
    }

    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data.error || 'Verification failed.' };
      }
      showToast('Email verified successfully!', 'success');
      return { ok: true };
    } catch {
      return { ok: false, error: 'Unable to reach verification service.' };
    }
  }, [showToast]);


  const changePassword = useCallback(async (currentPassword, newPassword) => {
    if (!user) return { ok: false, error: 'Please log in to change your password.' };
    if (!newPassword || String(newPassword).length < 8) {
      return { ok: false, error: 'New password must be at least 8 characters.' };
    }

    try {
      const res = await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data.error || 'Password change failed.' };
      }
      clearAccessToken();
      setUser(null);
      return { ok: true, message: data.message };
    } catch {
      if (!DEMO_MODE) {
        return { ok: false, error: 'Unable to reach password service.' };
      }
      const users = getStoredUsers();
      const idx = users.findIndex((u) => u.email.toLowerCase() === user.email.toLowerCase());
      if (idx < 0 || users[idx].password !== currentPassword) {
        return { ok: false, error: 'Current password is incorrect.' };
      }
      users[idx] = { ...users[idx], password: String(newPassword) };
      saveStoredUsers(users);
      return { ok: true };
    }
  }, [user]);

  const refreshWallet = useCallback(async () => {
    const me = await fetchMe();
    if (!me) return false;
    const sessionUser = mapServerUserToSession(me);
    setUser(sessionUser);
    return true;
  }, [setUser]);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore network error on logout
    }
    clearAccessToken();
    setUser(null);
    setTransactions([]);
    setIsSidebarOpen(false);
    showToast('You have been logged out.', 'info');
  }, [setUser, showToast]);


  const addFunds = useCallback(async (amount, method = 'Deposit') => {
    if (!DEMO_MODE) {
      const refreshed = await refreshWallet();
      if (refreshed) {
        showToast('Deposit received — wallet updated.', 'success');
        return true;
      }
      showToast('Payment processing — balance will update shortly.', 'info');
      return false;
    }

    const deposit = Number(amount) || 0;
    let email = null;
    let blocked = null;

    setUser(prev => {
      if (!prev) return prev;
      const check = canDepositAmount(prev, deposit);
      if (!check.ok) {
        blocked = check.error;
        return prev;
      }
      email = prev.email;
      const rg = check.rg;
      return {
        ...prev,
        balance: prev.balance + deposit,
        lockedDepositBalance: (prev.lockedDepositBalance ?? 0) + deposit,
        rgDayKey: rg.rgDayKey,
        dailyDepositLimit: rg.dailyDepositLimit,
        dailyStakeLimit: rg.dailyStakeLimit,
        dailyDepositUsed: rg.dailyDepositUsed + deposit,
        dailyStakeUsed: rg.dailyStakeUsed,
        selfExcludedUntil: rg.selfExcludedUntil,
      };
    });

    if (blocked) {
      showToast(blocked, 'error');
      return false;
    }

    if (email) {
      recordTx(email, {
        type: 'deposit',
        amount: deposit,
        method,
        label: `Deposit via ${method}`,
      });
    }
    showToast(
      `Deposited ${formatInr(amount)} via ${method}. Wager this amount before withdrawal.`,
      'success',
    );
    return true;
  }, [setUser, showToast, recordTx, refreshWallet]);

  const deductStake = useCallback(({ cashAmount = 0, bonusAmount = 0, freebetAmount = 0 } = {}) => {
    const cash = Number(cashAmount) || 0;
    const bonus = Number(bonusAmount) || 0;
    const freebet = Number(freebetAmount) || 0;
    const spendTotal = cash + bonus + freebet;
    const result = {
      success: false,
      pointsEarned: 0,
      wageringApplied: 0,
      winningsSpent: 0,
      error: null,
    };

    setUser(prev => {
      if (!prev) return prev;

      const rgCheck = canStakeAmount(prev, spendTotal);
      if (!rgCheck.ok) {
        result.error = rgCheck.error;
        return prev;
      }

      if (cash > 0 && prev.balance < cash) return prev;
      if (bonus > 0 && (prev.bonusBalance ?? 0) < bonus) return prev;
      if (freebet > 0 && (prev.freebetBalance ?? 0) < freebet) return prev;

      const allocation = allocateCashStake(prev, cash);
      if (cash > 0 && allocation.total < cash) return prev;

      const pointsEarned = pointsFromSpend(spendTotal);
      const currentPoints = getUserLoyaltyPoints(prev);
      const nextPoints = currentPoints + pointsEarned;
      const rg = rgCheck.rg;

      result.success = true;
      result.pointsEarned = pointsEarned;
      result.wageringApplied = allocation.fromLocked;
      result.winningsSpent = allocation.fromWinnings;

      return {
        ...prev,
        balance: prev.balance - cash,
        bonusBalance: (prev.bonusBalance ?? 0) - bonus,
        freebetBalance: (prev.freebetBalance ?? 0) - freebet,
        lockedDepositBalance: (prev.lockedDepositBalance ?? 0) - allocation.fromLocked,
        winningsBalance: Math.max(0, (prev.winningsBalance ?? 0) - allocation.fromWinnings),
        loyaltyPoints: nextPoints,
        coins: nextPoints,
        rgDayKey: rg.rgDayKey,
        dailyDepositLimit: rg.dailyDepositLimit,
        dailyStakeLimit: rg.dailyStakeLimit,
        dailyDepositUsed: rg.dailyDepositUsed,
        dailyStakeUsed: rg.dailyStakeUsed + spendTotal,
        selfExcludedUntil: rg.selfExcludedUntil,
      };
    });

    if (!result.success && result.error) {
      showToast(result.error, 'error');
    } else if (result.success && result.pointsEarned > 0) {
      showToast(`+${result.pointsEarned} loyalty points earned`, 'success');
    }
    return result;
  }, [setUser, showToast]);

  const refundStake = useCallback(({
    cashAmount = 0,
    bonusAmount = 0,
    freebetAmount = 0,
    wageringApplied = 0,
    winningsSpent = 0,
  } = {}) => {
    setUser(prev => {
      if (!prev) return prev;
      const cash = Number(cashAmount) || 0;
      const bonus = Number(bonusAmount) || 0;
      const freebet = Number(freebetAmount) || 0;
      const wagering = Number(wageringApplied) || 0;
      const winnings = Number(winningsSpent) || 0;
      return {
        ...prev,
        balance: prev.balance + cash,
        bonusBalance: (prev.bonusBalance ?? 0) + bonus,
        freebetBalance: (prev.freebetBalance ?? 0) + freebet,
        lockedDepositBalance: (prev.lockedDepositBalance ?? 0) + wagering,
        winningsBalance: (prev.winningsBalance ?? 0) + winnings,
      };
    });
  }, [setUser]);

  /** @deprecated Use deductStake — kept for any legacy callers */
  const deductFunds = useCallback((amount) => {
    return deductStake({ cashAmount: amount }).success;
  }, [deductStake]);

  const redeemLoyaltyPoints = useCallback((requestedPoints) => {
    let redeemedPoints = 0;
    let creditedRupees = 0;
    let error = null;
    let email = null;

    setUser(prev => {
      if (!prev) {
        error = 'Please log in to redeem points.';
        return prev;
      }
      const availablePoints = getUserLoyaltyPoints(prev);
      const targetPoints = requestedPoints ? Number(requestedPoints) || 0 : availablePoints;
      const pointsToRedeem = Math.min(availablePoints, Math.max(LOYALTY_MIN_REDEEM_POINTS, targetPoints));

      if (availablePoints < LOYALTY_MIN_REDEEM_POINTS || pointsToRedeem < LOYALTY_MIN_REDEEM_POINTS) {
        error = `You need at least ${LOYALTY_MIN_REDEEM_POINTS} points to redeem.`;
        return prev;
      }

      redeemedPoints = pointsToRedeem;
      creditedRupees = pointsToRupees(pointsToRedeem);
      email = prev.email;
      const remainingPoints = availablePoints - pointsToRedeem;

      return {
        ...prev,
        balance: prev.balance + creditedRupees,
        winningsBalance: (prev.winningsBalance ?? 0) + creditedRupees,
        loyaltyPoints: remainingPoints,
        coins: remainingPoints,
      };
    });

    if (error) {
      showToast(error, 'info');
      return { ok: false, error };
    }

    if (email) {
      recordTx(email, {
        type: 'loyalty_redeem',
        amount: creditedRupees,
        label: `Loyalty redeem (${redeemedPoints} pts)`,
      });
    }

    showToast(
      'Redeemed ' + redeemedPoints + ' points - ' + formatInr(creditedRupees) + ' credited to cash wallet!',
      'success',
    );
    return { ok: true, points: redeemedPoints, rupees: creditedRupees };
  }, [setUser, showToast, recordTx]);

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
    const { cashCredit, bonusCredit, freebetCredit, winningsCredit } = splitBetWinPayout(bet);
    if (cashCredit <= 0 && bonusCredit <= 0 && freebetCredit <= 0 && winningsCredit <= 0) {
      return { cashCredit: 0, bonusCredit: 0, freebetCredit: 0, winningsCredit: 0 };
    }

    let email = null;
    setUser(prev => {
      if (!prev) return prev;
      email = prev.email;
      return {
        ...prev,
        balance: prev.balance + cashCredit,
        bonusBalance: (prev.bonusBalance ?? 0) + bonusCredit,
        freebetBalance: (prev.freebetBalance ?? 0) + freebetCredit,
        winningsBalance: (prev.winningsBalance ?? 0) + winningsCredit,
      };
    });

    if (email) {
      recordTx(email, {
        type: 'bet_win',
        amount: cashCredit || bonusCredit || freebetCredit,
        winnings: winningsCredit,
        label: winningsCredit > 0
          ? `Bet won · ${formatInr(winningsCredit)} winnings`
          : 'Bet settled',
      });
    }

    return { cashCredit, bonusCredit, freebetCredit, winningsCredit };
  }, [setUser, recordTx]);

  const creditCashout = useCallback((amount, betId) => {
    const amt = Number(amount) || 0;
    if (amt <= 0) return false;
    let email = null;
    setUser(prev => {
      if (!prev) return prev;
      email = prev.email;
      return {
        ...prev,
        balance: prev.balance + amt,
        winningsBalance: (prev.winningsBalance ?? 0) + amt,
      };
    });
    if (email) {
      recordTx(email, {
        type: 'cashout',
        amount: amt,
        label: `Cash out${betId ? ` · ${String(betId).slice(-6)}` : ''}`,
      });
    }
    return true;
  }, [setUser, recordTx]);

  // Step 1: User submits a withdrawal request (Deducts balance, status = PENDING_APPROVAL)
  const withdrawFunds = useCallback((amount, method = 'UPI', details = '') => {
    const amt = Number(amount) || 0;
    let success = false;
    let maxWithdrawable = 0;
    let email = null;

    setUser(prev => {
      if (!prev) return prev;
      maxWithdrawable = getWithdrawableAmount(prev);
      if (amt <= 0 || amt > maxWithdrawable) return prev;
      if (prev.balance < amt) return prev;
      success = true;
      email = prev.email;
      return {
        ...prev,
        balance: prev.balance - amt,
        winningsBalance: Math.max(0, (prev.winningsBalance ?? 0) - amt),
      };
    });

    if (success && email) {
      recordTx(email, {
        type: 'WITHDRAWAL',
        amount: -amt,
        method: method || 'UPI',
        utr: 'PENDING_ADMIN',
        status: 'PENDING_APPROVAL',
        details: details || 'UPI Withdrawal',
        label: `Withdrawal request (${method}) · Pending Admin Approval`,
      });
      showToast(`Withdrawal of ${formatInr(amt)} requested! Awaiting Admin/Finance approval.`, 'info');
    }

    return { success, maxWithdrawable, status: success ? 'PENDING_APPROVAL' : 'FAILED' };
  }, [setUser, recordTx, showToast]);

  // Step 2: Admin approves withdrawal request
  const adminApproveWithdrawal = useCallback((txId, targetEmail, amount) => {
    const defaultUtr = `UTR${Date.now()}`;
    const updatedTx = updateTransactionStatus(txId, 'COMPLETED', defaultUtr);
    const emailToApprove = targetEmail || updatedTx?.userEmail || updatedTx?.email || user?.email || 'demo@betking.com';
    let amt = Math.abs(Number(amount));
    if (isNaN(amt) || amt <= 0) {
      amt = Math.abs(Number(updatedTx?.amount) || 0);
    }
    const utr = updatedTx?.utr || defaultUtr;

    if (emailToApprove) {
      recordTx(emailToApprove, {
        type: 'WITHDRAWAL_APPROVED',
        amount: -amt,
        method: 'Bank/UPI Payout',
        utr: utr,
        status: 'COMPLETED',
        label: `Withdrawal Approved · Transferred via ${utr}`,
      });
    }

    if (user && user.email.toLowerCase() === emailToApprove.toLowerCase()) {
      setTransactions(loadTransactions(user.email));
    }

    showToast(`Withdrawal of ${formatInr(amt)} APPROVED! Dispatched via ${utr}`, 'success');
  }, [user, recordTx, showToast]);

  // Step 3: Admin rejects withdrawal request (Refunds user balance + notifies user)
  const adminRejectWithdrawal = useCallback((txId, targetEmail, amount) => {
    const updatedTx = updateTransactionStatus(txId, 'REJECTED');
    const emailToRefund = (targetEmail || updatedTx?.userEmail || updatedTx?.email || user?.email || 'demo@betking.com').toLowerCase();
    
    let amt = Math.abs(Number(amount));
    if (isNaN(amt) || amt <= 0) {
      amt = Math.abs(Number(updatedTx?.amount) || 0);
    }

    if (amt <= 0) {
      console.warn('adminRejectWithdrawal: unable to determine refund amount', { txId, targetEmail, amount });
      showToast('Withdrawal rejected, but refund amount could not be determined.', 'warning');
      return;
    }

    // 1. Update stored users list
    const users = getStoredUsers();
    const idx = users.findIndex(u => u.email.toLowerCase() === emailToRefund);
    if (idx >= 0) {
      users[idx].balance = (users[idx].balance || 0) + amt;
      users[idx].winningsBalance = (users[idx].winningsBalance || 0) + amt;
      saveStoredUsers(users);
    } else {
      users.push({
        email: emailToRefund,
        displayName: emailToRefund.split('@')[0],
        balance: amt,
        winningsBalance: amt,
      });
      saveStoredUsers(users);
    }

    // 2. Update active session user in localStorage
    try {
      const activeSession = JSON.parse(storageGet(SESSION_KEY) || 'null');
      if (activeSession && activeSession.email.toLowerCase() === emailToRefund) {
        activeSession.balance = (activeSession.balance || 0) + amt;
        activeSession.winningsBalance = (activeSession.winningsBalance || 0) + amt;
        storageSet(SESSION_KEY, JSON.stringify(activeSession));
      }
    } catch (e) {
      console.error('Error updating active session balance:', e);
    }

    // 3. Update active React user state if logged-in user matches
    setUser(prev => {
      if (!prev || prev.email.toLowerCase() !== emailToRefund) return prev;
      return {
        ...prev,
        balance: prev.balance + amt,
        winningsBalance: (prev.winningsBalance ?? 0) + amt,
      };
    });

    // 4. Record refund transaction entry
    if (emailToRefund) {
      recordTx(emailToRefund, {
        type: 'WITHDRAWAL_REFUND',
        amount: amt,
        method: 'REFUND',
        utr: 'REFUNDED',
        status: 'COMPLETED',
        label: `Withdrawal Rejected · ${formatInr(amt)} refunded to wallet`,
      });
    }

    if (user && user.email.toLowerCase() === emailToRefund) {
      setTransactions(loadTransactions(user.email));
    }

    showToast(`Withdrawal of ${formatInr(amt)} REJECTED — ${formatInr(amt)} refunded to wallet!`, 'warning');
  }, [user, setUser, recordTx, showToast]);

  const refundWithdrawal = useCallback((amount) => {
    const amt = Number(amount) || 0;
    if (amt <= 0) return;
    let email = null;
    setUser(prev => {
      if (!prev) return prev;
      email = prev.email;
      return {
        ...prev,
        balance: prev.balance + amt,
        winningsBalance: (prev.winningsBalance ?? 0) + amt,
      };
    });
    if (email) {
      recordTx(email, {
        type: 'withdraw_cancel',
        amount: amt,
        label: 'Withdrawal cancelled · refund',
      });
    }
  }, [setUser, recordTx]);

  const updateUser = useCallback((patch) => {
    setUser(prev => {
      if (!prev) return prev;
      const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch };
      return next;
    });
  }, [setUser]);

  const addBonus = useCallback((amount, label = 'Bonus credit') => {
    const amt = Number(amount) || 0;
    if (amt <= 0) return;
    let email = null;
    setUser(prev => {
      if (!prev) return prev;
      email = prev.email;
      return {
        ...prev,
        bonusBalance: (prev.bonusBalance ?? 0) + amt,
      };
    });
    if (email) {
      recordTx(email, {
        type: 'BONUS_CLAIM',
        amount: amt,
        label,
        status: 'COMPLETED',
      });
    }
  }, [setUser, recordTx]);

  const addFreebet = useCallback((amount, label = 'Freebet voucher') => {
    const amt = Number(amount) || 0;
    if (amt <= 0) return;
    let email = null;
    setUser(prev => {
      if (!prev) return prev;
      email = prev.email;
      return {
        ...prev,
        freebetBalance: (prev.freebetBalance ?? 0) + amt,
      };
    });
    if (email) {
      recordTx(email, {
        type: 'BONUS_CLAIM',
        amount: amt,
        label,
        status: 'COMPLETED',
      });
    }
  }, [setUser, recordTx]);

  const updateRgLimits = useCallback(({ dailyDepositLimit, dailyStakeLimit }) => {
    setUser(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        dailyDepositLimit: Number(dailyDepositLimit) || prev.dailyDepositLimit,
        dailyStakeLimit: Number(dailyStakeLimit) || prev.dailyStakeLimit,
      };
    });
    showToast('Responsible Gaming limits updated successfully', 'success');
  }, [setUser, showToast]);

  const selfExcludeAccount = useCallback((days = 7) => {
    const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    setUser(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        selfExcludedUntil: until,
      };
    });
    showToast(`Account self-excluded for ${days} days.`, 'info');
  }, [setUser, showToast]);

  const openLoginModal = useCallback(() => setIsLoginModalOpen(true), []);

  const closeLoginModal = useCallback(() => setIsLoginModalOpen(false), []);
  const openDepositModal = useCallback(() => setIsDepositModalOpen(true), []);
  const closeDepositModal = useCallback(() => setIsDepositModalOpen(false), []);
  const toggleSidebar = useCallback(() => setIsSidebarOpen(prev => !prev), []);
  const closeSidebar = useCallback(() => setIsSidebarOpen(false), []);
  const openFinModal = useCallback((type) => setFinModalType(type), []);
  const closeFinModal = useCallback(() => setFinModalType(null), []);

  const value = useMemo(() => ({
    user,
    isLoggedIn: !!user,
    register,
    claimPromotion,
    isPromotionClaimed,
    login,
    forgotPassword,
    resetPassword,
    verifyEmail,
    changePassword,
    logout,
    addFunds,
    refreshWallet,
    deductFunds,
    deductStake,
    refundStake,
    redeemLoyaltyPoints,
    updateUserBalance,
    creditBetWin,
    creditCashout,
    withdrawFunds,
    refundWithdrawal,
    updateUser,
    addBonus,
    addFreebet,
    transactions,
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
    finModalType,
    openFinModal,
    closeFinModal,
    updateRgLimits,
    selfExcludeAccount,
  }), [
    user,
    register,
    claimPromotion,
    isPromotionClaimed,
    login,
    forgotPassword,
    resetPassword,
    verifyEmail,
    changePassword,
    logout,
    addFunds,
    refreshWallet,
    deductFunds,
    deductStake,
    refundStake,
    redeemLoyaltyPoints,
    updateUserBalance,
    creditBetWin,
    creditCashout,
    withdrawFunds,
    adminApproveWithdrawal,
    adminRejectWithdrawal,
    refundWithdrawal,
    updateUser,
    addBonus,
    addFreebet,
    transactions,
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
    finModalType,
    openFinModal,
    closeFinModal,
    updateRgLimits,
    selfExcludeAccount,
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

const dummyAuthFallback = {
  user: null,
  isLoggedIn: false,
  login: () => false,
  resetPassword: () => ({ ok: false, error: 'Not available.' }),
  changePassword: () => ({ ok: false, error: 'Not available.' }),
  showToast: () => {},
  dismissToast: () => {},
  openLoginModal: () => {},
  closeLoginModal: () => {},
  openDepositModal: () => {},
  closeDepositModal: () => {},
  addFunds: () => {},
  deductFunds: () => {},
  deductStake: () => {},
  refundStake: () => {},
  redeemLoyaltyPoints: () => {},
  updateUser: () => {},
  addBonus: () => {},
  addFreebet: () => {},
  transactions: [],
  finModalType: null,
};

export function useAuth() {
  const context = useContext(AuthContext);
  return context || dummyAuthFallback;
}
