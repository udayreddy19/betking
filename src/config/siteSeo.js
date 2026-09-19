export const SITE_NAME = 'OddsYra';
export const SITE_URL = import.meta.env.VITE_SITE_URL || 'https://oddsyra.com';
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-invite-share.png`;
export const INVITE_OG_IMAGE = `${SITE_URL}/og-invite-share.png`;
export const INSTAGRAM_URL = 'https://www.instagram.com/oddsyra/';
export const INSTAGRAM_HANDLE = '@oddsyra';

export const NOINDEX_PATHS = new Set([
  '/fantasy',
  '/casino',
  '/live-casino',
  '/exchange',
]);

export const DEFAULT_META = {
  title: 'OddsYra — Live Sportsbook & Betting',
  description: 'Bet on live cricket, football, tennis and more with real-time odds, fast deposits, and responsible gaming tools. 18+ only.',
  path: '/',
};

export const ROUTE_META = {
  '/': {
    title: 'OddsYra — Live Sportsbook & Betting',
    description: 'Live cricket, football, tennis and more. Real-time odds, UPI deposits, welcome bonuses. Join OddsYra — 18+ only.',
  },
  '/sports': {
    title: 'Sports Betting — Live Odds | OddsYra',
    description: 'Browse live and upcoming sports markets with real-time odds updates on cricket, football, tennis, and more.',
  },
  '/live-betting': {
    title: 'Live Betting — In-Play Odds | OddsYra',
    description: 'In-play betting with live scores and fast odds updates across top sports leagues on OddsYra. 18+ only.',
  },
  '/invite': {
    title: 'Invite Friends & Earn | OddsYra',
    description: 'Share your OddsYra invite link. Friends get a Free Bet; you earn when they play. Live cricket betting with UPI. 18+ only.',
  },
  '/live-cricket-betting': {
    title: 'Live Cricket Betting India | OddsYra',
    description: 'Bet on live cricket with real-time odds, UPI deposits, welcome offers, and responsible gaming tools on OddsYra. 18+ only.',
  },
  '/how-to-bet-live-cricket': {
    title: 'How to Bet Live Cricket | OddsYra',
    description: 'Step-by-step guide to live cricket betting on OddsYra — register, UPI deposit, pick a market, place your first stake. 18+ only.',
  },
  '/upi-deposits': {
    title: 'UPI Deposits | OddsYra',
    description: 'Fund OddsYra with Instant UPI — Google Pay, PhonePe, Paytm, BHIM. Fast credits for live cricket. 18+ only.',
  },
  '/what-is-oddsyra-srl': {
    title: 'What is OddsYra SRL? | OddsYra',
    description: 'OddsYra SRL is an on-platform simulated cricket league with fixtures, points, live boards, and in-play betting. 18+ only.',
  },
  '/cricket-betting-guide': {
    title: 'Cricket Betting Guide India | OddsYra',
    description: 'OddsYra cricket betting basics — markets, UPI, invites, and responsible gaming for India. 18+ only.',
  },
  '/register': {
    title: 'Create Account | OddsYra',
    description: 'Sign up for OddsYra in minutes. Bet on live sports with secure payments and welcome offers. 18+ only.',
  },
  '/promotions': {
    title: 'Promotions & Bonuses | OddsYra',
    description: 'Welcome bonuses, free bets, and weekly promotions for sports betting on OddsYra. Terms apply. 18+ only.',
  },
  '/srl': {
    title: 'OddsYra SRL — Simulated Cricket | OddsYra',
    description: 'OddsYra SRL — league matches and playoffs, points table, live scores, and in-play betting with no external score feed.',
  },
  '/fantasy': {
    title: 'Fantasy Sports | OddsYra',
    description: 'Fantasy contests coming soon on OddsYra. Bet live cricket on Sports in the meantime.',
    robots: 'noindex,follow',
  },
  '/casino': {
    title: 'Casino | OddsYra',
    description: 'Casino coming soon on OddsYra.',
    robots: 'noindex,follow',
  },
  '/live-casino': {
    title: 'Live Casino | OddsYra',
    description: 'Live casino coming soon on OddsYra.',
    robots: 'noindex,follow',
  },
  '/exchange': {
    title: 'Exchange | OddsYra',
    description: 'Exchange is not available on OddsYra.',
    robots: 'noindex,follow',
  },
  '/vip': {
    title: 'VIP Club | OddsYra',
    description: 'OddsYra VIP rewards — cashback, exclusive perks, and priority support for loyal sportsbook players. 18+ only.',
  },
  '/terms': {
    title: 'Terms & Conditions | OddsYra',
    description: 'OddsYra terms and conditions for sports betting, bonuses, withdrawals, and account use. 18+ only.',
  },
  '/privacy': {
    title: 'Privacy Policy | OddsYra',
    description: 'How OddsYra collects, uses, and protects your personal data for accounts, payments, KYC, and fraud prevention. 18+ only.',
  },
  '/responsible-gaming': {
    title: 'Responsible Gaming | OddsYra',
    description: 'Deposit limits, reality checks, self-exclusion, and support resources for safer betting on OddsYra. 18+ only.',
  },
  '/help': {
    title: 'Help & Support | OddsYra',
    description: 'Get help with deposits, withdrawals, KYC, betting markets, and account issues on OddsYra. 18+ only.',
  },
};

export function metaForPath(pathname) {
  const base = ROUTE_META[pathname] || DEFAULT_META;
  const robots = base.robots
    || (NOINDEX_PATHS.has(pathname) ? 'noindex,follow' : 'index,follow');
  return {
    title: base.title || DEFAULT_META.title,
    description: base.description || DEFAULT_META.description,
    path: pathname || '/',
    robots,
    ogImage: pathname === '/invite' ? INVITE_OG_IMAGE : DEFAULT_OG_IMAGE,
  };
}
