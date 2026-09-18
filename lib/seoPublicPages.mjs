/**
 * Public SEO page bodies for crawlers / OpenSEO / Google.
 * Shared by post-build static shells and optional runtime crawler endpoint.
 */

export const SEO_NAV = [
  { href: '/', label: 'Home' },
  { href: '/sports', label: 'Sports' },
  { href: '/live-betting', label: 'Live Betting' },
  { href: '/live-cricket-betting', label: 'Live Cricket Betting' },
  { href: '/srl', label: 'OddsYra SRL' },
  { href: '/promotions', label: 'Promotions' },
  { href: '/invite', label: 'Invite' },
  { href: '/register', label: 'Register' },
  { href: '/vip', label: 'VIP' },
  { href: '/help', label: 'Help' },
  { href: '/responsible-gaming', label: 'Responsible Gaming' },
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
];

/** @type {Record<string, { title: string, h1: string, description: string, paragraphs: string[] }>} */
export const SEO_PUBLIC_PAGES = {
  '/': {
    title: 'OddsYra — Live Sportsbook & Betting',
    h1: 'Live cricket betting and sportsbook',
    description:
      'Live cricket, football, tennis and more. Real-time odds, UPI deposits, welcome bonuses. Join OddsYra — 18+ only.',
    paragraphs: [
      'OddsYra is an online sportsbook for India-first players who want live cricket markets, fast UPI deposits, and clear odds.',
      'Open Sports for upcoming fixtures, Live Betting for in-play markets, or OddsYra SRL for simulated league cricket with desk-run markets.',
      'New players can create an account in minutes. Invite friends to share rewards, and use Responsible Gaming tools including deposit limits and self-exclusion.',
      'Gambling involves risk. 18+ only. Play responsibly.',
    ],
  },
  '/sports': {
    title: 'Sports Betting — Live Odds | OddsYra',
    h1: 'Sports betting with live odds',
    description:
      'Browse live and upcoming sports markets with real-time odds updates on cricket, football, tennis, and more.',
    paragraphs: [
      'The OddsYra sports board lists live and upcoming fixtures across cricket and other sports with markets you can bet as soon as the book is open.',
      'Filter by sport or league, open a match for Match Winner and in-play selections, and follow score updates while you bet.',
      'Prefer in-play only? Go to Live Betting. Prefer simulated cricket? Open OddsYra SRL.',
    ],
  },
  '/live-betting': {
    title: 'Live Betting — In-Play Odds | OddsYra',
    h1: 'Live in-play betting',
    description:
      'In-play betting with live scores and fast odds updates across top sports leagues.',
    paragraphs: [
      'Live Betting focuses on matches already underway — odds move with the game so you can react to wickets, goals, and momentum.',
      'Use the sports board for pre-match markets, then switch here when you want in-play action.',
      'UPI deposits keep funding quick so you can join a market without waiting on bank transfers.',
    ],
  },
  '/live-cricket-betting': {
    title: 'Live Cricket Betting India | OddsYra',
    h1: 'Live cricket betting in India',
    description:
      'Bet on live cricket with real-time odds, UPI deposits, welcome offers, and responsible gaming tools on OddsYra. 18+ only.',
    paragraphs: [
      'Bet on live and upcoming cricket with real-time odds, fast UPI deposits, and responsible gaming tools. OddsYra is for adults 18+ only.',
      'Why players use OddsYra: in-play cricket markets, verified UPI rails, welcome offers, and an invite program where friends can earn when you play.',
      'How to start: register, complete KYC when prompted, deposit via UPI, open Sports or Live Betting, pick a market, and place your stake.',
      'Prefer simulated cricket? Try OddsYra SRL for league-style fixtures with in-play markets.',
    ],
  },
  '/srl': {
    title: 'OddsYra SRL — Simulated Cricket | OddsYra',
    h1: 'OddsYra SRL simulated cricket league',
    description:
      'OddsYra SRL — league matches and playoffs, points table, live scores, and in-play betting with no external score feed.',
    paragraphs: [
      'OddsYra SRL is our simulated cricket league: fixtures, points table, live boards, and in-play markets operated on-platform.',
      'Follow the schedule, watch the scoreboard update, and bet Match Winner and related markets while the game runs.',
      'Combine SRL with live sports markets from the main Sports board when you want real-world fixtures too.',
    ],
  },
  '/invite': {
    title: 'Invite Friends & Earn | OddsYra',
    h1: 'Invite friends and earn on OddsYra',
    description:
      'Share your OddsYra invite link. Friends get a Free Bet; you earn when they play. Live cricket betting with UPI. 18+ only.',
    paragraphs: [
      'Share your personal invite link from Invite or Profile. Friends who join with your code can unlock a signup reward after they meet program rules.',
      'You earn when they join — and a share of their cash stakes when they play, subject to daily caps and fraud checks.',
      'Already have a friend’s code? Open Register with their link, or paste the code during signup.',
    ],
  },
  '/register': {
    title: 'Create Account | OddsYra',
    h1: 'Create your OddsYra account',
    description:
      'Sign up for OddsYra in minutes. Bet on live sports with secure payments and welcome offers. 18+ only.',
    paragraphs: [
      'Create a free OddsYra account with email or Google. You must be 18+ and accept the Terms to bet.',
      'After signup you can deposit with UPI, browse Sports and Live Betting, and claim eligible welcome or invite rewards.',
      'Need help? Visit Help or Responsible Gaming for limits and account safety tools.',
    ],
  },
  '/promotions': {
    title: 'Promotions & Bonuses | OddsYra',
    h1: 'Promotions and bonuses',
    description:
      'Welcome bonuses, free bets, and weekly promotions for sports betting on OddsYra.',
    paragraphs: [
      'OddsYra promotions include welcome offers, deposit bonuses, free bets, and seasonal campaigns when active.',
      'Always read the offer terms — wagering, eligibility, and expiry rules apply. Invite rewards cannot always be combined with signup promos.',
      'Browse live markets on Sports while your promo balance or free bet is active.',
    ],
  },
  '/vip': {
    title: 'VIP Club | OddsYra',
    h1: 'OddsYra VIP club',
    description:
      'OddsYra VIP rewards — cashback, exclusive perks, and priority support for loyal players.',
    paragraphs: [
      'The VIP club rewards loyal OddsYra players with tiered perks such as cashback, priority support, and exclusive offers as you play.',
      'Progress by staking on sports markets. Check your Profile for current tier status when logged in.',
    ],
  },
  '/help': {
    title: 'Help & Support | OddsYra',
    h1: 'Help and support',
    description:
      'Get help with deposits, withdrawals, KYC, betting, and account issues on OddsYra.',
    paragraphs: [
      'Find answers for deposits, withdrawals, KYC, betting markets, and account access.',
      'For safer play tools — deposit limits, cooling-off, self-exclusion — see Responsible Gaming.',
      'Legal documents: Terms and Privacy. To start betting, create an account on Register.',
    ],
  },
  '/responsible-gaming': {
    title: 'Responsible Gaming | OddsYra',
    h1: 'Responsible gaming',
    description:
      'Deposit limits, reality checks, self-exclusion, and support resources for safer betting.',
    paragraphs: [
      'OddsYra provides deposit limits, reality checks, cooling-off periods, and self-exclusion so you can stay in control.',
      'If gambling stops being fun, use these tools or seek external help. 18+ only.',
      'Account and product help lives on the Help page. Terms cover account rules.',
    ],
  },
  '/terms': {
    title: 'Terms & Conditions | OddsYra',
    h1: 'Terms and conditions',
    description:
      'OddsYra terms and conditions for sports betting, bonuses, and account use.',
    paragraphs: [
      'These Terms govern your use of OddsYra, including accounts, betting, bonuses, and withdrawals.',
      'By creating an account you confirm you are 18+ and agree to these Terms and our Privacy Policy.',
      'For product help see Help. For safer play tools see Responsible Gaming.',
    ],
  },
  '/privacy': {
    title: 'Privacy Policy | OddsYra',
    h1: 'Privacy policy',
    description:
      'How OddsYra collects, uses, and protects your personal data.',
    paragraphs: [
      'This Privacy Policy explains what data OddsYra collects, how we use it for accounts and payments, and your choices.',
      'We process data needed to run the sportsbook, prevent fraud, and meet legal obligations.',
      'Related pages: Terms, Help, and Responsible Gaming.',
    ],
  },
};

export function normalizeSeoPath(pathname = '/') {
  let p = String(pathname || '/').split('?')[0].split('#')[0] || '/';
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  if (!p.startsWith('/')) p = `/${p}`;
  return p || '/';
}

export function getSeoPublicPage(pathname) {
  const path = normalizeSeoPath(pathname);
  return SEO_PUBLIC_PAGES[path] || null;
}
