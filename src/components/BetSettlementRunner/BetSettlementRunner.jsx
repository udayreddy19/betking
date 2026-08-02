import { useEffect, useRef } from 'react';
import { useLiveMatches } from '../../context/LiveSportsContext';
import { useBetSlip } from '../../context/BetSlipContext';
import { useAuth } from '../../context/AuthContext';
import { settleAllPlacedBets } from '../../utils/betSettlement';

/** Settles pending bets when live score data marks matches complete. */
export default function BetSettlementRunner() {
  const matches = useLiveMatches();
  const { placedBets, applySettledBets } = useBetSlip();
  const { updateUserBalance, showToast, isLoggedIn } = useAuth();
  const creditedRef = useRef(new Set());

  useEffect(() => {
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
        updateUserBalance(bet.payout);
        showToast(`Bet won! ₹${bet.payout.toLocaleString('en-IN')} credited`, 'success');
      } else if (bet.status === 'lost') {
        showToast('Bet settled — better luck next time', 'info');
      }
    }

    applySettledBets(bets);
  }, [matches, placedBets, isLoggedIn, applySettledBets, updateUserBalance, showToast]);

  return null;
}
