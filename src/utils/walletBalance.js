/** Wallet breakdown for header / profile display */
export function getWalletBreakdown(user) {
  const withdrawable = user?.balance ?? 0;
  const bonus = user?.bonusBalance ?? 0;
  const freebets = user?.freebetBalance ?? 0;
  const bonusAndFreebets = bonus + freebets;
  const total = withdrawable + bonusAndFreebets;

  return {
    total,
    withdrawable,
    bonus,
    freebets,
    bonusAndFreebets,
  };
}

export function formatInr(amount) {
  return `₹${Number(amount || 0).toLocaleString('en-IN')}`;
}
