import { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import { getCashoutOffer } from '../utils/wageringRules';
import { computeAccumulatorPayout } from '../utils/accumulatorPayout.js';
import { playBetSound, playWinSound } from '../utils/soundEffects';
import { isMatchBettable } from '../utils/matchBetting';
import { apiFetch } from '../utils/apiClient';
import { DEMO_MODE } from '../utils/featureFlags';
import { subscribeLiveChannel } from '../services/liveFeedSocket';
import {
  isFinancialEventForUser,
  isFinancialWsEventType,
  shouldApplyFinancialWsEvent,
} from '../utils/wsFinancialEvents';
import { formatMarketDisplayName, resolveMarketDisplayName } from '../utils/marketDisplayName.js';
import { loadBetslipPrefs, saveBetslipPrefs, shouldAutoAcceptOddsUpdate } from '../utils/betslipPrefs';
import { analyzeMultiConflicts, hasMultiConflicts } from '../utils/betslipValidation';
import {
  acceptOddsForBet,
  acceptAllChangedOdds,
  applyOddsChangedToBets,
  handleOddsChangedResponse,
  hasPendingOddsAcceptance,
  isNonAcceptableMarketError,
  isOddsChangedResponse,
  normalizeOddsUpdates,
  ODDS_STATUS,
} from '../utils/oddsChangeHandler';

const BetSlipContext = createContext(null);
const PLACED_BETS_KEY = 'oddsyra_placed_bets';
const PENDING_BETSLIP_KEY = 'oddsyra_pending_betslip';
const ODDS_SYNC_FRESH_MS = 8000;

function loadPendingBetslip() {
  try {
    const raw = localStorage.getItem(PENDING_BETSLIP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.bets) || parsed.bets.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

function applyOddsUpdatesToBets(currentBets, updates = []) {
  if (!updates.length) return currentBets;
  return currentBets.map((bet) => {
    const hit = updates.find((u) => (
      u.matchId === bet.matchId
      && (u.selectionId === bet.selection || u.selectionId === bet.selectionId)
    ));
    if (!hit) return bet;
    return {
      ...bet,
      previousOdds: hit.previousOdds ?? bet.odds,
      odds: Number(hit.odds),
      oddsChanged: true,
      ...(hit.marketId ? { marketId: hit.marketId } : {}),
      ...(hit.selectionId ? { selection: hit.selectionId } : {}),
    };
  });
}

function mergeQuotedSelectionsIntoBets(currentBets, quotedSelections = [], updates = []) {
  if (!quotedSelections.length) return currentBets;
  return currentBets.map((bet) => {
    const row = quotedSelections.find((q) => (
      q.matchId === bet.matchId
      && (q.selectionId === bet.selection || q.selectionId === bet.selectionId)
    ));
    if (!row) return bet;
    const changed = updates.some((u) => (
      u.matchId === bet.matchId
      && (u.selectionId === bet.selection || u.selectionId === bet.selectionId)
    ));
    return {
      ...bet,
      odds: Number(row.odds),
      ...(row.marketId ? { marketId: row.marketId } : {}),
      ...(row.selectionId ? { selection: row.selectionId } : {}),
      ...(changed ? {
        previousOdds: row.previousOdds ?? bet.odds,
        oddsChanged: true,
      } : {}),
    };
  });
}

function isOddsRefreshError(error) {
  const msg = String(error || '').toLowerCase();
  return msg.includes('odds are temporarily unavailable')
    || msg.includes('odds have been updated')
    || msg.includes('temporarily unavailable');
}

function clearOddsChangedFlagsOnBets(bets) {
  return bets.map(({ oddsChanged, previousOdds, ...rest }) => rest);
}

async function fetchSyncedBetsFromServer(currentBets) {
  if (!currentBets.length) {
    return { bets: currentBets, updates: [], quoted: false };
  }

  try {
    const res = await apiFetch('/api/bets/quote-selections', {
      method: 'POST',
      body: JSON.stringify({
        selections: currentBets.map((bet) => ({
          matchId: bet.matchId,
          marketId: bet.marketId || 'match_winner',
          selectionId: bet.selection,
          selectionName: bet.selectionName,
          odds: bet.odds,
        })),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      return { bets: currentBets, updates: [], quoted: false, error: data.error };
    }

    const updates = data.updates || [];
    const bets = mergeQuotedSelectionsIntoBets(currentBets, data.selections || [], updates);
    return { bets, updates, quoted: true, syncedAt: Date.now() };
  } catch {
    return { bets: currentBets, updates: [], quoted: false };
  }
}

function formatOddsUpdatesToast(updates, placed = false) {
  if (!updates?.length) return null;
  const prefix = placed
    ? 'Odds updated — bet placed at new price'
    : 'Odds updated — you can place your bet at the new price';
  if (updates.length === 1) {
    const u = updates[0];
    const label = u.selectionName || 'Selection';
    return `${prefix}: ${label} ${Number(u.previousOdds).toFixed(2)} → ${Number(u.odds).toFixed(2)}`;
  }
  return `${prefix} on ${updates.length} selections`;
}

async function fetchMyBetsFromServer() {
  const res = await apiFetch('/api/bets/mine');
  if (res.status === 401) throw new Error('unauthorized');
  if (!res.ok) throw new Error(`fetch_failed_${res.status}`);
  const data = await res.json();
  return data.bets || [];
}

function humanizeMarketId(marketId, row = null) {
  const snap = row?.placement_snapshot;
  const placementSnapshot = typeof snap === 'string'
    ? (() => { try { return JSON.parse(snap); } catch { return null; } })()
    : snap;
  return resolveMarketDisplayName({
    marketId,
    marketName: row?.market_name,
    placementSnapshot,
  });
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
  const payoutAmount = isWon
    ? Number(row.actual_payout ?? row.potential_payout ?? 0)
    : (isVoid ? Number(row.actual_payout ?? row.stake ?? 0) : 0);
  const stakeAmount = Number(row.stake || 0);
  const profitAmount = isWon ? Math.max(0, payoutAmount - stakeAmount) : 0;

  let snap = row.placement_snapshot;
  if (typeof snap === 'string') {
    try { snap = JSON.parse(snap); } catch { snap = null; }
  }
  const snapLegs = Array.isArray(snap?.legs) ? snap.legs : [];

  const resolveMatchName = (matchId, snapLeg, selectionName) => {
    if (row.match_name && !/^live match$/i.test(row.match_name)) return row.match_name;
    if (snapLeg?.matchName && !/^live match$/i.test(snapLeg.matchName)) return snapLeg.matchName;
    if (snapLeg?.team1Name && snapLeg?.team2Name) return `${snapLeg.team1Name} vs ${snapLeg.team2Name}`;
    if (row.team1_name && row.team2_name) return `${row.team1_name} vs ${row.team2_name}`;
    // Match-winner selections often store the team name — useful when fixture left the board
    const sel = String(selectionName || '').trim();
    if (sel && !/^(over|under|draw|sel[_-])/i.test(sel) && !/^\d+(\.\d+)?$/.test(sel)) {
      return sel;
    }
    return null;
  };

  const legs = selectionRows.length > 0
    ? selectionRows.map((sel, idx) => {
      const matchId = sel.match_id || row.match_id;
      const snapLeg = snapLegs.find((l) => String(l.matchId) === String(matchId)) || snapLegs[idx] || null;
      const selectionName = humanizeSelectionId(sel.selection_id, sel.selection_name);
      return {
        id: `${row.bet_id}-leg-${idx}`,
        matchId,
        matchName: resolveMatchName(matchId, snapLeg, selectionName),
        team1Name: snapLeg?.team1Name || row.team1_name || null,
        team2Name: snapLeg?.team2Name || row.team2_name || null,
        league: snapLeg?.league || row.league || null,
        sport: snapLeg?.sport || row.sport || 'cricket',
        selection: sel.selection_id,
        selectionName,
        marketName: humanizeMarketId(sel.market_id, row),
        marketId: sel.market_id,
        odds: Number(sel.odds),
      };
    })
    : [{
      id: `${row.bet_id}-leg-0`,
      matchId: row.match_id,
      matchName: resolveMatchName(row.match_id, snapLegs[0], row.selection_name || row.selection_id),
      team1Name: snapLegs[0]?.team1Name || row.team1_name || null,
      team2Name: snapLegs[0]?.team2Name || row.team2_name || null,
      league: snapLegs[0]?.league || row.league || null,
      sport: snapLegs[0]?.sport || row.sport || 'cricket',
      selection: row.selection_id,
      selectionName: humanizeSelectionId(row.selection_id, row.selection_name),
      marketName: humanizeMarketId(row.market_id, row),
      marketId: row.market_id,
      odds: Number(row.accepted_odds || row.odds),
    }];

  return {
    id: row.bet_id,
    type: isMulti ? 'multi' : 'single',
    legs,
    stake: stakeAmount,
    totalOdds: Number(row.accepted_odds || row.odds),
    potentialReturn: Number(row.potential_payout),
    payout: payoutAmount,
    profit: profitAmount,
    status,
    placedAt: row.created_at,
    fundSource: row.fund_source || 'cash',
  };
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
  const savedSlip = loadPendingBetslip();
  const [bets, setBets] = useState(() => savedSlip?.bets || []);
  const [placedBets, setPlacedBets] = useState([]);
  const [stake, setStake] = useState(() => savedSlip?.stake || '');
  const [betType, setBetType] = useState(() => savedSlip?.betType || 'singles');
  const [singlesStakes, setSinglesStakes] = useState(() => savedSlip?.singlesStakes || {});
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isMyBetsOpen, setIsMyBetsOpen] = useState(false);
  const [myBetsLoading, setMyBetsLoading] = useState(false);
  const myBetsFetchSeq = useRef(0);
  const betsRef = useRef(bets);
  const lastOddsSyncAt = useRef(0);
  const oddsConfirmPendingRef = useRef(false);
  const [betslipPrefs, setBetslipPrefsState] = useState(() => loadBetslipPrefs());
  const [quickBet, setQuickBet] = useState(null);

  useEffect(() => {
    betsRef.current = bets;
  }, [bets]);

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
        setMyBetsLoading(false);
        return;
      }
      const seq = ++myBetsFetchSeq.current;
      setMyBetsLoading(true);
      try {
        const rows = await fetchMyBetsFromServer();
        if (!cancelled && seq === myBetsFetchSeq.current) {
          setPlacedBets(rows.map(mapServerBetToPlaced));
        }
      } catch {
        // Keep existing list on transient/auth errors — avoids flashing empty until refresh.
      } finally {
        if (!cancelled && seq === myBetsFetchSeq.current) {
          setMyBetsLoading(false);
        }
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
    const seq = ++myBetsFetchSeq.current;
    setMyBetsLoading(true);
    try {
      const rows = await fetchMyBetsFromServer();
      if (seq === myBetsFetchSeq.current) {
        setPlacedBets(rows.map(mapServerBetToPlaced));
      }
    } catch {
      // keep existing list
    } finally {
      if (seq === myBetsFetchSeq.current) {
        setMyBetsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (DEMO_MODE || !user?.userId) return undefined;
    const channel = `user:${user.userId}`;
    const seenEvents = new Set();
    const lastTsRef = { current: 0 };
    const unsub = subscribeLiveChannel(channel, (msg) => {
      const eventType = msg?.eventType;
      if (eventType === 'WS_RECONNECTED') {
        refreshMyBets();
        void refreshWallet?.();
        return;
      }
      if (!isFinancialWsEventType(eventType)) return;
      if (!isFinancialEventForUser(msg, user.userId)) return;
      const decision = shouldApplyFinancialWsEvent(msg, seenEvents, lastTsRef);
      if (!decision.apply) return;
      refreshMyBets();
      void refreshWallet?.();
      if (eventType === 'BET_SETTLED' && msg?.payload?.status === 'WON') playWinSound();
    });
    return unsub;
  }, [user?.userId, refreshMyBets, refreshWallet]);

  useEffect(() => {
    try {
      if (bets.length === 0) {
        localStorage.removeItem(PENDING_BETSLIP_KEY);
        return;
      }
      localStorage.setItem(PENDING_BETSLIP_KEY, JSON.stringify({
        bets,
        stake,
        betType,
        singlesStakes,
        savedAt: Date.now(),
      }));
    } catch {
      // quota / private mode
    }
  }, [bets, stake, betType, singlesStakes]);

  const refreshSlipOdds = useCallback(async ({ silent = false } = {}) => {
    const current = betsRef.current;
    if (DEMO_MODE || current.length === 0) return { updated: false, updates: [] };

    const sync = await fetchSyncedBetsFromServer(current);
    if (!sync.quoted) return { updated: false, updates: [] };

    betsRef.current = sync.bets;
    setBets(sync.bets);
    lastOddsSyncAt.current = sync.syncedAt || Date.now();

    if (sync.updates.length > 0) {
      if (!silent) {
        showToast(formatOddsUpdatesToast(sync.updates), 'info');
      }
      return { updated: true, updates: sync.updates };
    }

    return { updated: false, updates: [] };
  }, [showToast]);

  useEffect(() => {
    if (DEMO_MODE || bets.length === 0) return undefined;
    void refreshSlipOdds({ silent: true });
    const timer = setInterval(() => refreshSlipOdds({ silent: true }), 30000);
    return () => clearInterval(timer);
  }, [bets.length, refreshSlipOdds]);

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
    setIsMyBetsOpen((open) => {
      const next = !open;
      if (next) void refreshMyBets();
      return next;
    });
    setIsMobileOpen(false);
  }, [refreshMyBets]);

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
      setQuickBet((prev) => (prev?.bet?.id === existing.id ? null : prev));
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
    const defaultStake = stake || '100';
    const newBet = {
      id: betId,
      matchId: match.id,
      matchName: `${match.team1?.name || match.team1} vs ${match.team2?.name || match.team2}`,
      team1Name: match.team1?.name || match.team1 || null,
      team2Name: match.team2?.name || match.team2 || null,
      league: match.league,
      sport: match.sport,
      selection,
      selectionName: label,
      marketId: options.marketId || null,
      marketName: options.marketName
        || (options.marketId ? formatMarketDisplayName(options.marketId) : 'Match Winner'),
      matchTime: options.matchTime || match.time || new Date().toISOString(),
      odds: Number(odds),
      timestamp: Date.now(),
    };

    setBets([...filtered, newBet]);

    setSinglesStakes(s => {
      const next = { ...s };
      for (const id of removedIds) delete next[id];
      next[betId] = next[betId] || defaultStake;
      return next;
    });

    const silentAdd = !!(options.silentAdd ?? options.quickBet);
    const skipMobileOpen = !!options.skipMobileOpen;
    const isPhone = typeof window !== 'undefined'
      && window.matchMedia('(max-width: 1024px)').matches;

    if ((isPhone || silentAdd) && !skipMobileOpen) {
      setQuickBet({
        bet: {
          id: newBet.id,
          matchId: newBet.matchId,
          matchName: newBet.matchName,
          selection: newBet.selection,
          selectionName: newBet.selectionName,
          marketId: newBet.marketId,
          marketName: newBet.marketName,
          odds: newBet.odds,
        },
        defaultStake,
      });
      setIsMobileOpen(false);
    } else if (!skipMobileOpen) {
      showToast(`Added to betslip: ${label} @ ${Number(odds).toFixed(2)}`, 'success');
    } else {
      // Modal / embedded slip already visible — don't stack the quick sheet.
      setIsMobileOpen(false);
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
    setQuickBet(null);
    try {
      localStorage.removeItem(PENDING_BETSLIP_KEY);
    } catch {
      // ignore
    }
  }, []);

  const setSingleStake = useCallback((betId, value) => {
    setSinglesStakes(prev => ({ ...prev, [betId]: value }));
  }, []);

  const openMobileBetslip = useCallback(() => setIsMobileOpen(true), []);

  const closeQuickBet = useCallback(() => setQuickBet(null), []);

  const openQuickBetPanel = useCallback(() => {
    const list = betsRef.current;
    if (!list.length) return;
    const bet = list[list.length - 1];
    setQuickBet({
      bet: {
        id: bet.id,
        matchId: bet.matchId,
        matchName: bet.matchName,
        selection: bet.selection,
        selectionName: bet.selectionName,
        marketId: bet.marketId,
        marketName: bet.marketName,
        odds: bet.odds,
      },
      defaultStake: singlesStakes[bet.id] || stake || '100',
    });
    setIsMobileOpen(false);
  }, [stake, singlesStakes]);

  const setBetslipPref = useCallback((key, value) => {
    setBetslipPrefsState((prev) => {
      const next = { ...prev, [key]: value };
      saveBetslipPrefs(next);
      return next;
    });
  }, []);

  const multiConflicts = useMemo(
    () => (betType === 'multi' ? analyzeMultiConflicts(bets) : new Map()),
    [bets, betType],
  );

  const hasBlockingConflicts = betType === 'multi' && hasMultiConflicts(bets);

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
    const prefs = loadBetslipPrefs();
    const targetSingleId = options.singleBetId || null;

    let slipBets = betsRef.current;
    if (targetSingleId) {
      slipBets = slipBets.filter((b) => b.id === targetSingleId);
    }
    if (slipBets.length === 0) {
      return { success: false, error: 'Your betslip is empty' };
    }

    if (betType === 'multi' && hasMultiConflicts(betsRef.current)) {
      return { success: false, error: 'Some selections are related and cannot be combined.' };
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
              matchName: bet.matchName || null,
              team1Name: bet.team1Name || null,
              team2Name: bet.team2Name || null,
              league: bet.league || null,
              sport: bet.sport || null,
              stake: stakeAmount,
              clientOdds: bet.odds,
              fundSource: stakeSource,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            const fallback = res.status >= 502
              ? 'Betting service is temporarily unavailable. Please try again in a moment.'
              : 'Bet placement failed';
            return {
              success: false,
              error: data.message || data.error || fallback,
              code: data.code,
              status: res.status,
              data: data.data,
              oddsUpdates: data.oddsUpdates,
              payload: data,
            };
          }
          return { success: true, data };
        };

        const placeSingles = async (workingBets) => {
          const placedIds = [];
          for (const bet of workingBets) {
            const stakeAmount = parseFloat(singlesStakes[bet.id] || stake || 0);
            if (!stakeAmount || stakeAmount <= 0) {
              return { success: false, error: `Enter stake for "${bet.selectionName}"` };
            }
            const result = await placeSingle(bet, stakeAmount);
            if (!result.success) return result;
            placedIds.push(bet.id);
          }
          return { success: true, placedIds };
        };

        const placeMulti = async (workingBets) => {
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
              selections: workingBets.map((bet) => ({
                matchId: bet.matchId,
                marketId: bet.marketId || 'match_winner',
                selectionId: bet.selection,
                odds: bet.odds,
                selectionName: bet.selectionName,
                matchName: bet.matchName || null,
                team1Name: bet.team1Name || null,
                team2Name: bet.team2Name || null,
                league: bet.league || null,
                sport: bet.sport || null,
              })),
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            const fallback = res.status >= 502
              ? 'Betting service is temporarily unavailable. Please try again in a moment.'
              : 'Bet placement failed';
            return {
              success: false,
              error: data.message || data.error || fallback,
              code: data.code,
              status: res.status,
              data: data.data,
              oddsUpdates: data.oddsUpdates,
              payload: data,
            };
          }
          return { success: true };
        };

        const handlePlacementOddsRejection = (result, workingBets) => {
          if (isNonAcceptableMarketError(result)) {
            return {
              success: false,
              error: result.error || 'This market is not available right now.',
              code: result.code,
            };
          }
          if (!isOddsChangedResponse(result)) return result;

          const handled = handleOddsChangedResponse(workingBets, result.payload || result);
          let nextBets = handled.bets;
          if (shouldAutoAcceptOddsUpdate(handled.updates, prefs)) {
            nextBets = acceptAllChangedOdds(nextBets);
          }
          betsRef.current = nextBets;
          setBets(nextBets);
          setQuickBet((prev) => {
            if (!prev?.bet) return prev;
            const updated = nextBets.find((b) => b.id === prev.bet.id);
            if (!updated) return prev;
            return { ...prev, bet: updated };
          });
          return {
            success: false,
            oddsUpdated: true,
            requiresAcceptance: hasPendingOddsAcceptance(nextBets),
            code: handled.code,
            error: handled.message || 'The odds have changed. Please review the new odds.',
            updates: handled.updates,
          };
        };

        const runPlacement = async (workingBets) => {
          const useMulti = !targetSingleId && betType === 'multi' && workingBets.length >= 2;
          return useMulti ? placeMulti(workingBets) : placeSingles(workingBets);
        };

        let workingBets = slipBets;
        if (hasPendingOddsAcceptance(betsRef.current)) {
          return {
            success: false,
            oddsUpdated: true,
            requiresAcceptance: true,
            error: 'Please accept the updated odds before placing your bet.',
          };
        }

        let placement = await runPlacement(workingBets);
        if (!placement.success && isOddsChangedResponse(placement)) {
          return handlePlacementOddsRejection(placement, workingBets);
        }

        if (!placement.success) {
          return placement;
        }
        if (targetSingleId) {
          setBets((prev) => prev.filter((b) => b.id !== targetSingleId));
          setSinglesStakes((s) => {
            const next = { ...s };
            delete next[targetSingleId];
            return next;
          });
          setQuickBet(null);
        } else {
          setBets([]);
          setStake('');
          setSinglesStakes({});
          setQuickBet(null);
          localStorage.removeItem(PENDING_BETSLIP_KEY);
        }
        setIsMyBetsOpen(true);
        setIsMobileOpen(false);
        playBetSound();
        void refreshWallet?.();
        void fetchMyBetsFromServer()
          .then((rows) => setPlacedBets(rows.map(mapServerBetToPlaced)))
          .catch(() => {});
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
      setQuickBet(null);
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
    setQuickBet(null);
    setIsMyBetsOpen(true);
    setIsMobileOpen(false);
    playBetSound();
    return { success: true, placed: placements, totalDeducted, stakeSource };
  }, [bets, betType, stake, singlesStakes, multiOdds, refreshWallet, potentialReturn]);

  const cashOutBet = useCallback(async (betId, requestedCashoutValue = null) => {
    if (!DEMO_MODE) {
      try {
        const res = await apiFetch('/api/bet/cashout', {
          method: 'POST',
          headers: { 'X-Idempotency-Key': `cashout-${betId}-${Date.now()}` },
          body: JSON.stringify({
            betId,
            ...(requestedCashoutValue != null ? { requestedCashoutValue } : {}),
          }),
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
    const legOdds = Number(target?.legs?.[0]?.odds || target?.odds);
    const offer = requestedCashoutValue != null
      ? Number(requestedCashoutValue)
      : getCashoutOffer(target, user?.loyaltyTier, legOdds);
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
  }, [placedBets, refreshWallet, user?.loyaltyTier]);

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

  const acceptOddsChange = useCallback((betId) => {
    setBets((prev) => {
      const next = prev.map((bet) => (
        bet.id === betId && bet.oddsStatus === ODDS_STATUS.CHANGED
          ? acceptOddsForBet(bet)
          : bet
      ));
      betsRef.current = next;
      return next;
    });
    setQuickBet((prev) => {
      if (!prev?.bet || prev.bet.id !== betId) return prev;
      if (prev.bet.oddsStatus !== ODDS_STATUS.CHANGED) return prev;
      return { ...prev, bet: acceptOddsForBet(prev.bet) };
    });
  }, []);

  const acceptAllOddsChanges = useCallback(() => {
    setBets((prev) => {
      const next = acceptAllChangedOdds(prev);
      betsRef.current = next;
      return next;
    });
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
    myBetsLoading,
    betslipPrefs,
    setBetslipPref,
    multiConflicts,
    hasBlockingConflicts,
    quickBet,
    closeQuickBet,
    openQuickBetPanel,
    refreshSlipOdds,
    acceptOddsChange,
    acceptAllOddsChanges,
    hasPendingOddsAcceptance: hasPendingOddsAcceptance(bets),
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
    myBetsLoading,
    betslipPrefs,
    multiConflicts,
    hasBlockingConflicts,
    quickBet,
    closeQuickBet,
    openQuickBetPanel,
    refreshSlipOdds,
    acceptOddsChange,
    acceptAllOddsChanges,
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
