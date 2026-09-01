/**
 * Only list promo payment methods that can actually be staked from wallet buckets.
 * Stale AVAILABLE reward rows (bonus already used) must not appear on the slip.
 */
export function filterRewardsByWallet(rewards = [], { bonus = 0, freebets = 0 } = {}) {
  let bonusLeft = Number(bonus) || 0;
  let freebetLeft = Number(freebets) || 0;
  const out = [];

  for (const reward of rewards) {
    const amount = Number(reward?.amount) || 0;
    if (!(amount > 0)) continue;
    const type = String(reward.rewardType || reward.reward_type || '').toLowerCase();
    if (type === 'bonus') {
      if (bonusLeft + 1e-9 >= amount) {
        out.push(reward);
        bonusLeft = Number((bonusLeft - amount).toFixed(2));
      }
    } else if (type === 'freebet' || type === 'free_bet') {
      if (freebetLeft + 1e-9 >= amount) {
        out.push(reward);
        freebetLeft = Number((freebetLeft - amount).toFixed(2));
      }
    }
  }

  return out;
}
