import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { getCashoutOffer } from '../utils/wageringRules';
import { computeAccumulatorPayout } from '../utils/accumulatorPayout.js';
import { playBetSound, playWinSound } from '../utils/soundEffects';
import { isMatchBettable } from '../utils/matchBetting';
import { apiFetch } from '../utils/apiClient';
import { DEMO_MODE } from '../utils/featureFlags';

const BetSlipContext = createContext(null);
const PLACED_BETS_KEY = 'oddsyra_placed_bets';

async function fetchMyBetsFromServer() {
  const res = await apiFetch('/api/bets/mine');
  if (!res.ok) return [];
  const data = await res.json();
  return data.bets || [];
}

function humanizeMarketId(marketId) {
  const id = String(marketId || '').trim();
  if (!id) return 'Market';
  const known = {
    match_winner: 'Match Winner',
    match_winner_super_over: 'Match Winner (incl. Super Over)',
  };
  if (known[id]) return known[id];
  return id
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function humanizeSelectionId(selectionId, selectionName) {
  const name = String(selectionName || '').trim();
  const id = String(selectionId || '').trim();
  if (name && !/^sel[_-]/i.test(name) && name !== id) return name;
  if (id === '1') return 'Home';
  if (id === '2') return 'Away';
  if (id === 'X') return 'Draw';
  if (name && !/^sel[_-]/i.test(name)) return name;
  return name || id || 'Selection';
}

function mapServerBetToPlaced(row) {
  const rawStatus = String(row.status || 'pending').toLowerCase();
  let status = rawStatus;
  if (rawStatus === 'accepted' || rawStatus === 'pending' || rawStatus === 'open') status = 'pending';
  else if (rawStatus === 'won' || rawStatus === 'win') status = 'won';
  else if (rawStatus === 'lost' || rawStatus === 'loss') status = 'lost';
  else if (rawStatus === 'void' || rawStatus === 'push' || rawStatus === 'refunded') status = 'void';
  else if (rawStatus === 'cashed_out' || rawStatus === 'cashout') status = 'cashed_out';
  else if (rawStatus === 'settled') {
    // Legacy rows marked SETTLED without outcome — treat as lost display unless payout implies win
    const payout = Number(row.potential_payout || 0);
    status = payout > Number(row.stake || 0) ? 'won' : 'lost';
  }

  const selectionRows = Array.isArray(row.selections)
    ? row.selections
    : [];
  const isMulti = row.bet_type === 'ACCUMULATOR';
  const isWon = status === 'won';
  const isVoid = status === 'void';

  const legs = selectionRows.length > 0
    ? selectionRows.map((sel, idx) => {
      const matchId = sel.match_id || row.match_id;
      const matchName = row.match_name
        || (String(matchId || '').startsWith('10cric_') || String(matchId || '').startsWith('oy_')
          ? 'Live match' : null)
        || (isProviderMatchId(matchId) ? 'Live match' : matchId);
      return {
        id: `${row.bet_id}-leg-${idx}`,
        matchId,
        matchName,
        sport: row.sport || 'cricket',
        selection: sel.selection_id,
        selectionName: humanizeSelectionId(sel.selection_id, sel.selection_name),
        marketName: humanizeMarketId(sel.market_id),
        marketId: sel.market_id,
        odds: Number(sel.odds),
      };
    })
    : [{
      id: `${row.bet_id}-leg-0`,
      matchId: row.match_id,
      matchName: row.match_name
        || (String(row.match_id || '').startsWith('10cric_') || String(row.match_id || '').startsWith('oy_')
          ? 'Live match' : null)
        || (isProviderMatchId(row.match_id) ? 'Live match' : row.match_id),
      sport: row.sport || 'cricket',
      selection: row.selection_id,
      selectionName: humanizeSelectionId(row.selection_id, row.selection_name),
      marketName: humanizeMarketId(row.market_id),
      marketId: row.market_id,
      odds: Number(row.accepted_odds || row.odds),
    }];

  return {
    id: row.bet_id,
    type: isMulti ? 'multi' : 'single',
    legs,
    stake: Number(row.stake),
    totalOdds: Number(row.accepted_odds || row.odds),
    potentialReturn: Number(row.potential_payout),
    payout: isWon ? Number(row.potential_payout || 0) : (isVoid ? Number(row.stake || 0) : 0),
    status,
    placedAt: row.created_at,
    fundSource: row.fund_source || 'cash',
  };
}

function isProviderMatchId(matchId) {
  return /^(oy_|10cric_|cb_|crex_|fancode_|espn_)/i.test(String(matchId || ''));
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
  const { showToast, refreshWallet, user } = useAuth();
  const [bets, setBets] = useState([]);
  const [placedBets, setPlacedBets] = useState([]);
  const [stake, setStake] = useState('');
  const [betType, setBetType] = useState('singles');
  const [singlesStakes, setSinglesStakes] = useState({});
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isMyBetsOpen, setIsMyBetsOpen] = useState(false);

  useEffect(() => {
    if (DEMO_MODE) {
      try {
        const saved = JSON.parse(localStorage.getItem(PLACED_BETS_KEY) || '[]');
        setPlacedBets(saved);
      } catch {
        setPlacedBets([]);
      }
      return undefined;
    }

    let cancelled = false;
    const load = async () => {
      if (!user?.userId && !user?.email) {
        setPlacedBets([]);
        return;
      }
      try {
        const rows = await fetchMyBetsFromServer();
        if (!cancelled) setPlacedBets(rows.map(mapServerBetToPlaced));
      } catch {
        if (!cancelled) setPlacedBets([]);
      }
    };
    load();
    const timer = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [user?.userId, user?.email]);

  const refreshMyBets = useCallback(async () => {
    if (DEMO_MODE) return;
    try {
      const rows = await fetchMyBetsFromServer();
      setPlacedBets(rows.map(mapServerBetToPlaced));
    } catch {
      // keep existing list
    }
  }, []);

  useEffect(() => {
    if (DEMO_MODE) {
      try {
        localStorage.setItem('oddsyra_placed_bets', JSON.stringify(placedBets));
      } catch {
        // Safari private mode / quota
      }
    }
  }, [placedBets]);

  const openMyBets = useCallback(() => {
    setIsMyBetsOpen(true);
    setIsMobileOpen(false);
    void refreshMyBets();
  }, [refreshMyBets]);

  const closeMyBets = useCallback(() => {
    setIsMyBetsOpen(false);
  }, []);

  const toggleMyBets = useCallback(() => {
    setIsMyBetsOpen((open) => !open);
    setIsMobileOpen(false);
  }, []);

  const addBet = useCallback((match, selection, odds, selectionName, options = {}) => {
    if (!isMatchBettable(match)) {
      showToast('This match is no longer open for betting', 'error');
      return false;
    }
    if (!(Number(odds) > 1)) {
      showToast('That market is not currently bettable', 'error');
      return false;
    }
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
      marketId: options.marketId || null,
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
    () => computeAccumulatorPayout(1, bets.map((bet) => bet.odds)).fullCombinedOdds,
    [bets],
  );

  const multiDisplayOdds = useMemo(
    () => computeAccumulatorPayout(1, bets.map((bet) => bet.odds)).combinedOdds,
    [bets],
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
      return computeAccumulatorPayout(s, bets.map((bet) => bet.odds)).potentialPayout.toFixed(2);
    }
    const total = bets.reduce((sum, bet) => {
      const s = parseFloat(singlesStakes[bet.id] || stake || 0) || 0;
      return sum + s * bet.odds;
    }, 0);
    return total.toFixed(2);
  }, [bets, betType, stake, singlesStakes, multiOdds]);

  const placeBets = useCallback(async (options = {}) => {
    const stakeSource = ['bonus', 'freebet'].includes(options.stakeSource)
      ? options.stakeSource
      : 'cash';

    if (bets.length === 0) {
      return { success: false, error: 'Your betslip is empty' };
    }

    if (!DEMO_MODE) {
      try {
        const placeSingle = async (bet, stakeAmount) => {
          const res = await apiFetch('/api/bets/place', {
            method: 'POST',
            headers: { 'X-Idempotency-Key': `single-${bet.id}-${Date.now()}` },
            body: JSON.stringify({
              matchId: bet.matchId,
              marketId: bet.marketId || 'match_winner',
              selectionId: bet.selection,
              selectionName: bet.selectionName,
              stake: stakeAmount,
              clientOdds: bet.odds,
              fundSource: stakeSource,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            return { success: false, error: data.error || 'Bet placement failed' };
          }
          return { success: true, data };
        };

        if (betType === 'multi' && bets.length >= 2) {
          const stakeAmount = parseFloat(stake);
          if (!stakeAmount || stakeAmount <= 0) {
            return { success: false, error: 'Enter a valid stake amount' };
          }
          const res = await apiFetch('/api/bets/place', {
            method: 'POST',
            headers: { 'X-Idempotency-Key': `multi-${Date.now()}` },
            body: JSON.stringify({
              stake: stakeAmount,
              fundSource: stakeSource,
              selections: bets.map((bet) => ({
                matchId: bet.matchId,
                marketId: bet.marketId || 'match_winner',
                selectionId: bet.selection,
                odds: bet.odds,
                selectionName: bet.selectionName,
              })),
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            return { success: false, error: data.error || 'Bet placement failed' };
          }
        } else {
          // Singles mode, or multi with only one leg — place as singles.
          for (const bet of bets) {
            const stakeAmount = parseFloat(singlesStakes[bet.id] || stake || 0);
            if (!stakeAmount || stakeAmount <= 0) {
              return { success: false, error: `Enter stake for "${bet.selectionName}"` };
            }
            const placed = await placeSingle(bet, stakeAmount);
            if (!placed.success) return placed;
          }
        }

        const serverBets = await fetchMyBetsFromServer();
        setPlacedBets(serverBets.map(mapServerBetToPlaced));
        setBets([]);
        setStake('');
        setSinglesStakes({});
        setIsMyBetsOpen(true);
        setIsMobileOpen(false);
        playBetSound();
        await refreshWallet?.();
        return {
          success: true,
          potentialReturn: Number(potentialReturn),
          placed: betType === 'multi'
            ? { potentialReturn: Number(potentialReturn) }
            : [{ potentialReturn: Number(potentialReturn) }],
        };
      } catch {
        return { success: false, error: 'Unable to reach betting service' };
      }
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
        totalOdds: multiDisplayOdds,
        potentialReturn: computeAccumulatorPayout(stakeAmount, bets.map((b) => b.odds)).potentialPayout,
        status: 'pending',
        placedAt: new Date().toISOString(),
      }, stakeAmount);

      setPlacedBets(prev => [placed, ...prev]);
      setBets([]);
      setStake('');
      setSinglesStakes({});
      setIsMyBetsOpen(true);
      setIsMobileOpen(false);
      playBetSound();
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
    playBetSound();
    return { success: true, placed: placements, totalDeducted, stakeSource };
  }, [bets, betType, stake, singlesStakes, multiOdds, refreshWallet, potentialReturn]);

  const cashOutBet = useCallback(async (betId) => {
    if (!DEMO_MODE) {
      try {
        const res = await apiFetch('/api/bet/cashout', {
          method: 'POST',
          headers: { 'X-Idempotency-Key': `cashout-${betId}-${Date.now()}` },
          body: JSON.stringify({ betId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.success === false) return null;
        const rows = await fetchMyBetsFromServer();
        setPlacedBets(rows.map(mapServerBetToPlaced));
        playWinSound();
        await refreshWallet?.();
        return {
          id: betId,
          status: 'cashed_out',
          cashoutAmount: Number(data.cashoutAmount || 0),
        };
      } catch {
        return null;
      }
    }

    const target = placedBets.find(
      (bet) => bet.id === betId
        && bet.status === 'pending'
        && bet.fundSource !== 'bonus'
        && bet.fundSource !== 'freebet',
    );
    if (!target) return null;
    const offer = getCashoutOffer(target, user?.loyaltyTier);
    if (offer <= 0) return null;
    const cashed = {
      ...target,
      status: 'cashed_out',
      payout: offer,
      cashoutAmount: offer,
      cashedOutAt: new Date().toISOString(),
    };
    setPlacedBets((prev) => prev.map((bet) => (bet.id === betId ? cashed : bet)));
    playWinSound();
    return cashed;
  }, [placedBets, refreshWallet]);

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
    totalOdds: betType === 'multi' ? multiDisplayOdds.toFixed(2) : '—',
    potentialReturn,
    totalStakeAmount,
    betCount: bets.length,
    myBetsCount: placedBets.filter((b) => (b.status || 'pending') === 'pending' || (b.status || 'pending') === 'open').length,
    isMobileOpen,
    setIsMobileOpen,
    openMobileBetslip,
    isMyBetsOpen,
    openMyBets,
    closeMyBets,
    toggleMyBets,
    refreshMyBets,
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
    refreshMyBets,
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
