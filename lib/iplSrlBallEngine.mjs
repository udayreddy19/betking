/**
 * Module H: Ball-by-Ball Engine (IPLSRL)
 * Delivery record structures and event logging for simulated cricket deliveries.
 */

const deliveryLogs = new Map();

export function recordIPLSRLDelivery(deliveryData) {
  const {
    matchId,
    innings = 1,
    over = 0,
    ball = 1,
    striker = 'Batter',
    nonStriker = 'Partner',
    bowler = 'Bowler',
    runs = 0,
    extras = 0,
    wicket = false,
    wicketType = null,
    dismissedPlayer = null,
  } = deliveryData;

  const deliveryRecord = {
    deliveryId: `del_${matchId}_i${innings}_o${over}_b${ball}_${Date.now()}`,
    matchId,
    innings,
    over,
    ball,
    striker,
    nonStriker,
    bowler,
    runs,
    extras,
    totalRuns: runs + extras,
    wicket,
    wicketType,
    dismissedPlayer,
    timestamp: new Date().toISOString(),
  };

  if (!deliveryLogs.has(matchId)) {
    deliveryLogs.set(matchId, []);
  }

  const logs = deliveryLogs.get(matchId);
  logs.push(deliveryRecord);

  return deliveryRecord;
}

export function getIPLSRLDeliveries(matchId) {
  return deliveryLogs.get(matchId) || [];
}

export function clearIPLSRLDeliveries(matchId) {
  deliveryLogs.delete(matchId);
}
