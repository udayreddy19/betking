import { createContext, useContext } from 'react';

export const AuthContext = createContext(null);

const dummyAuthFallback = {
  user: null,
  isLoggedIn: false,
  login: () => false,
  resetPassword: () => ({ ok: false, error: 'Not available.' }),
  changePassword: () => ({ ok: false, error: 'Not available.' }),
  showToast: () => { },
  dismissToast: () => { },
  openLoginModal: () => { },
  closeLoginModal: () => { },
  openDepositModal: () => { },
  closeDepositModal: () => { },
  addFunds: () => { },
  deductFunds: () => { },
  deductStake: () => { },
  refundStake: () => { },
  redeemLoyaltyPoints: () => { },
  claimSignupPromoCode: () => { },
  updateUser: () => { },
  addBonus: () => { },
  addFreebet: () => { },
  transactions: [],
  finModalType: null,
};

export function useAuth() {
  const context = useContext(AuthContext);
  return context || dummyAuthFallback;
}
