import { createContext, useContext, useState, useCallback, useMemo } from 'react';
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
  const [betType, setBetType] = useState('multi');
  const [singlesStakes, setSinglesStakes] = useState({});
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const addBet = useCallback((match, selection, odds, selectionName, options = {}) => {
    let added = true;
    setBets(prev => {
      const existing = prev.find(b => b.matchId === match.id && b.selection === selection);
      if (existing) {
        added = false;
        showToast('Removed from betslip');
        setSinglesStakes(s => {
          const next = { ...s };
          delete next[existing.id];
          return next;
        });
        return prev.filter(b => b.id !== existing.id);
      }

      let filtered = prev;
      if (options.singlePerMatch) {
        filtered = prev.filter(b => b.matchId !== match.id);
      } else if (betType === 'multi') {
        const isMainMarket = ['1', '2', 'X'].includes(selection);
        filtered = isMainMarket
          ? prev.filter(b => !(b.matchId === match.id && ['1', '2', 'X'].includes(b.selection)))
          : prev;
      }

      const label = getSelectionName(match, selection, selectionName);
      const betId = `${match.id}-${selection}`;
      showToast(`Added to betslip: ${label} @ ${Number(odds).toFixed(2)}`);

      if (typeof window !== 'undefined' && window.innerWidth <= 1024 && !options.skipMobileOpen) {
        setIsMobileOpen(true);
      }

      setSinglesStakes(s => ({ ...s, [betId]: s[betId] || stake || '100' }));

      return [...filtered, {
        id: betId,
        matchId: match.id,
        matchName: `${match.team1.name} vs ${match.team2.name}`,
        league: match.league,
        sport: match.sport,
        selection,
        selectionName: label,
        marketName: options.marketName || 'Match Winner',
        matchTime: options.matchTime || match.time || new Date().toISOString(),
        odds: Number(odds),
        timestamp: Date.now(),
      }];
    });
    return added;
  }, [showToast, betType, stake]);

  const removeBet = useCallback((betId) => {
    setBets(prev => prev.filter(b => b.id !== betId));
    setSinglesStakes(s => {
      const next = { ...s };
      delete next[betId];
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setBets([]);
    setStake('');
    setSinglesStakes({});
  }, []);

  const setSingleStake = useCallback((betId, value) => {
    setSinglesStakes(prev => ({ ...prev, [betId]: value }));
  }, []);

  const isBetSelected = useCallback((matchId, selection) => {
    return bets.some(b => b.matchId === matchId && b.selection === selection);
  }, [bets]);

  const multiOdds = useMemo(
    () => bets.reduce((acc, bet) => acc * bet.odds, 1),
    [bets]
  );

  const totalStakeAmount = useMemo(() => {
    if (betType === 'multi') return parseFloat(stake) || 0;
    return bets.reduce((sum, bet) => {
      const s = parseFloat(singlesStakes[bet.id] || stake || 0);
      return sum + (s || 0);
    }, 0);
  }, [betType, bets, stake, singlesStakes]);

  const potentialReturn = useMemo(() => {
    if (bets.length === 0) return '0.00';
    if (betType === 'multi') {
      const s = parseFloat(stake) || 0;
      return (s * multiOdds).toFixed(2);
    }
    const total = bets.reduce((sum, bet) => {
      const s = parseFloat(singlesStakes[bet.id] || stake || 0) || 0;
      return sum + s * bet.odds;
    }, 0);
    return total.toFixed(2);
  }, [bets, betType, stake, singlesStakes, multiOdds]);

  const placeBets = useCallback(() => {
    if (bets.length === 0) {
      return { success: false, error: 'Your betslip is empty' };
    }

    if (betType === 'multi') {
      const stakeAmount = parseFloat(stake);
      if (!stakeAmount || stakeAmount <= 0) {
        return { success: false, error: 'Enter a valid stake amount' };
      }

      const placed = {
        id: `placed-${Date.now()}`,
        type: 'multi',
        legs: [...bets],
        stake: stakeAmount,
        totalOdds: multiOdds,
        potentialReturn: stakeAmount * multiOdds,
        status: 'pending',
        placedAt: new Date().toISOString(),
      };

      setPlacedBets(prev => [placed, ...prev]);
      setBets([]);
      setStake('');
      setSinglesStakes({});
      setActiveTab('mybets');
      setIsMobileOpen(true);
      return { success: true, placed, totalDeducted: stakeAmount };
    }

    const placements = [];
    let totalDeducted = 0;

    for (const bet of bets) {
      const stakeAmount = parseFloat(singlesStakes[bet.id] || stake || 0);
      if (!stakeAmount || stakeAmount <= 0) {
        return { success: false, error: `Enter stake for "${bet.selectionName}"` };
      }
      totalDeducted += stakeAmount;
      placements.push({
        id: `placed-${Date.now()}-${bet.id}`,
        type: 'single',
        legs: [bet],
        stake: stakeAmount,
        totalOdds: bet.odds,
        potentialReturn: stakeAmount * bet.odds,
        status: 'pending',
        placedAt: new Date().toISOString(),
      });
    }

    setPlacedBets(prev => [...placements, ...prev]);
    setBets([]);
    setStake('');
    setSinglesStakes({});
    setActiveTab('mybets');
    setIsMobileOpen(true);
    return { success: true, placed: placements, totalDeducted };
  }, [bets, betType, stake, singlesStakes, multiOdds]);

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
      betType,
      setBetType,
      singlesStakes,
      setSingleStake,
      totalOdds: betType === 'multi' ? multiOdds.toFixed(2) : '—',
      potentialReturn,
      totalStakeAmount,
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
