/**
 * Public SEO page bodies for crawlers / OpenSEO / Google.
 * Shared by post-build static shells and optional runtime crawler endpoint.
 * Aim for ~300+ visible words per page so thin-content audits clear.
 */

export const SEO_NAV = [
  { href: '/', label: 'Home' },
  { href: '/sports', label: 'Sports' },
  { href: '/live-betting', label: 'Live Betting' },
  { href: '/live-cricket-betting', label: 'Live Cricket Betting' },
  { href: '/how-to-bet-live-cricket', label: 'How to Bet Live Cricket' },
  { href: '/upi-deposits', label: 'UPI Deposits' },
  { href: '/what-is-oddsyra-srl', label: 'What is OddsYra SRL' },
  { href: '/cricket-betting-guide', label: 'Cricket Betting Guide' },
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
      'OddsYra is an online sportsbook built for players in India who want live cricket markets, clear prices, and fast UPI deposits. Whether you follow T20 leagues, international series, or domestic fixtures, the goal is simple: open a match, see the book, and place a stake without friction.',
      'Start on Sports for the full board of live and upcoming fixtures. Switch to Live Betting when you want in-play markets that move with wickets, partnerships, and momentum. Prefer a fully on-platform cricket product? OddsYra SRL runs a simulated league with schedule, points table, live boards, and desk-operated markets.',
      'New players can create an account in minutes with email or Google, then fund with UPI when ready. Welcome offers and seasonal promotions appear on Promotions when active. Invite friends from the Invite page — they can unlock a signup reward, and you can earn when they play, subject to program rules and caps.',
      'Safer play is part of the product. Use Responsible Gaming tools for deposit limits, cooling-off, and self-exclusion. Read the Terms and Privacy Policy before you bet. Gambling involves risk — only stake what you can afford to lose. OddsYra is for adults 18+ only.',
      'Looking for a focused cricket landing page? See Live Cricket Betting for a step-by-step overview of how live markets, UPI, and invites work together on OddsYra.',
    ],
  },
  '/sports': {
    title: 'Sports Betting — Live Odds | OddsYra',
    h1: 'Sports betting with live odds',
    description:
      'Browse live and upcoming sports markets with real-time odds updates on cricket, football, tennis, and more.',
    paragraphs: [
      'The OddsYra sports board is the main place to browse fixtures. You will see live matches and upcoming events across cricket and other sports, with markets that open when the book is ready. Open a match to review Match Winner and related selections, then add a stake from the bet slip.',
      'Use sport and league filters to focus on what you follow. Deep links from schedules and SRL fixtures land on the same board so you can move between simulated and live sports without losing context. Odds update as feeds and desk controls change — always confirm the price before you confirm the bet.',
      'When a game is already underway, Live Betting highlights in-play opportunities. For cricket-specific guidance — UPI deposits, invite rewards, and how to place your first stake — read Live Cricket Betting. New to OddsYra? Create an account on Register, then return here once you are funded.',
      'Promotions and free bets may apply to eligible markets when an offer is active. Check Promotions for terms, and use Responsible Gaming if you want limits before you play. Help covers deposits, KYC, and withdrawals if something looks wrong.',
    ],
  },
  '/live-betting': {
    title: 'Live Betting — In-Play Odds | OddsYra',
    h1: 'Live in-play betting',
    description:
      'In-play betting with live scores and fast odds updates across top sports leagues on OddsYra. 18+ only.',
    paragraphs: [
      'Live Betting is for markets that are already in play. Prices move with the match so you can react to wickets, overs, goals, or set changes instead of waiting for a pre-match line. Live scores and board status help you decide whether a selection still makes sense before you lock the stake.',
      'Use the main Sports board for pre-match discovery, then jump here when you want in-play only. Cricket remains the core focus for many OddsYra players — pair this page with Live Cricket Betting for deposit and account tips. Simulated league cricket with continuous boards lives on OddsYra SRL.',
      'Funding should not slow you down mid-match. UPI deposits are designed for quick top-ups so you can join a market while the book is still open. If a market suspends, wait for it to reopen or pick another selection — never force a stake on a locked price.',
      'Responsible play still applies in-play. Set deposit limits before a busy session, take breaks, and use cooling-off or self-exclusion if needed. Account and payment questions are covered on Help; legal rules are in Terms.',
    ],
  },
  '/live-cricket-betting': {
    title: 'Live Cricket Betting India | OddsYra',
    h1: 'Live cricket betting in India',
    description:
      'Bet on live cricket with real-time odds, UPI deposits, welcome offers, and responsible gaming tools on OddsYra. 18+ only.',
    paragraphs: [
      'Live cricket betting on OddsYra means real-time odds on matches that are about to start or already underway, with UPI deposits and tools to keep play under control. The product is for adults 18+ in supported markets only.',
      'Why players use OddsYra for cricket: in-play markets that update as the innings unfold, a clear sports board for fixtures, verified UPI payment rails, welcome and seasonal offers when available, and an invite program where friends can unlock rewards and you can earn when they play under program rules.',
      'How to start: create an account on Register, deposit via UPI, open Sports or Live Betting, pick a cricket market, set your stake, and confirm. Prefer simulated cricket with a full league calendar? Open OddsYra SRL for fixtures, points, and desk-run markets.',
      'Invite friends from Invite or Profile if you want to share a tracked link. Always read promotion terms on Promotions — wagering and eligibility rules apply, and invite rewards may not combine with every signup promo. For safer play, use Responsible Gaming limits before a long session.',
      'Need help with a deposit, withdrawal, or market that will not open? Visit Help. Legal documents live under Terms and Privacy. Step-by-step guides: How to Bet Live Cricket, UPI Deposits, and Cricket Betting Guide.',
    ],
  },
  '/how-to-bet-live-cricket': {
    title: 'How to Bet Live Cricket | OddsYra',
    h1: 'How to bet live cricket on OddsYra',
    description:
      'Step-by-step guide to live cricket betting on OddsYra — register, UPI deposit, pick a market, and place your first stake. 18+ only.',
    paragraphs: [
      'This guide walks through live cricket betting on OddsYra from signup to your first in-play stake. You must be 18 or older. Gambling involves risk — only stake what you can afford to lose.',
      'Step one: create an account with email or Google and confirm your date of birth. Step two: deposit with UPI when you are ready. Step three: open Sports or Live Betting, choose a cricket match, pick a market such as Match Winner, set a stake, and confirm the bet slip.',
      'In-play prices move with wickets and overs. Confirm the odds before you lock, and wait if a market suspends. Track open bets in My Bets; settlements credit your wallet automatically.',
      'Prefer simulated league cricket? OddsYra SRL runs fixtures and desk-operated markets on-platform. For funding details see UPI Deposits. For safer play tools and India helplines see Responsible Gaming.',
    ],
  },
  '/upi-deposits': {
    title: 'UPI Deposits | OddsYra',
    h1: 'UPI deposits on OddsYra',
    description:
      'Fund your OddsYra wallet with Instant UPI — Google Pay, PhonePe, Paytm, BHIM. Fast credits for live cricket betting. 18+ only.',
    paragraphs: [
      'OddsYra supports Instant UPI deposits so you can fund cricket and sports markets without waiting on bank transfers. Choose Instant UPI in Deposit, enter an amount, complete payment in your UPI app, and return — credits usually appear shortly after confirmation.',
      'Add a mobile number before depositing if you signed up with Google. KYC is required for withdrawals and higher limits, not for placing your first funded bets after a successful deposit.',
      'After you deposit, open Live Betting or Sports for cricket markets, or follow How to Bet Live Cricket for a full walkthrough. Invite friends from Invite — rewards unlock after they deposit under program rules.',
      'If a payment deducted but did not credit, contact Help with the UTR or reference. Set deposit limits on Responsible Gaming before high-volume sessions.',
    ],
  },
  '/what-is-oddsyra-srl': {
    title: 'What is OddsYra SRL? | OddsYra',
    h1: 'What is OddsYra SRL?',
    description:
      'OddsYra SRL is an on-platform simulated cricket league with fixtures, points, live boards, and in-play betting. 18+ only.',
    paragraphs: [
      'OddsYra SRL is our simulated cricket league: a season of fixtures, a points table, live scoreboards, and in-play markets operated on-platform. The core board does not depend on an external live score provider.',
      'Follow the schedule, open a match, and bet Match Winner and related markets while the game runs. Desk controls can lock toss and markets under liability rules. Results settle into your wallet like other OddsYra sports bets.',
      'SRL sits alongside the main Sports board. Use Sports and Live Betting for real-world cricket; use SRL for continuous league-style cricket with OddsYra-operated boards. Register, deposit with UPI, then open SRL to start.',
      'Promotions may apply when an offer says so. Safer play tools remain on Responsible Gaming. More cricket how-tos live on Live Cricket Betting and How to Bet Live Cricket.',
    ],
  },
  '/cricket-betting-guide': {
    title: 'Cricket Betting Guide India | OddsYra',
    h1: 'Cricket betting guide for India',
    description:
      'OddsYra cricket betting basics — markets, UPI funding, invites, and responsible gaming for players in India. 18+ only.',
    paragraphs: [
      'This cricket betting guide covers how OddsYra works for players in India: pre-match and in-play markets on Sports and Live Betting, UPI deposits, invite rewards, and safer play tools. Adults 18+ only.',
      'Start with Register, fund via UPI Deposits, then follow How to Bet Live Cricket for your first stake. Simulated league cricket is explained on What is OddsYra SRL.',
      'Invite friends from Invite — rewards unlock after they deposit under program rules. Read Promotions terms before claiming offers. Never chase losses; use Responsible Gaming limits and India helplines when needed.',
      'Account and payment questions are covered on Help. Product rules are in Terms. OddsYra is entertainment — only stake what you can afford to lose.',
    ],
  },
  '/srl': {
    title: 'OddsYra SRL — Simulated Cricket | OddsYra',
    h1: 'OddsYra SRL simulated cricket league',
    description:
      'OddsYra SRL — league matches and playoffs, points table, live scores, and in-play betting with no external score feed.',
    paragraphs: [
      'OddsYra SRL is our simulated cricket league: a season of fixtures, a points table, live scoreboards, and in-play markets operated on-platform. There is no dependency on an external live score provider for the core SRL board — the desk and simulation drive the match state you see.',
      'Follow the schedule, open a match centre view, and bet Match Winner and related markets while the game runs. Auto and manual desk controls can lock toss and markets under liability rules so the book stays healthy. After the match, results settle into your wallet like other OddsYra sports bets.',
      'SRL sits alongside the main Sports board. Use Sports and Live Betting for real-world cricket and other sports; use SRL when you want continuous league-style cricket with OddsYra-operated boards. New players should Register first, then deposit with UPI before staking.',
      'Promotions may apply to eligible SRL markets when an offer says so. Invite earnings still follow the referral program rules. Read Responsible Gaming before high-volume sessions, and see Help if a market or settlement needs support.',
    ],
  },
  '/invite': {
    title: 'Invite Friends & Earn | OddsYra',
    h1: 'Invite friends and earn on OddsYra',
    description:
      'Share your OddsYra invite link. Friends get a Free Bet; you earn when they play. Live cricket betting with UPI. 18+ only.',
    paragraphs: [
      'The OddsYra invite program is how players bring friends onto the sportsbook. After you register, open Invite or Profile to copy your personal link or share it on WhatsApp and Telegram. Friends who join with your code can unlock a signup reward after they meet program rules such as deposit or KYC where required.',
      'You can earn when they join and a share of their cash stakes when they play. Campaigns sometimes multiply referred rewards for a limited window — check the Invite page for any active boost, caps, and milestones. Fraud holds, daily caps, and clawbacks exist so the program stays fair for everyone.',
      'Already have a friend’s code? Open Register with their invite link, or paste the code during signup. Invite rewards usually cannot be combined with certain signup promos — clear the promo field if your referral is active.',
      'Invites work best when friends actually play cricket and sports markets. Point them to Live Cricket Betting or Sports after they join. For account issues, use Help; for limits, use Responsible Gaming.',
    ],
  },
  '/register': {
    title: 'Create Account | OddsYra',
    h1: 'Create your OddsYra account',
    description:
      'Sign up for OddsYra in minutes. Bet on live sports with secure payments and welcome offers. 18+ only.',
    paragraphs: [
      'Create a free OddsYra account with email and password or continue with Google. You must be 18 or older and accept the Terms and Privacy Policy before you can bet. Phone verification and KYC may be required for withdrawals and some rewards.',
      'After signup you can deposit with UPI, browse Sports and Live Betting, and claim eligible welcome or invite rewards. If you arrived through a friend’s link, your referral code should already be filled — keep it if you want the invite reward path instead of a conflicting signup promo.',
      'Next steps many players take: fund a small UPI deposit, open a cricket market, and place a careful first stake. Explore Promotions for active offers, Invite to share your own link later, and Responsible Gaming to set limits from day one.',
      'Stuck on verification, password reset, or a deposit that did not credit? Help walks through common account and payment issues. OddsYra is for adults only — if gambling stops being fun, pause and use the safer play tools.',
    ],
  },
  '/vip': {
    title: 'VIP Club | OddsYra',
    h1: 'OddsYra VIP club',
    description:
      'OddsYra VIP rewards — cashback, exclusive perks, and priority support for loyal sportsbook players. 18+ only.',
    paragraphs: [
      'The OddsYra VIP club rewards players who stake consistently on sports markets. As you move through tiers you may unlock cashback, exclusive offers, and faster support paths. Exact benefits depend on the current VIP schedule and your activity.',
      'Progress typically comes from real-money sports staking — cricket and other sports on the main board, plus eligible SRL markets when included. Check your Profile when logged in for tier status. Promotions and invite earnings are separate programs and may have their own rules.',
      'VIP is not a substitute for responsible play. Higher volume means you should still use deposit limits and session breaks. If you need help understanding a perk or claim, open Help or speak with support.',
      'New to OddsYra? Register, explore Sports, and grow into VIP over time. Safer play tools remain available on Responsible Gaming for every tier. Live Cricket Betting explains how to fund and place your first cricket stakes before you worry about tier status.',
      'Cashback and perk claims, when available, appear in your account after settlement windows close. Always confirm the VIP terms shown in-product — schedules can change between seasons.',
    ],
  },
  '/help': {
    title: 'Help & Support | OddsYra',
    h1: 'Help and support',
    description:
      'Get help with deposits, withdrawals, KYC, betting markets, and account issues on OddsYra. 18+ only.',
    paragraphs: [
      'This Help centre covers the practical questions players ask most: how deposits and UPI credits work, when withdrawals need KYC, why a market is suspended, how free bets settle, and how to recover account access. If something looks wrong on a bet or payment, gather the time and reference ID before contacting support.',
      'Safer play tools — deposit limits, cooling-off, self-exclusion — live on Responsible Gaming. Product rules for bonuses and accounts are in Terms; data handling is in Privacy. To start betting, create an account on Register, then open Sports or Live Betting.',
      'Cricket-focused how-tos sit on Live Cricket Betting. Invite and referral questions are answered on Invite. Promotions explains offer terms when a campaign is active.',
      'OddsYra support exists to unblock accounts and payments — not to encourage chasing losses. If you feel out of control, use self-exclusion and seek external help.',
      'For simulated league cricket questions — toss locks, desk markets, or settlement on SRL fixtures — start on OddsYra SRL, then contact support with the match ID if the board and your bet history disagree.',
    ],
  },
  '/promotions': {
    title: 'Promotions & Bonuses | OddsYra',
    h1: 'Promotions and bonuses',
    description:
      'Welcome bonuses, free bets, and weekly promotions for sports betting on OddsYra. Terms apply. 18+ only.',
    paragraphs: [
      'OddsYra promotions can include welcome offers, deposit bonuses, free bets, and seasonal campaigns when they are live. Each offer has its own eligibility, wagering, expiry, and market rules — always read the full terms on the offer card before you opt in.',
      'Invite rewards and signup promos often cannot be stacked. If you joined with a referral code, you may need to skip a conflicting promo chip at registration. Free bets and bonus balances usually have stake or settlement rules that differ from cash — the bet slip will show what you are using.',
      'Promotions are meant to enhance sports betting on cricket and other markets, not replace bankroll discipline. Pair offers with Live Betting or Sports, and keep Responsible Gaming limits in place. VIP perks for loyal players are separate and tracked on the VIP page.',
      'Questions about a credit that did not appear, or an offer that expired? Contact support via Help. Legal framing for bonuses sits in the Terms.',
      'When a campaign ends, unused promo credits may expire automatically. Check the offer end date and any play-through requirements before you deposit solely to unlock a bonus.',
    ],
  },
  '/responsible-gaming': {
    title: 'Responsible Gaming | OddsYra',
    h1: 'Responsible gaming',
    description:
      'Deposit limits, reality checks, self-exclusion, and support resources for safer betting on OddsYra. 18+ only.',
    paragraphs: [
      'Responsible gaming on OddsYra means you stay in control of time and money. Set deposit limits that match your budget, use reality checks during long sessions, take cooling-off breaks, or self-exclude if you need a hard stop. These tools apply across sports betting, including cricket and SRL.',
      'Gambling should stay entertainment. Never stake money you need for rent, bills, or essentials. If you chase losses, hide play from family, or feel anxious when you are not betting, pause immediately and use self-exclusion. External support organisations can help beyond the product tools.',
      'Account and payment help remains on Help. Product rules are in Terms. Privacy explains how we handle data related to limits and exclusions. New players should Register only if they are 18+ and ready to play within limits from day one.',
      'Explore Sports when you are ready — and walk away when you are not. OddsYra will not remove genuine safer-play protections to let a bet through.',
    ],
  },
  '/terms': {
    title: 'Terms & Conditions | OddsYra',
    h1: 'Terms and conditions',
    description:
      'OddsYra terms and conditions for sports betting, bonuses, withdrawals, and account use. 18+ only.',
    paragraphs: [
      'These Terms govern your use of OddsYra, including account creation, sports betting, simulated SRL markets, bonuses, invites, deposits, and withdrawals. By registering you confirm you are at least 18 years old and that you accept these Terms together with the Privacy Policy.',
      'We may suspend markets, void bets in defined cases, apply KYC checks, and enforce bonus or referral rules to protect the integrity of the book. Fraud, multi-accounting, and abuse of promotions can lead to withheld rewards or closed accounts as described in the full Terms text on this page when you are logged into the product UI.',
      'Safer play commitments and limit tools are summarised on Responsible Gaming. Practical support is on Help. Marketing offers are detailed on Promotions and do not override these Terms.',
      'If you do not agree with the Terms, do not create an account or place bets. Continued use after updates constitutes acceptance of the revised Terms when we publish them.',
    ],
  },
  '/privacy': {
    title: 'Privacy Policy | OddsYra',
    h1: 'Privacy policy',
    description:
      'How OddsYra collects, uses, and protects your personal data for accounts, payments, KYC, and fraud prevention. 18+ only.',
    paragraphs: [
      'This Privacy Policy explains what personal data OddsYra collects, why we need it, and the choices you have. We collect account details, contact information, device and usage data, payment references, and KYC documents when required to run the sportsbook, process deposits and withdrawals, prevent fraud, and meet legal obligations.',
      'We use service providers for hosting, payments, email, and security. We do not sell your personal information for unrelated advertising. Retention periods depend on account status and regulatory needs — closed accounts may still retain records required for audits and dispute handling.',
      'You can request access or correction through support channels listed on Help. Related documents: Terms for product rules, Responsible Gaming for limit tools that may store your preferences, and Register for how account creation starts the relationship.',
      'By creating an account you acknowledge this Privacy Policy. If you have privacy-specific questions, contact support and reference “privacy” in the subject so the right team can respond.',
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
