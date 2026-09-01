/** Money-safe support macros — never credit cash. */

export const SUPPORT_MACROS = [
  {
    id: 'bet_in_play',
    label: 'Bet still in play',
    text: 'Your bet is still in play. It will settle automatically when the official result is confirmed. I cannot change the result from chat.',
  },
  {
    id: 'withdrawal_review',
    label: 'Withdrawal in review',
    text: 'Your withdrawal is in the finance review queue. Approval is maker-checker controlled. I cannot release funds from this chat.',
  },
  {
    id: 'promo_wagering',
    label: 'Promo wagering remaining',
    text: 'Bonus funds require wagering before they become withdrawable. Check Wallet → bonus balance for remaining turnover. I cannot skip wagering from chat.',
  },
  {
    id: 'kyc_pending',
    label: 'KYC pending',
    text: 'Identity review is manual. Withdrawals stay on hold until KYC is approved. I cannot mark documents as verified from chat.',
  },
  {
    id: 'cashout_unavailable',
    label: 'Cash out unavailable',
    text: 'Cash out is offered only when the market is still open and the bet is cash-funded. Bonus and free-bet stakes cannot be cashed out.',
  },
];

export function getSupportMacro(id) {
  return SUPPORT_MACROS.find((m) => m.id === id) || null;
}
