/**
 * Enterprise Copy Betting Engine — BetKing Enterprise Platform (lib/copyBetting.mjs)
 * Allows users to automatically replicate bets placed by verified professional bettors with auto-stake scaling.
 */

const COPY_SUBSCRIPTIONS = new Map();

export function subscribeToProBettor(followerUserId, proUserId, maxStakePerBet = 1000) {
  let subs = COPY_SUBSCRIPTIONS.get(followerUserId) || [];
  subs.push({
    proUserId,
    maxStakePerBet,
    active: true,
    subscribedAt: new Date().toISOString(),
  });
  COPY_SUBSCRIPTIONS.set(followerUserId, subs);
  return subs;
}
