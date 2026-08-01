import { createContext, useContext, useState, useCallback } from 'react';

const BetSlipContext = createContext(null);

export function BetSlipProvider({ children }) {
  const [bets, setBets] = useState([]);
  const [activeTab, setActiveTab] = useState('betslip'); // 'betslip' | 'mybets'
  const [stake, setStake] = useState('');

  const addBet = useCallback((match, selection, odds) => {
    setBets(prev => {
      // Remove if already selected same match+selection
      const existing = prev.find(b => b.matchId === match.id && b.selection === selection);
      if (existing) {
        return prev.filter(b => b.id !== existing.id);
      }
      // Remove previous bet on same match (different selection)
      const filtered = prev.filter(b => b.matchId !== match.id);
      return [...filtered, {
        id: `${match.id}-${selection}`,
        matchId: match.id,
        matchName: `${match.team1.name} vs ${match.team2.name}`,
        league: match.league,
        sport: match.sport,
        selection,
        selectionName: selection === '1' ? match.team1.name : selection === '2' ? match.team2.name : 'Draw',
        odds,
        timestamp: Date.now(),
      }];
    });
  }, []);

  const removeBet = useCallback((betId) => {
    setBets(prev => prev.filter(b => b.id !== betId));
  }, []);

  const clearAll = useCallback(() => {
    setBets([]);
    setStake('');
  }, []);

  const isBetSelected = useCallback((matchId, selection) => {
    return bets.some(b => b.matchId === matchId && b.selection === selection);
  }, [bets]);

  const totalOdds = bets.reduce((acc, bet) => acc * bet.odds, 1);
  const potentialReturn = stake ? (parseFloat(stake) * totalOdds).toFixed(2) : '0.00';

  return (
    <BetSlipContext.Provider value={{
      bets,
      addBet,
      removeBet,
      clearAll,
      isBetSelected,
      activeTab,
      setActiveTab,
      stake,
      setStake,
      totalOdds: totalOdds.toFixed(2),
      potentialReturn,
      betCount: bets.length,
    }}>
      {children}
    </BetSlipContext.Provider>
  );
}

export function useBetSlip() {
  const context = useContext(BetSlipContext);
  if (!context) throw new Error('useBetSlip must be used within BetSlipProvider');
  return context;
}
