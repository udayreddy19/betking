import { useAuth } from './authContext';

/** Session: identity and login chrome. */
export function useSession() {
  const a = useAuth();
  return {
    user: a.user,
    isLoggedIn: a.isLoggedIn,
    register: a.register,
    login: a.login,
    logout: a.logout,
    forgotPassword: a.forgotPassword,
    resetPassword: a.resetPassword,
    verifyEmail: a.verifyEmail,
    changePassword: a.changePassword,
    updateUser: a.updateUser,
    isLoginModalOpen: a.isLoginModalOpen,
    openLoginModal: a.openLoginModal,
    closeLoginModal: a.closeLoginModal,
    isSidebarOpen: a.isSidebarOpen,
    toggleSidebar: a.toggleSidebar,
    closeSidebar: a.closeSidebar,
    toast: a.toast,
    showToast: a.showToast,
    dismissToast: a.dismissToast,
  };
}

/** Wallet: balances, deposits, stakes, withdrawals. */
export function useWallet() {
  const a = useAuth();
  return {
    user: a.user,
    isLoggedIn: a.isLoggedIn,
    transactions: a.transactions,
    refreshWallet: a.refreshWallet,
    addFunds: a.addFunds,
    deductFunds: a.deductFunds,
    deductStake: a.deductStake,
    refundStake: a.refundStake,
    updateUserBalance: a.updateUserBalance,
    creditBetWin: a.creditBetWin,
    creditCashout: a.creditCashout,
    withdrawFunds: a.withdrawFunds,
    refundWithdrawal: a.refundWithdrawal,
    addBonus: a.addBonus,
    addFreebet: a.addFreebet,
    isDepositModalOpen: a.isDepositModalOpen,
    openDepositModal: a.openDepositModal,
    closeDepositModal: a.closeDepositModal,
    finModalType: a.finModalType,
    openFinModal: a.openFinModal,
    closeFinModal: a.closeFinModal,
    showToast: a.showToast,
  };
}

/** Loyalty / VIP points and promo claims. */
export function useLoyalty() {
  const a = useAuth();
  return {
    user: a.user,
    isLoggedIn: a.isLoggedIn,
    redeemLoyaltyPoints: a.redeemLoyaltyPoints,
    claimSignupPromoCode: a.claimSignupPromoCode,
    claimPromotion: a.claimPromotion,
    isPromotionClaimed: a.isPromotionClaimed,
    showToast: a.showToast,
  };
}

/** Responsible-gaming limits and self-exclusion. */
export function useResponsibleGaming() {
  const a = useAuth();
  return {
    user: a.user,
    updateRgLimits: a.updateRgLimits,
    selfExcludeAccount: a.selfExcludeAccount,
    showToast: a.showToast,
  };
}
