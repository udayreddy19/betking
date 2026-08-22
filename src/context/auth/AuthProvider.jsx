import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { STARTING_BALANCE, WELCOME_BONUS } from '../../data/mockData';
import { formatInr } from '../../utils/walletBalance';
import { cleanKycMessage, isKycError, KYC_PROFILE_PATH } from '../../utils/kycUi';
import {
  getWithdrawableAmount,
  splitBetWinPayout,
  allocateCashStake,
} from '../../utils/wageringRules';
import { appendTransaction, loadTransactions } from '../../utils/transactions';
import {
  pointsFromSpend,
  pointsToRupees,
  LOYALTY_MIN_REDEEM_POINTS,
  canRedeemLoyaltyPoints,
  getUserLoyaltyPoints,
} from '../../utils/loyaltyPoints';
import {
  canDepositAmount,
  canStakeAmount,
} from '../../utils/responsibleGaming';
import { storageGet, storageRemove } from '../../utils/browserCompat';
import {
  apiFetch,
  fetchMe,
  mapServerUserToSession,
  setAccessToken,
  clearAccessToken,
  refreshAccessToken,
} from '../../utils/apiClient';
import { DEMO_MODE } from '../../utils/featureFlags';
import { subscribeLiveChannel } from '../../services/liveFeedSocket';
import {
  isFinancialEventForUser,
  isFinancialWsEventType,
  shouldApplyFinancialWsEvent,
} from '../../utils/wsFinancialEvents';
import { AuthContext } from './authContext';
import {
  fetchAuthProviders,
  getInitialAuthProviders,
} from '../../utils/authProviders';
import {
  SESSION_KEY,
  ensureSeedUser,
  getStoredUsers,
  saveStoredUsers,
  toSessionUser,
  persistSession,
  syncStoredUser,
  getClaimedPromos,
  saveClaimedPromo,
} from './localSessionStore';

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(null);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [finModalType, setFinModalType] = useState(null);
  const [toast, setToast] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [authProviders, setAuthProviders] = useState(getInitialAuthProviders);
  const toastTimerRef = useRef(null);

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(null);
  }, []);

  const showToast = useCallback((msg, variant = 'success', options = null) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    const action = options?.action || null;
    setToast({ message: msg, variant, action });
    toastTimerRef.current = setTimeout(() => setToast(null), action ? 8000 : 4500);
  }, []);

  useEffect(() => {
    if (DEMO_MODE) return undefined;

    let cancelled = false;
    const controller = new AbortController();

    const loadProviders = async (attempt = 0) => {
      try {
        const data = await fetchAuthProviders({ signal: controller.signal });
        if (!cancelled) setAuthProviders(data);
      } catch (err) {
        if (cancelled || err?.name === 'AbortError') return;
        if (attempt < 4) {
          window.setTimeout(() => loadProviders(attempt + 1), 350 * (attempt + 1));
        }
      }
    };

    loadProviders();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const setUser = useCallback((next) => {
    setUserState(prev => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      persistSession(resolved);
      if (resolved) syncStoredUser(resolved);
      return resolved;
    });
  }, []);

  const syncTransactions = useCallback(async (email) => {
    if (DEMO_MODE) {
      setTransactions(loadTransactions(email));
      return;
    }
    try {
      const res = await apiFetch('/api/v1/user/transactions');
      if (!res.ok) {
        setTransactions([]);
        return;
      }
      const data = await res.json();
      setTransactions(Array.isArray(data?.transactions) ? data.transactions : []);
    } catch {
      setTransactions([]);
    }
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
          await syncTransactions(session.email);
          return;
        }
        clearAccessToken();
      }

      if (!DEMO_MODE) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          const me = await fetchMe();
          if (me) {
            const session = mapServerUserToSession(me);
            setUserState(session);
            await syncTransactions(session.email);
            return;
          }
        }
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
  }, [syncTransactions]);

  const recordTx = useCallback((email, entry) => {
    if (!email) return;
    setTransactions(appendTransaction(email, entry));
  }, []);

  const refreshWallet = useCallback(async () => {
    const me = await fetchMe();
    if (!me) return false;
    const session = mapServerUserToSession(me);
    if (!session) return false;
    setUser((prev) => mapServerUserToSession(me, prev) || prev);
    await syncTransactions(session.email);
    return true;
  }, [setUser, syncTransactions]);

  // Authoritative wallet refresh on financial WebSocket events (server is source of truth).
  useEffect(() => {
    if (DEMO_MODE || !user?.userId) return undefined;
    const channel = `user:${user.userId}`;
    const seenEvents = new Set();
    const lastTsRef = { current: 0 };
    return subscribeLiveChannel(channel, (msg) => {
      const t = msg?.eventType;
      if (t === 'WS_RECONNECTED') {
        void refreshWallet();
        return;
      }
      if (!isFinancialWsEventType(t)) return;
      if (!isFinancialEventForUser(msg, user.userId)) return;
      const decision = shouldApplyFinancialWsEvent(msg, seenEvents, lastTsRef);
      if (!decision.apply) return;
      void refreshWallet();
    });
  }, [user?.userId, refreshWallet]);

  const register = useCallback(async ({ email, password, displayName, phone, promoCode }) => {
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
          promoCode: promoCode?.trim() || undefined,
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
        loyaltyRank: 'BRONZE',
        loyaltyTier: 'BRONZE',
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
      return { ok: true, welcomeCredit: 0, promoReward: data.promoReward || null };
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
        loyaltyRank: 'BRONZE',
        loyaltyTier: 'BRONZE',
        xpToNext: 1000,
        notifications: 0,
        loyaltyPoints: 50,
        coins: 50,
        welcomeBonusApplied: true,
      };

      saveStoredUsers([...users, stored]);
      const sessionUser = toSessionUser(stored);
      persistSession(sessionUser);
      setUser(sessionUser);
      return { ok: true, welcomeCredit };
    }
  }, []);

  const claimPromotion = useCallback(async (promo) => {
    if (!user) {
      return { ok: false, error: 'Please log in to claim this promotion.' };
    }

    if (DEMO_MODE) {
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
      showToast(`₹${amount.toLocaleString('en-IN')} bonus credited! Bet at 1.75+ odds and rotate 5× before withdrawing winnings.`, 'success');
      return { ok: true, amount };
    }

    const code = promo.code || promo.promoCode;
    if (!code) {
      showToast('Promotion code missing.', 'error');
      return { ok: false, error: 'Promotion code missing.' };
    }

    try {
      if (promo.claimType === 'signup_code') {
        const res = await apiFetch('/api/v1/rewards/promo/claim', {
          method: 'POST',
          body: JSON.stringify({ code }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          showToast(data.error || 'Could not claim promo code.', 'error');
          return { ok: false, error: data.error || 'Could not claim promo code.' };
        }
        await refreshWallet();
        const kind = data.rewardType === 'freebet' ? 'free bet' : data.rewardType === 'cash' ? 'cash' : 'bonus';
        showToast(
          `Promo ${data.code} applied — ${formatInr(data.amount)} ${kind} credited.`,
          'success',
        );
        return { ok: true, amount: data.amount, code: data.code };
      }

      const res = await apiFetch('/api/v1/promotions/claim', {
        method: 'POST',
        body: JSON.stringify({ promoCode: code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        showToast(data.error || 'Could not claim promotion.', 'error');
        return { ok: false, error: data.error || 'Could not claim promotion.' };
      }
      if (data.alreadyClaimed) {
        showToast('You have already claimed this promotion.', 'info');
        return { ok: true, alreadyClaimed: true, code };
      }
      await refreshWallet();
      showToast(
        `${formatInr(data.rewardAmount || 0)} bonus credited! Wagering required: ${formatInr(data.wageringRequired || 0)}.`,
        'success',
      );
      return { ok: true, amount: data.rewardAmount, code };
    } catch (err) {
      showToast('Could not claim promotion.', 'error');
      return { ok: false, error: err.message };
    }
  }, [user, setUser, showToast, recordTx, refreshWallet]);

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
        await syncTransactions(sessionUser.email);
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

  const completeGoogleAuth = useCallback(async (userPayload) => {
    const sessionUser = userPayload?.email
      ? toSessionUser({
        userId: userPayload.userId,
        email: userPayload.email,
        displayName: userPayload.displayName || userPayload.email.split('@')[0],
        phone: userPayload.phone || '',
        balance: 0,
        winningsBalance: 0,
      })
      : null;

    if (sessionUser) {
      setUser(sessionUser);
      setIsLoginModalOpen(false);
    }

    try {
      const me = await fetchMe();
      if (me) {
        setUser(mapServerUserToSession(me));
      }
    } catch {
      // Session already set from OAuth payload above.
    }

    void syncTransactions(userPayload?.email || sessionUser?.email);
    return true;
  }, [setUser, syncTransactions]);

  const completeAccountProfile = useCallback(async ({ phone, promoCode } = {}) => {
    const normalizedPhone = String(phone || '').replace(/\D/g, '');
    if (normalizedPhone.length !== 10) {
      return { ok: false, error: 'Enter a valid 10-digit Indian mobile number.' };
    }
    try {
      const res = await apiFetch('/api/auth/complete-profile', {
        method: 'POST',
        body: JSON.stringify({
          phone: normalizedPhone,
          promoCode: String(promoCode || '').trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        return { ok: false, error: data.error || 'Could not save your details.' };
      }
      if (data.user) {
        setUser((prev) => mapServerUserToSession(data.user, prev));
      } else {
        const me = await fetchMe();
        if (me) setUser(mapServerUserToSession(me));
      }
      return { ok: true, promoReward: data.promoReward || null, user: data.user };
    } catch {
      return { ok: false, error: 'Unable to reach auth service.' };
    }
  }, [setUser]);

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
      if (DEMO_MODE) {
        const users = getStoredUsers();
        const idx = users.findIndex((u) => u.email === trimmedToken.toLowerCase());
        if (idx >= 0) {
          users[idx] = { ...users[idx], password: String(newPassword) };
          saveStoredUsers(users);
          return { ok: true };
        }
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

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore network error on logout
    }
    clearAccessToken();
    try {
      localStorage.removeItem('adminToken');
      localStorage.removeItem('adminRole');
    } catch {
      // ignore
    }
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

      const pointsEarned = DEMO_MODE ? pointsFromSpend(spendTotal, prev) : 0;
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
      };
    });
  }, [setUser]);

  /** @deprecated Use deductStake — kept for any legacy callers */
  const deductFunds = useCallback((amount) => {
    return deductStake({ cashAmount: amount }).success;
  }, [deductStake]);

  const redeemLoyaltyPoints = useCallback(async (requestedPoints) => {
    if (!DEMO_MODE) {
      try {
        const res = await apiFetch('/api/v1/rewards/loyalty/redeem', {
          method: 'POST',
          body: JSON.stringify({
            points: requestedPoints == null || requestedPoints === '' ? undefined : Number(requestedPoints),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          showToast(data.error || 'Could not redeem points.', 'error');
          return { ok: false, error: data.error || 'Could not redeem points.' };
        }

        setUser((prev) => {
          if (!prev) return prev;
          const nextPoints = Number(data.remainingPoints ?? data.wallet?.loyaltyPoints ?? 0);
          const nextBalance = Number(data.wallet?.balance ?? prev.balance);
          const credited = Number(data.rupeesCredited || 0);
          return {
            ...prev,
            balance: nextBalance,
            reservedBalance: prev.reservedBalance ?? 0,
            loyaltyPoints: nextPoints,
            coins: nextPoints,
            bonusBalance: Number(data.wallet?.bonusBalance ?? prev.bonusBalance ?? 0),
            freebetBalance: Number(data.wallet?.freebetBalance ?? prev.freebetBalance ?? 0),
          };
        });

        showToast(
          'Redeemed ' + data.pointsRedeemed + ' points - ' + formatInr(data.rupeesCredited) + ' credited to cash wallet!',
          'success',
        );
        await refreshWallet();
        return { ok: true, points: data.pointsRedeemed, rupees: data.rupeesCredited };
      } catch {
        showToast('Unable to reach rewards service.', 'error');
        return { ok: false, error: 'Unable to reach rewards service.' };
      }
    }

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
  }, [setUser, showToast, recordTx, refreshWallet]);

  const claimSignupPromoCode = useCallback(async (rawCode) => {
    const code = String(rawCode || '').trim();
    if (!code) {
      showToast('Enter a promo code.', 'info');
      return { ok: false, error: 'Enter a promo code.' };
    }
    if (DEMO_MODE) {
      showToast('Promo codes can be claimed on a live account.', 'info');
      return { ok: false, error: 'Promo codes can be claimed on a live account.' };
    }
    try {
      const res = await apiFetch('/api/v1/rewards/promo/claim', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        showToast(data.error || 'Could not claim promo code.', 'error');
        return { ok: false, error: data.error || 'Could not claim promo code.' };
      }
      setUser((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          balance: Number(data.wallet?.balance ?? prev.balance),
          bonusBalance: Number(data.wallet?.bonusBalance ?? prev.bonusBalance ?? 0),
          freebetBalance: Number(data.wallet?.freebetBalance ?? prev.freebetBalance ?? 0),
        };
      });
      const kind = data.rewardType === 'cash'
        ? 'cash'
        : data.rewardType === 'freebet'
          ? 'free bet'
          : 'bonus';
      showToast(
        `Promo ${data.code} applied — ${formatInr(data.amount)} ${kind} credited.`,
        'success',
      );
      await refreshWallet();
      return { ok: true, ...data };
    } catch {
      showToast('Unable to reach rewards service.', 'error');
      return { ok: false, error: 'Unable to reach rewards service.' };
    }
  }, [setUser, showToast, refreshWallet]);

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

  const creditCashout = useCallback((amount, betId, stake = 0) => {
    const amt = Number(amount) || 0;
    const st = Number(stake) || 0;
    if (amt <= 0) return false;
    const profit = parseFloat((amt - st).toFixed(2));
    let email = null;
    setUser(prev => {
      if (!prev) return prev;
      email = prev.email;
      return {
        ...prev,
        balance: prev.balance + amt,
        winningsBalance: (prev.winningsBalance ?? 0) + profit,
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
  const withdrawFunds = useCallback(async (amount, method = 'UPI', details = '') => {
    const amt = Number(amount) || 0;
    if (amt <= 0) {
      return { success: false, maxWithdrawable: 0, status: 'FAILED' };
    }

    if (!DEMO_MODE) {
      try {
        const res = await apiFetch('/api/v1/withdrawals/request', {
          method: 'POST',
          body: JSON.stringify({
            amount: amt,
            bankDetails: { method: method || 'UPI', details: details || '' },
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.success === false) {
          const message = data.error || 'Withdrawal failed.';
          if (isKycError(message)) {
            showToast(cleanKycMessage(message) || 'Verify your identity to withdraw.', 'error', {
              action: { label: 'Proceed to KYC', path: KYC_PROFILE_PATH },
            });
          } else {
            showToast(message, 'error');
          }
          return { success: false, maxWithdrawable: 0, status: 'FAILED', error: message };
        }
        await refreshWallet();
        const forfeited = Number(data.forfeitedBonus || 0);
        showToast(
          forfeited > 0
            ? `Withdrawal of ${formatInr(amt)} requested. Remaining bonus ${formatInr(forfeited)} was forfeited.`
            : `Withdrawal of ${formatInr(amt)} requested. Awaiting finance approval.`,
          forfeited > 0 ? 'warning' : 'info',
        );
        return {
          success: true,
          maxWithdrawable: Number(data.availableBalance || 0),
          status: data.status || 'PENDING_REVIEW',
          withdrawalId: data.withdrawalId,
          forfeitedBonus: forfeited,
        };
      } catch {
        showToast('Unable to reach withdrawals service.', 'error');
        return { success: false, maxWithdrawable: 0, status: 'FAILED' };
      }
    }

    let success = false;
    let maxWithdrawable = 0;
    let email = null;
    let forfeitedBonus = 0;

    setUser(prev => {
      if (!prev) return prev;
      maxWithdrawable = getWithdrawableAmount(prev);
      if (amt <= 0 || amt > maxWithdrawable) return prev;
      if (prev.balance < amt) return prev;
      success = true;
      email = prev.email;
      forfeitedBonus = Number(prev.bonusBalance || 0);
      return {
        ...prev,
        balance: prev.balance - amt,
        bonusBalance: 0,
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
      if (forfeitedBonus > 0) {
        recordTx(email, {
          type: 'bonus',
          amount: -forfeitedBonus,
          label: `Bonus forfeited on withdrawal · ${formatInr(forfeitedBonus)}`,
        });
        showToast(
          `Withdrawal of ${formatInr(amt)} requested. Remaining bonus ${formatInr(forfeitedBonus)} was forfeited.`,
          'warning',
        );
      } else {
        showToast(`Withdrawal of ${formatInr(amt)} requested! Awaiting Admin/Finance approval.`, 'info');
      }
    }

    return { success, maxWithdrawable, status: success ? 'PENDING_APPROVAL' : 'FAILED', forfeitedBonus };
  }, [setUser, recordTx, showToast, refreshWallet]);

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
        reservedBalance: Math.max(0, (prev.reservedBalance ?? 0) - amt),
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

  const updateRgLimits = useCallback(async ({
    dailyDepositLimit,
    dailyStakeLimit,
    lossLimitDaily,
    lossLimitWeekly,
    realityCheckIntervalMins,
  }) => {
    if (!DEMO_MODE) {
      const res = await apiFetch('/api/v1/rg/limits', {
        method: 'POST',
        body: JSON.stringify({
          depositLimitDaily: dailyDepositLimit,
          stakeLimitPerBet: dailyStakeLimit,
          lossLimitDaily,
          lossLimitWeekly,
          realityCheckIntervalMins,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || 'Could not save responsible gaming limits.', 'error');
        return;
      }
    }
    setUser(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        dailyDepositLimit: Number(dailyDepositLimit) || prev.dailyDepositLimit,
        dailyStakeLimit: Number(dailyStakeLimit) || prev.dailyStakeLimit,
        lossLimitDaily: Number(lossLimitDaily) || prev.lossLimitDaily,
        lossLimitWeekly: Number(lossLimitWeekly) || prev.lossLimitWeekly,
        realityCheckIntervalMins: Number(realityCheckIntervalMins) || prev.realityCheckIntervalMins,
      };
    });
    showToast('Responsible Gaming limits updated successfully', 'success');
  }, [setUser, showToast]);

  const selfExcludeAccount = useCallback(async (days = 7) => {
    if (!DEMO_MODE) {
      const res = await apiFetch('/api/v1/rg/self-exclude', {
        method: 'POST',
        body: JSON.stringify({ days: Number(days) || 7 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || 'Could not self-exclude this account.', 'error');
        return;
      }
      setUser((prev) => {
        if (!prev) return prev;
        return { ...prev, selfExcludedUntil: data.selfExcludedUntil };
      });
      showToast(`Account self-excluded for ${Number(days) || 7} days.`, 'info');
      return;
    }
    const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    setUser((prev) => {
      if (!prev) return prev;
      return { ...prev, selfExcludedUntil: until };
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
    completeGoogleAuth,
    completeAccountProfile,
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
    claimSignupPromoCode,
    updateUserBalance,
    creditBetWin,
    creditCashout,
    withdrawFunds,
    refundWithdrawal,
    updateUser,
    addBonus,
    addFreebet,
    transactions,
    authProviders,
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
    completeGoogleAuth,
    completeAccountProfile,
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
    claimSignupPromoCode,
    updateUserBalance,
    creditBetWin,
    creditCashout,
    withdrawFunds,
    refundWithdrawal,
    updateUser,
    addBonus,
    addFreebet,
    transactions,
    authProviders,
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

