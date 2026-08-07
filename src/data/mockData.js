// Mock data for the BetKing betting app

export const WELCOME_BONUS = {
  percent: 150,
  maxAmount: 30000,
  displayShort: '150% up to ₹30,000',
  code: 'WELCOME150',
  /** Flat demo credit applied on registration */
  registrationCredit: 1500,
};

export const STARTING_BALANCE = 10000;

export const heroCategories = [
  {
    id: 'sports',
    name: 'SPORTS',
    icon: '🏆',
    image: '🏆',
    color: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
    gradient: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
    bgGradient: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
    description: 'Bet on 35+ Sports & Top Global Leagues with Best Odds',
    badge: 'TOP ODDS',
    borderColor: '#3b82f6',
    link: '/sports'
  },
  {
    id: 'live-betting',
    name: 'LIVE BETTING',
    icon: '🔴',
    image: '🔴',
    color: 'linear-gradient(135deg, #991b1b 0%, #450a0a 100%)',
    gradient: 'linear-gradient(135deg, #991b1b 0%, #450a0a 100%)',
    bgGradient: 'linear-gradient(135deg, #991b1b 0%, #450a0a 100%)',
    description: 'Ball-by-Ball Live Scores & In-Play Odds Fluctuations',
    badge: 'LIVE NOW',
    borderColor: '#ef4444',
    link: '/live-betting'
  },
  {
    id: 'fantasy',
    name: 'FANTASY',
    icon: '🎯',
    image: '🎯',
    color: 'linear-gradient(135deg, #0e7490 0%, #164e63 100%)',
    gradient: 'linear-gradient(135deg, #0e7490 0%, #164e63 100%)',
    bgGradient: 'linear-gradient(135deg, #0e7490 0%, #164e63 100%)',
    description: 'Build your dream team and compete for big prizes',
    badge: 'NEW',
    borderColor: '#06b6d4',
    link: '/fantasy'
  }
];

export const sportsCategories = [
  { id: 'cricket', name: 'Cricket', color: '#f97316' },
  { id: 'soccer', name: 'Soccer', color: '#22c55e' },
  { id: 'basketball', name: 'Basketball', color: '#f59e0b' },
  { id: 'tennis', name: 'Tennis', color: '#14b8a6' },
  { id: 'table-tennis', name: 'Table Tennis', color: '#6366f1' },
  { id: 'kabaddi', name: 'Kabaddi', color: '#ec4899' },
  { id: 'esoccer', name: 'eSoccer', color: '#8b5cf6' },
  { id: 'virtual-cricket', name: 'Virtual Fast Cricket', color: '#06b6d4' },
  { id: 'volleyball', name: 'Volleyball', color: '#eab308' },
  { id: 'american-football', name: 'American Football', color: '#b45309' },
];

export const leagues = [
  { id: 'hundred-m', name: 'The Hundred Men', sport: 'cricket' },
  { id: 'hundred-w', name: 'The Hundred Women', sport: 'cricket' },
  { id: 'ken-bah', name: 'T20 Series Kenya vs Bahrain', sport: 'cricket' },
  { id: 'lpl', name: 'T20 Lanka Premier League', sport: 'cricket' },
  { id: 'epl', name: 'Premier League', sport: 'soccer' },
  { id: 'laliga', name: 'La Liga', sport: 'soccer' },
];

export const featuredLeagues = [
  { id: 'hundred-m', name: 'The Hundred', sport: 'cricket', icon: 'flame', matchLeagues: ['The Hundred Men', "The Hundred Men's Competition 2026", 'The Hundred'], breadcrumb: 'England - The Hundred' },
  { id: 'hundred-w', name: 'The Hundred, Women', sport: 'cricket', icon: 'flame', matchLeagues: ['The Hundred Women', "The Hundred Women's Competition 2026"], breadcrumb: 'England - The Hundred, Women' },
  { id: 'lpl', name: 'T20 Lanka Premier League', sport: 'cricket', icon: 'flame', matchLeagues: ['Lanka Premier League', 'LPL, 2026', 'T20 Lanka Premier League', 'Lanka Premier League, 2026'] },
  { id: 'dpl', name: 'Delhi Premier League', sport: 'cricket', icon: 'flame', matchLeagues: ['Delhi Premier League', 'DPL 2026', 'Delhi Premier League, 2026'] },
  { id: 'gsl', name: 'Global Super League', sport: 'cricket', icon: 'flame', matchLeagues: ['Global Super League', 'Global Super League 2026'] },
  { id: 'one-day', name: 'One-Day Cup', sport: 'cricket', icon: 'flame', matchLeagues: ['One-Day Cup', 'England Domestic One-Day Cup'] },
  { id: 'ken-bah', name: 'Kenya vs Bahrain', sport: 'cricket', icon: 'flame', matchLeagues: ['T20 Series Kenya vs Bahrain', 'Bahrain tour of Kenya, 2026'] },
  { id: 'sl-pak-w', name: 'T20 Series Sri Lanka vs Pakistan, Women', sport: 'cricket', icon: 'flame', matchLeagues: ['T20 Series Sri Lanka vs Pakistan, Women', 'Pakistan Women tour of Sri Lanka', 'Pakistan Women tour of Sri Lanka, 2026'] },
  { id: 'sl-ind', name: 'Sri Lanka vs India', sport: 'cricket', icon: 'flame', matchLeagues: ['Sri Lanka vs India', 'Sri Lanka vs India, 2026', 'India tour of Sri Lanka', 'India tour of Sri Lanka, 2026', 'Sri Lanka XI vs India'] },
  { id: 'pak-wi', name: 'Test Series West Indies vs. Pakistan', sport: 'cricket', icon: 'flame', matchLeagues: ['West Indies v Pakistan, 2026', 'Pakistan tour of West Indies, 2026', 'Test Series West Indies vs. Pakistan'] },
  { id: 'qcl', name: 'Quantum Cricket League', sport: 'cricket', icon: 'flame', matchLeagues: ['Quantum Cricket League', 'Global Super League', 'Global Super League 2026'] },
  { id: 'ipl-srl', name: 'Indian Premier League SRL', sport: 'cricket', icon: 'flame', breadcrumb: 'Simulated Reality League - Indian Premier League SRL', matchLeagues: ['IPL 2026', 'IPL SRL', 'Indian Premier League', 'Indian Premier League SRL'] },
  { id: 't20-intl-srl', name: 'T20 International SRL', sport: 'cricket', icon: 'flame', matchLeagues: ['T20 International SRL', 'T20 International'] },
  { id: 'tt-elite', name: 'TT Elite Series', sport: 'table-tennis', icon: 'flame', matchLeagues: ['TT Elite Series'] },
  { id: 'cpl', name: 'Caribbean Premier League', sport: 'cricket', icon: 'flame', matchLeagues: ['Caribbean Premier League', 'Caribbean Premier League 2026'] },
  { id: 'tnpl', name: 'Tamil Nadu Premier League', sport: 'cricket', icon: 'flame', matchLeagues: ['Tamil Nadu Premier League', 'Tamil Nadu Premier League 2026'] },
  { id: 'epl', name: 'Premier League', sport: 'soccer', icon: 'globe', matchLeagues: ['Premier League'] },
  { id: 'laliga', name: 'La Liga', sport: 'soccer', icon: 'globe', matchLeagues: ['La Liga'] },
];

