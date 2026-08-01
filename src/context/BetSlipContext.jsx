import { createContext, useContext, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';

const BetSlipContext = createContext(null);

function getSelectionName(match, selection, customName) {
  if (customName) return customName;
  if (selection === '1') return match.team1.name;
  if (selection === '2') return match.team2.name;
  if (selection === 'X') return 'Draw';
  if (selection === 'over') return 'Over 0.5';
  if (selection === 'under') return 'Under 0.5';
  return String(selection);
}

export function BetSlipProvider({ children }) {
  const { showToast } = useAuth();
  const [bets, setBets] = useState([]);
  const [placedBets, setPlacedBets] = useState([]);
  const [activeTab, setActiveTab] = useState('betslip');
  const [stake, setStake] = useState('');
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const addBet = useCallback((match, selection, odds, selectionName) => {
    let added = true;
    setBets(prev => {
      const existing = prev.find(b => b.matchId === match.id && b.selection === selection);
      if (existing) {
        added = false;
        showToast('Removed from betslip');
        return prev.filter(b => b.id !== existing.id);
      }

      const isMainMarket = ['1', '2', 'X'].includes(selection);
      const filtered = isMainMarket
        ? prev.filter(b => !(b.matchId === match.id && ['1', '2', 'X'].includes(b.selection)))
        : prev;

      const label = getSelectionName(match, selection, selectionName);
      showToast(`Added to betslip: ${label} @ ${Number(odds).toFixed(2)}`);
      setIsMobileOpen(true);

      return [...filtered, {
        id: `${match.id}-${selection}`,
        matchId: match.id,
        matchName: `${match.team1.name} vs ${match.team2.name}`,
        league: match.league,
        sport: match.sport,
        selection,
        selectionName: label,
        odds: Number(odds),
        timestamp: Date.now(),
      }];
    });
    return added;
  }, [showToast]);

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

  const placeBets = useCallback((stakeAmount) => {
    if (bets.length === 0 || !stakeAmount || stakeAmount <= 0) {
      return { success: false, error: 'Invalid stake or empty betslip' };
    }

    const totalOdds = bets.reduce((acc, bet) => acc * bet.odds, 1);
    const potentialReturn = stakeAmount * totalOdds;

    const placed = {
      id: `placed-${Date.now()}`,
      legs: [...bets],
      stake: stakeAmount,
      totalOdds,
      potentialReturn,
      status: 'pending',
      placedAt: new Date().toISOString(),
    };

    setPlacedBets(prev => [placed, ...prev]);
    setBets([]);
    setStake('');
    setActiveTab('mybets');
    setIsMobileOpen(true);

    return { success: true, placed };
  }, [bets]);

  const totalOdds = bets.reduce((acc, bet) => acc * bet.odds, 1);
  const potentialReturn = stake ? (parseFloat(stake) * totalOdds).toFixed(2) : '0.00';

  return (
    <BetSlipContext.Provider value={{
      bets,
      placedBets,
      addBet,
      removeBet,
      clearAll,
      placeBets,
      isBetSelected,
      activeTab,
      setActiveTab,
      stake,
      setStake,
      totalOdds: totalOdds.toFixed(2),
      potentialReturn,
      betCount: bets.length,
      myBetsCount: placedBets.length,
      isMobileOpen,
      setIsMobileOpen,
      openMobileBetslip: () => setIsMobileOpen(true),
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
