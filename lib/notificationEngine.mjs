/**
 * Enterprise Notification Engine — BetKing Sportsbook (lib/notificationEngine.mjs)
 * Manages WebSocket real-time events (Odds Changed, Goals, Wickets, Cashout Increased,
 * Market Suspensions, Bet Wins/Losses, Promotions).
 */

const NOTIFICATION_HISTORY = [];

export function dispatchSystemNotification(notification = {}) {
  const type = notification.type || 'SYSTEM_ALERT'; // 'ODDS_CHANGED', 'GOAL', 'WICKET', 'BET_WON', 'PROMO'
  const message = notification.message || 'Notification broadcast';
  const targetUser = notification.userId || 'ALL';
  const timestamp = Date.now();

  const record = {
    id: `notif_${timestamp}_${Math.floor(Math.random() * 1000)}`,
    type,
    message,
    targetUser,
    data: notification.data || {},
    timestamp,
    formattedTime: new Date(timestamp).toISOString(),
  };

  NOTIFICATION_HISTORY.push(record);
  if (NOTIFICATION_HISTORY.length > 200) NOTIFICATION_HISTORY.shift();

  return record;
}

export function getUserNotificationHistory(userId) {
  return NOTIFICATION_HISTORY.filter(
    (n) => n.targetUser === 'ALL' || n.targetUser === userId
  );
}