export const leagueGroups = [
  {
    country: 'International',
    flag: '🌍',
    leagues: ['West Indies v Pakistan, 2026', 'India tour of Sri Lanka 2026', 'Bangladesh tour of Australia, 2026', 'Pakistan tour of England 2026'],
  },
  {
    country: 'England',
    flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    leagues: ['The Hundred Men', 'The Hundred Women', 'One-Day Cup', 'County Championship'],
  },
  {
    country: 'India',
    flag: '🇮🇳',
    leagues: ['Delhi Premier League', 'Tamil Nadu Premier League', 'IPL 2026', 'Syed Mushtaq Ali Trophy Elite'],
  },
  {
    country: 'Sri Lanka',
    flag: '🇱🇰',
    leagues: ['Lanka Premier League', 'Global Super League'],
  },
  {
    country: 'Caribbean',
    flag: '🏝️',
    leagues: ['Caribbean Premier League', 'West Indies v Pakistan, 2026'],
  },
  {
    country: 'Australia',
    flag: '🇦🇺',
    leagues: ['Big Bash League', 'Sheffield Shield', 'WBBL'],
  },
  {
    country: 'Virtual Cricket',
    flag: '🎮',
    leagues: ['Simulated Reality League', 'Indian Premier League SRL', 'T20 International SRL'],
  },
];

export const matches = [];

export { casinoGames, liveCasinoGames } from './casinoGamesData.js';
export { casinoCategories, liveCasinoCategories } from './casinoGamesData.js';

export const promotions = [
  {
    id: 'p1',
    title: '150% Welcome Sports Bonus up to ₹30,000',
    subtitle: 'Deposit now and get 150% extra bonus',
    category: 'sports',
    tag: 'NEW CUSTOMERS',
    code: 'WELCOME150',
    gradient: 'linear-gradient(135deg, #1e1b4b 0%, #311b92 100%)',
    bgColor: 'linear-gradient(135deg, #1e1b4b 0%, #311b92 100%)',
    image: 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?auto=format&fit=crop&w=800&q=80',
    description: 'Get started on BetKing with a massive 150% bonus on your first deposit up to ₹30,000!',
    bonusAmount: 3000,
  },
  {
    id: 'p2',
    title: 'Weekly Sports Cashback up to ₹10,000',
    subtitle: 'Get 10% cash back every Monday',
    category: 'sports',
    tag: 'WEEKLY CASHBACK',
    code: 'CASHBACK10',
    gradient: 'linear-gradient(135deg, #064e3b 0%, #047857 100%)',
    bgColor: 'linear-gradient(135deg, #064e3b 0%, #047857 100%)',
    image: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=800&q=80',
    description: 'Get 10% cashback on your net sports losses every Monday up to ₹10,000.',
    bonusAmount: 1000,
  },
  {
    id: 'p3',
    title: '100% Casino Welcome Pack up to ₹70,000 + 50 Free Spins',
    subtitle: '50 Free Spins on Aviator included',
    category: 'casino',
    tag: 'CASINO PACK',
    code: 'CASINO100',
    gradient: 'linear-gradient(135deg, #701a75 0%, #a21caf 100%)',
    bgColor: 'linear-gradient(135deg, #701a75 0%, #a21caf 100%)',
    image: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?auto=format&fit=crop&w=800&q=80',
    description: 'Double your casino stack up to ₹70,000 and get 50 Free Spins on Aviator!',
    bonusAmount: 2000,
  },
];

export const paymentMethods = [
  {
    id: 'upi-express',
    name: 'UPI Express (GPay / PhonePe / Paytm / BHIM)',
    icon: '⚡',
    type: 'upi',
    minDeposit: 500,
    maxDeposit: 100000,
    processingTime: 'Instant',
    popular: true,
  }
];
