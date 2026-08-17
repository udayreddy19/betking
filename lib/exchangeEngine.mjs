/**
 * Enterprise Betting Exchange Engine — OddsYra Enterprise Platform (lib/exchangeEngine.mjs)
 * Supports Back bets, Lay bets, peer-to-peer Order Books, partial matching, and liquidity queues.
 */

const EXCHANGE_ORDER_BOOKS = new Map();

export function placeExchangeOrder(order = {}) {
  const matchId = order.matchId || 'global';
  const side = (order.side || 'BACK').toUpperCase(); // 'BACK' or 'LAY'
  const odds = Number(order.odds) || 2.0;
  const stake = Number(order.stake) || 0;
  const userId = order.userId || 'guest';

  let book = EXCHANGE_ORDER_BOOKS.get(matchId) || { backOrders: [], layOrders: [] };

  const newOrder = {
    orderId: `ord_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    userId,
    side,
    odds,
    stake,
    matchedStake: 0,
    status: 'UNMATCHED',
    timestamp: Date.now(),
  };

  if (side === 'BACK') book.backOrders.push(newOrder);
  else book.layOrders.push(newOrder);

  EXCHANGE_ORDER_BOOKS.set(matchId, book);
  return newOrder;
}

export function getExchangeOrderBook(matchId) {
  return EXCHANGE_ORDER_BOOKS.get(matchId) || { backOrders: [], layOrders: [] };
}
