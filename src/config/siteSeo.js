export const SITE_NAME = 'OddsYra';
export const SITE_URL = import.meta.env.VITE_SITE_URL || 'https://oddsyra.com';
export const DEFAULT_OG_IMAGE = `${SITE_URL}/oddsyra-logo.png`;

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
    description: 'In-play betting with live scores and fast odds updates across top sports leagues.',
  },
  '/register': {
    title: 'Create Account | OddsYra',
    description: 'Sign up for OddsYra in minutes. Bet on live sports with secure payments and welcome offers. 18+ only.',
  },
  '/promotions': {
    title: 'Promotions & Bonuses | OddsYra',
    description: 'Welcome bonuses, free bets, and weekly promotions for sports betting on OddsYra.',
  },
  '/srl': {
    title: 'OddsYra SRL — Simulated Cricket | OddsYra',
    description: 'OddsYra SRL begins 10 September. 70 league matches and 4 playoffs, points table, live scores, and in-play betting — no external score feed.',
  },
  '/fantasy': {
    title: 'Fantasy Sports | OddsYra',
    description: 'Build fantasy teams and compete across cricket and football on OddsYra.',
  },
  '/vip': {
    title: 'VIP Club | OddsYra',
    description: 'OddsYra VIP rewards — cashback, exclusive perks, and priority support for loyal players.',
  },
  '/terms': {
    title: 'Terms & Conditions | OddsYra',
    description: 'OddsYra terms and conditions for sports betting, bonuses, and account use.',
  },
  '/privacy': {
    title: 'Privacy Policy | OddsYra',
    description: 'How OddsYra collects, uses, and protects your personal data.',
  },
  '/responsible-gaming': {
    title: 'Responsible Gaming | OddsYra',
    description: 'Deposit limits, reality checks, self-exclusion, and support resources for safer betting.',
  },
  '/help': {
    title: 'Help & Support | OddsYra',
    description: 'Get help with deposits, withdrawals, KYC, betting, and account issues on OddsYra.',
  },
};

export function metaForPath(pathname) {
  const base = ROUTE_META[pathname] || DEFAULT_META;
  return {
    title: base.title || DEFAULT_META.title,
    description: base.description || DEFAULT_META.description,
    path: pathname || '/',
  };
}
