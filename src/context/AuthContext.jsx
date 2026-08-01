import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { STARTING_BALANCE } from '../data/mockData';

const AuthContext = createContext(null);

const USERS_KEY = 'betking_users';
const SESSION_KEY = 'betking_session';

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
    balance: stored.balance,
    loyaltyLevel: stored.loyaltyLevel ?? 1,
    loyaltyRank: stored.loyaltyRank ?? 'Rookie',
    xpToNext: stored.xpToNext ?? 1000,
    notifications: stored.notifications ?? 0,
    coins: stored.coins ?? 0,
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
    balance: sessionUser.balance,
    loyaltyLevel: sessionUser.loyaltyLevel,
    loyaltyRank: sessionUser.loyaltyRank,
    xpToNext: sessionUser.xpToNext,
    notifications: sessionUser.notifications,
    coins: sessionUser.coins ?? users[idx].coins ?? 0,
  };
  saveStoredUsers(users);
}

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(null);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const setUser = useCallback((next) => {
    setUserState(prev => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      persistSession(resolved);
      if (resolved) syncStoredUser(resolved);
      return resolved;
    });
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      if (saved) setUserState(JSON.parse(saved));
    } catch {
      localStorage.removeItem(SESSION_KEY);
    }
  }, []);

  const showToast = useCallback((msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  }, []);

  const register = useCallback(({ email, password, displayName }) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password || !displayName?.trim()) {
      return { ok: false, error: 'Please fill in all required fields.' };
    }

    const users = getStoredUsers();
    if (users.some(u => u.email === normalizedEmail)) {
      return { ok: false, error: 'An account with this email already exists.' };
    }

    const stored = {
      email: normalizedEmail,
      password,
      displayName: displayName.trim(),
      balance: STARTING_BALANCE,
      loyaltyLevel: 1,
      loyaltyRank: 'Rookie',
      xpToNext: 1000,
      notifications: 0,
      coins: 50,
    };

    saveStoredUsers([...users, stored]);
    return { ok: true };
  }, []);

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
    showToast('You have been logged out.');
  }, [setUser, showToast]);

  const addFunds = useCallback((amount, method = 'Deposit') => {
    setUser(prev => {
      if (!prev) return prev;
      return { ...prev, balance: prev.balance + amount };
    });
    showToast(`Successfully deposited ₹${amount.toLocaleString('en-IN')} via ${method}!`);
  }, [setUser, showToast]);

  const deductFunds = useCallback((amount) => {
    let success = false;
    setUser(prev => {
      if (!prev || prev.balance < amount) return prev;
      success = true;
      return { ...prev, balance: prev.balance - amount };
    });
    return success;
  }, [setUser]);

  const openLoginModal = useCallback(() => setIsLoginModalOpen(true), []);
  const closeLoginModal = useCallback(() => setIsLoginModalOpen(false), []);
  const openDepositModal = useCallback(() => setIsDepositModalOpen(true), []);
  const closeDepositModal = useCallback(() => setIsDepositModalOpen(false), []);
  const toggleSidebar = useCallback(() => setIsSidebarOpen(prev => !prev), []);
  const closeSidebar = useCallback(() => setIsSidebarOpen(false), []);

  return (
    <AuthContext.Provider value={{
      user,
      isLoggedIn: !!user,
      register,
      login,
      logout,
      addFunds,
      deductFunds,
      toastMessage,
      showToast,
      isLoginModalOpen,
      openLoginModal,
      closeLoginModal,
      isDepositModalOpen,
      openDepositModal,
      closeDepositModal,
      isSidebarOpen,
      toggleSidebar,
      closeSidebar,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
