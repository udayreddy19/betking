import React, { createContext, useContext, useState } from 'react';

const QuickBetContext = createContext(null);

export const QUICK_BET_PRESETS = [100, 200, 500, 1000, 2000];

export function QuickBetProvider({ children }) {
  const [isQuickBetEnabled, setIsQuickBetEnabled] = useState(false);
  const [quickBetStake, setQuickBetStake] = useState(500);

  const toggleQuickBet = () => setIsQuickBetEnabled((prev) => !prev);

  const value = {
    isQuickBetEnabled,
    setIsQuickBetEnabled,
    toggleQuickBet,
    quickBetStake,
    setQuickBetStake,
    presets: QUICK_BET_PRESETS,
  };

  return (
    <QuickBetContext.Provider value={value}>
      {children}
    </QuickBetContext.Provider>
  );
}

export function useQuickBet() {
  const context = useContext(QuickBetContext);
  if (!context) {
    return {
      isQuickBetEnabled: false,
      quickBetStake: 500,
      toggleQuickBet: () => {},
      setQuickBetStake: () => {},
      presets: QUICK_BET_PRESETS,
    };
  }
  return context;
}
