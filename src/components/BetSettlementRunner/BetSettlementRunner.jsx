import { useEffect, useRef } from 'react';
import { useLiveMatches } from '../../context/LiveSportsContext';
import { useBetSlip } from '../../context/BetSlipContext';
import { useAuth } from '../../context/AuthContext';
import { settleAllPlacedBets } from '../../utils/betSettlement';
import { formatInr } from '../../utils/walletBalance';

/** Settles pending bets when live score data marks matches complete. */
export default function BetSettlementRunner() {
  const matches = useLiveMatches();
  const { placedBets, applySettledBets } = useBetSlip();
  const { creditBetWin, showToast, isLoggedIn } = useAuth();
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
        const { cashCredit, bonusCredit } = creditBetWin(bet);
        if (cashCredit > 0 && bonusCredit > 0) {
          showToast(
            `Bet won! ${formatInr(cashCredit)} withdrawable + ${formatInr(bonusCredit)} bonus credited`,
            'success',
          );
        } else if (cashCredit > 0) {
          showToast(`Bet won! ${formatInr(cashCredit)} credited to wallet`, 'success');
        } else if (bonusCredit > 0) {
          showToast(
            `${formatInr(bonusCredit)} returned to bonus (winnings not withdrawable at these odds)`,
            'info',
          );
        }
      } else if (bet.status === 'lost') {
        showToast('Bet settled — better luck next time', 'info');
      }
    }

    applySettledBets(bets);
  }, [matches, placedBets, isLoggedIn, applySettledBets, creditBetWin, showToast]);

  return null;
}
