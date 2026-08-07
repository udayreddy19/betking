/**
 * Enterprise AI Support Assistant — BetKing Enterprise Platform (lib/supportAssistant.mjs)
 * Automated AI support agent responding to user questions regarding Bet Placement,
 * Settlement Rules, Wallet Withdrawals/Deposits, Bonus Wagering, Promotions,
 * and Responsible Gaming.
 */

export function handleUserSupportQuery(queryText = '', userId = 'guest') {
  const text = String(queryText).toLowerCase();

  let answer = 'Thank you for reaching out to BetKing Support! How can I assist with your account today?';
  let category = 'GENERAL';

  if (text.includes('withdraw') || text.includes('deposit') || text.includes('payout')) {
    category = 'WALLET';
    answer = 'Instant UPI & Bank deposits are available 24/7. Withdrawals are processed within 15 minutes to verified accounts.';
  } else if (text.includes('settle') || text.includes('won') || text.includes('lost')) {
    category = 'SETTLEMENT';
    answer = 'Live sports bets are settled automatically as soon as official match results are confirmed.';
  } else if (text.includes('bonus') || text.includes('freebet') || text.includes('promo')) {
    category = 'PROMOTIONS';
    answer = 'Bonus funds can be used on bets with odds >= 1.50. Check the Promotions panel for active deposit match codes!';
  } else if (text.includes('limit') || text.includes('exclude') || text.includes('gaming')) {
    category = 'RESPONSIBLE_GAMING';
    answer = 'You can set daily deposit limits or enable self-exclusion anytime in your Profile under Responsible Gaming settings.';
  }

  return {
    userId,
    query: queryText,
    category,
    response: answer,
    timestamp: new Date().toISOString(),
  };
}
