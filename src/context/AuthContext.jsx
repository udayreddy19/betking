import { createContext, useContext, useState, useCallback } from 'react';

const AuthContext = createContext(null);

const DEMO_USER = {
  username: 'udayreddy12',
  password: 'Udayreddy123@',
  displayName: 'Uday Reddy',
  balance: 1000,
  loyaltyLevel: 15,
  loyaltyRank: 'Wicket Keeper',
  xpToNext: 5630,
  notifications: 1,
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(DEMO_USER); // Default demo user logged in for immediate convenience
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = useCallback((msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  }, []);

  const login = useCallback((username, password) => {
    if (username === DEMO_USER.username && password === DEMO_USER.password) {
      setUser({
        username: DEMO_USER.username,
        displayName: DEMO_USER.displayName,
        balance: DEMO_USER.balance,
        loyaltyLevel: DEMO_USER.loyaltyLevel,
        loyaltyRank: DEMO_USER.loyaltyRank,
        xpToNext: DEMO_USER.xpToNext,
        notifications: DEMO_USER.notifications,
      });
      setIsLoginModalOpen(false);
      showToast(`Welcome back, ${DEMO_USER.displayName}!`);
      return true;
    }
    return false;
  }, [showToast]);

  const logout = useCallback(() => {
    setUser(null);
    setIsSidebarOpen(false);
    showToast('You have been logged out.');
  }, [showToast]);

  const addFunds = useCallback((amount, method = 'Deposit') => {
    setUser(prev => {
      if (!prev) return prev;
      const newBal = prev.balance + amount;
      return { ...prev, balance: newBal };
    });
    showToast(`Successfully deposited ₹${amount.toLocaleString()} via ${method}!`);
  }, [showToast]);

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
      login,
      logout,
      addFunds,
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
