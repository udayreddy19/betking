/**
 * Browser Settlement Push Notification Helper
 */

import { soundEffects } from './soundEffects';

export function notifyBetOutcome(bet = {}) {
  const isWon = bet.status === 'WON';
  const payout = Number(bet.payout || 0).toLocaleString();
  const selectionName = bet.selection_name || bet.selection_id || 'Bet';

  if (isWon) {
    soundEffects.playWin();
  }

  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    const title = isWon ? '🎉 Bet Won!' : '📋 Bet Settled';
    const body = isWon
      ? `Your bet on ${selectionName} won ₹${payout}!`
      : `Your bet on ${selectionName} has been settled.`;

    try {
      new Notification(title, {
        body,
        icon: '/oddsyra-logo.png',
        badge: '/favicon-32.png',
      });
    } catch {
      // Ignored in mobile browsers that require ServiceWorker registration
    }
  }
}
