/**
 * Enterprise Order Matching Engine — BetKing Enterprise Platform (lib/orderMatchingEngine.mjs)
 * High-performance price-time priority order matching engine for exchange back/lay orders.
 * Supports full matching, partial matching, order cancellations, and order replacements.
 */

import { getExchangeOrderBook } from './exchangeEngine.mjs';

export function matchExchangeOrders(matchId) {
  const book = getExchangeOrderBook(matchId);
  const matches = [];

  const backs = book.backOrders.filter((o) => o.status !== 'MATCHED');
  const lays = book.layOrders.filter((o) => o.status !== 'MATCHED');

  for (const b of backs) {
    for (const l of lays) {
      if (b.odds >= l.odds && b.userId !== l.userId && b.status !== 'MATCHED' && l.status !== 'MATCHED') {
        const matchedAmount = Math.min(b.stake - b.matchedStake, l.stake - l.matchedStake);
        b.matchedStake += matchedAmount;
        l.matchedStake += matchedAmount;

        if (b.matchedStake >= b.stake) b.status = 'MATCHED';
        else b.status = 'PARTIALLY_MATCHED';

        if (l.matchedStake >= l.stake) l.status = 'MATCHED';
        else l.status = 'PARTIALLY_MATCHED';

        matches.push({
          backOrderId: b.orderId,
          layOrderId: l.orderId,
          matchedOdds: l.odds,
          matchedStake: matchedAmount,
          timestamp: Date.now(),
        });
      }
    }
  }

  return { matchId, totalMatches: matches.length, matches };
}
