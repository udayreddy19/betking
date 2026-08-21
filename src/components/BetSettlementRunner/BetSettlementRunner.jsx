import { useEffect, useRef } from 'react';
import { useLiveMatches } from '../../context/LiveSportsContext';
import { useBetSlip } from '../../context/BetSlipContext';
import { useAuth } from '../../context/AuthContext';
import { settleAllPlacedBets } from '../../utils/betSettlement';
import { formatInr } from '../../utils/walletBalance';
import { DEMO_MODE } from '../../utils/featureFlags';
import { apiFetch } from '../../utils/apiClient';
import { isCricketMatchCompleted } from '../../utils/cricketMatchComplete';

/** Settles pending bets when live score data marks matches complete. */
export default function BetSettlementRunner() {
  const matches = useLiveMatches();
  const { placedBets, applySettledBets, refreshMyBets } = useBetSlip();
  const { creditBetWin, showToast, isLoggedIn, refreshWallet } = useAuth();
  const creditedRef = useRef(new Set());
  const syncingRef = useRef(false);

  // Production: ask server to settle completed matches, then refresh My Bets
  useEffect(() => {
    if (DEMO_MODE) return undefined;
    if (!isLoggedIn) return undefined;
    if (!placedBets.some((b) => b.status === 'pending')) return undefined;

    let cancelled = false;
    const sync = async () => {
      if (syncingRef.current || cancelled) return;
      const hasCompleted = (matches || []).some((m) => {
        const state = String(m.matchState || '').toLowerCase();
        return state === 'post' || state === 'completed' || isCricketMatchCompleted(m);
      });
      if (!hasCompleted && !(matches || []).length) return;

      syncingRef.current = true;
      try {
        await apiFetch('/api/bets/sync-settlement', { method: 'POST', body: '{}' });
        if (!cancelled && typeof refreshMyBets === 'function') {
          await refreshMyBets();
        }
        if (!cancelled && typeof refreshWallet === 'function') {
          await refreshWallet();
        }
      } catch {
        // keep pending list; worker will retry
      } finally {
        syncingRef.current = false;
      }
    };

    sync();
    const timer = setInterval(sync, 20000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [matches, placedBets, isLoggedIn, refreshMyBets, refreshWallet]);

  // Demo mode: local settlement only
  useEffect(() => {
    if (!DEMO_MODE) return;
    if (!isLoggedIn || placedBets.length === 0) return;
    if (!placedBets.some((b) => b.status === 'pending')) return;

    const { bets, changed } = settleAllPlacedBets(placedBets, matches);
    if (!changed) return;

    const newlySettled = bets.filter(
      (b) => b.status !== 'pending' && !creditedRef.current.has(b.id)
    );

    for (const bet of newlySettled) {
      creditedRef.current.add(bet.id);
      if (bet.status === 'won' && bet.payout > 0) {
        const { cashCredit, bonusCredit, freebetCredit, winningsCredit } = creditBetWin(bet);
        if (winningsCredit > 0) {
          showToast(
            `Bet won! ${formatInr(winningsCredit)} winnings added (withdrawable)`,
            'success',
          );
        } else if (bonusCredit > 0 || freebetCredit > 0) {
          showToast(
            `${formatInr(bonusCredit || freebetCredit)} returned to ${bonusCredit > 0 ? 'bonus' : 'freebet'} (not withdrawable at these odds)`,
            'info',
          );
        } else if (cashCredit > 0) {
          showToast(`Bet won! ${formatInr(cashCredit)} credited to balance`, 'success');
        }
      } else if (bet.status === 'lost') {
        showToast('Bet settled — better luck next time', 'info');
      }
    }

    applySettledBets(bets);
  }, [matches, placedBets, isLoggedIn, applySettledBets, creditBetWin, showToast]);

  return null;
}
