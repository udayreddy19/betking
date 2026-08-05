import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { getCashoutOffer } from '../utils/wageringRules';

const BetSlipContext = createContext(null);
const PLACED_BETS_KEY = 'betking_placed_bets';

function loadPlacedBets() {
  try {
    return JSON.parse(localStorage.getItem(PLACED_BETS_KEY) || '[]');
  } catch {
    return [];
  }
}

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
  const [placedBets, setPlacedBets] = useState(loadPlacedBets);
  const [stake, setStake] = useState('');
  const [betType, setBetType] = useState('multi');
  const [singlesStakes, setSinglesStakes] = useState({});
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isMyBetsOpen, setIsMyBetsOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(PLACED_BETS_KEY, JSON.stringify(placedBets));
  }, [placedBets]);

  const openMyBets = useCallback(() => {
    setIsMyBetsOpen(true);
    setIsMobileOpen(false);
  }, []);

  const closeMyBets = useCallback(() => {
    setIsMyBetsOpen(false);
  }, []);

  const toggleMyBets = useCallback(() => {
    setIsMyBetsOpen((open) => !open);
    setIsMobileOpen(false);
  }, []);

  const addBet = useCallback((match, selection, odds, selectionName, options = {}) => {
    const existing = bets.find(b => b.matchId === match.id && b.selection === selection);

    if (existing) {
      setBets(prev => prev.filter(b => b.id !== existing.id));
      setSinglesStakes(s => {
        const next = { ...s };
        delete next[existing.id];
        return next;
      });
      showToast('Removed from betslip', 'info');
      return false;
    }

    let filtered = bets;
    if (options.singlePerMatch) {
      filtered = bets.filter(b => b.matchId !== match.id);
    } else if (betType === 'multi') {
      const isMainMarket = ['1', '2', 'X'].includes(selection);
      filtered = isMainMarket
        ? bets.filter(b => !(b.matchId === match.id && ['1', '2', 'X'].includes(b.selection)))
        : bets;
    }

    const label = getSelectionName(match, selection, selectionName);
    const betId = `${match.id}-${selection}`;
    const removedIds = bets
      .filter(b => !filtered.includes(b))
      .map(b => b.id);

    setBets([...filtered, {
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
    }]);

    setSinglesStakes(s => {
      const next = { ...s };
      for (const id of removedIds) delete next[id];
      next[betId] = next[betId] || stake || '100';
      return next;
    });

    showToast(`Added to betslip: ${label} @ ${Number(odds).toFixed(2)}`, 'success');

    if (typeof window !== 'undefined' && window.innerWidth <= 1024 && !options.skipMobileOpen) {
      setIsMobileOpen(true);
    }

    return true;
  }, [bets, showToast, betType, stake]);

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

  const openMobileBetslip = useCallback(() => setIsMobileOpen(true), []);

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

  const placeBets = useCallback((options = {}) => {
    const stakeSource = ['bonus', 'freebet'].includes(options.stakeSource)
      ? options.stakeSource
      : 'cash';

    if (bets.length === 0) {
      return { success: false, error: 'Your betslip is empty' };
    }

    const withFundMeta = (placed, stakeAmount) => ({
      ...placed,
      fundSource: stakeSource,
      cashStake: stakeSource === 'cash' ? stakeAmount : 0,
      bonusStake: stakeSource === 'bonus' ? stakeAmount : 0,
      freebetStake: stakeSource === 'freebet' ? stakeAmount : 0,
    });

    if (betType === 'multi') {
      const stakeAmount = parseFloat(stake);
      if (!stakeAmount || stakeAmount <= 0) {
        return { success: false, error: 'Enter a valid stake amount' };
      }

      const placed = withFundMeta({
        id: `placed-${Date.now()}`,
        type: 'multi',
        legs: [...bets],
        stake: stakeAmount,
        totalOdds: multiOdds,
        potentialReturn: stakeAmount * multiOdds,
        status: 'pending',
        placedAt: new Date().toISOString(),
      }, stakeAmount);

      setPlacedBets(prev => [placed, ...prev]);
      setBets([]);
      setStake('');
      setSinglesStakes({});
      setIsMyBetsOpen(true);
      setIsMobileOpen(false);
      return { success: true, placed, totalDeducted: stakeAmount, stakeSource };
    }

    const placements = [];
    let totalDeducted = 0;

    for (const bet of bets) {
      const stakeAmount = parseFloat(singlesStakes[bet.id] || stake || 0);
      if (!stakeAmount || stakeAmount <= 0) {
        return { success: false, error: `Enter stake for "${bet.selectionName}"` };
      }
      totalDeducted += stakeAmount;
      placements.push(withFundMeta({
        id: `placed-${Date.now()}-${bet.id}`,
        type: 'single',
        legs: [bet],
        stake: stakeAmount,
        totalOdds: bet.odds,
        potentialReturn: stakeAmount * bet.odds,
        status: 'pending',
        placedAt: new Date().toISOString(),
      }, stakeAmount));
    }

    setPlacedBets(prev => [...placements, ...prev]);
    setBets([]);
    setStake('');
    setSinglesStakes({});
    setIsMyBetsOpen(true);
    setIsMobileOpen(false);
    return { success: true, placed: placements, totalDeducted, stakeSource };
  }, [bets, betType, stake, singlesStakes, multiOdds]);

  const cashOutBet = useCallback((betId) => {
    const target = placedBets.find(
      (bet) => bet.id === betId
        && bet.status === 'pending'
        && bet.fundSource !== 'bonus'
        && bet.fundSource !== 'freebet',
    );
    if (!target) return null;
    const offer = getCashoutOffer(target);
    if (offer <= 0) return null;
    const cashed = {
      ...target,
      status: 'cashed_out',
      payout: offer,
      cashoutAmount: offer,
      cashedOutAt: new Date().toISOString(),
    };
    setPlacedBets((prev) => prev.map((bet) => (bet.id === betId ? cashed : bet)));
    return cashed;
  }, [placedBets]);

  const applySettledBets = useCallback((nextBets) => {
    setPlacedBets(nextBets);
  }, []);

  const adminSettleBet = useCallback((betId, outcome, customPayout) => {
    let settledItem = null;
    setPlacedBets((prev) => prev.map((bet) => {
      if (bet.id !== betId) return bet;
      const payout = outcome === 'won'
        ? (customPayout ?? bet.potentialReturn)
        : outcome === 'cashed_out'
          ? (customPayout ?? bet.stake * 0.8)
          : 0;
      settledItem = {
        ...bet,
        status: outcome,
        payout,
        settledAt: new Date().toISOString(),
      };
      return settledItem;
    }));
    return settledItem;
  }, []);

  const value = useMemo(() => ({
    bets,
    placedBets,
    addBet,
    removeBet,
    clearAll,
    placeBets,
    cashOutBet,
    applySettledBets,
    adminSettleBet,
    isBetSelected,
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
    openMobileBetslip,
    isMyBetsOpen,
    openMyBets,
    closeMyBets,
    toggleMyBets,
  }), [
    bets,
    placedBets,
    addBet,
    removeBet,
    clearAll,
    placeBets,
    cashOutBet,
    applySettledBets,
    adminSettleBet,
    isBetSelected,
    stake,
    betType,
    singlesStakes,
    setSingleStake,
    multiOdds,
    potentialReturn,
    totalStakeAmount,
    isMobileOpen,
    openMobileBetslip,
    isMyBetsOpen,
    openMyBets,
    closeMyBets,
    toggleMyBets,
  ]);

  return (
    <BetSlipContext.Provider value={value}>
      {children}
    </BetSlipContext.Provider>
  );
}

export function useBetSlip() {
  const context = useContext(BetSlipContext);
  if (!context) throw new Error('useBetSlip must be used within BetSlipProvider');
  return context;
}
