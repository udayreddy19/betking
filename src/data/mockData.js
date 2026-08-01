// Mock data for the BetKing betting app

export const WELCOME_BONUS = {
  percent: 150,
  maxAmount: 30000,
  displayShort: '150% up to ₹30,000',
  code: 'WELCOME150',
};

export const DEMO_STARTING_BALANCE = 10000;

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
    link: '/sports'
  },
  {
    id: 'casino',
    name: 'CASINO',
    icon: '🎰',
    image: '🎰',
    color: 'linear-gradient(135deg, #78350f 0%, #451a03 100%)',
    gradient: 'linear-gradient(135deg, #78350f 0%, #451a03 100%)',
    bgGradient: 'linear-gradient(135deg, #78350f 0%, #451a03 100%)',
    description: '2,000+ Slots, Megaways & Huge Jackpot Games',
    badge: 'HOT GAMES',
    borderColor: '#f59e0b',
    link: '/casino'
  },
  {
    id: 'live-casino',
    name: 'LIVE CASINO',
    icon: '🎲',
    image: '🎲',
    color: 'linear-gradient(135deg, #581c87 0%, #2e1065 100%)',
    gradient: 'linear-gradient(135deg, #581c87 0%, #2e1065 100%)',
    bgGradient: 'linear-gradient(135deg, #581c87 0%, #2e1065 100%)',
    description: 'Real Live Dealers, Roulette, Blackjack & Baccarat Tables',
    badge: '24/7 TABLES',
    borderColor: '#a855f7',
    link: '/live-casino'
  },
  {
    id: 'crash-games',
    name: 'CRASH GAMES',
    icon: '🚀',
    image: '🚀',
    color: 'linear-gradient(135deg, #0e7490 0%, #164e63 100%)',
    gradient: 'linear-gradient(135deg, #0e7490 0%, #164e63 100%)',
    bgGradient: 'linear-gradient(135deg, #0e7490 0%, #164e63 100%)',
    description: 'Aviator, Spribe Multipliers & Instant Cashout',
    badge: 'HIGH WIN',
    borderColor: '#06b6d4',
    link: '/casino?cat=crash-games'
  }
];

export const sportsCategories = [
  { id: 'cricket', name: 'Cricket', icon: '🏏', color: '#f97316' },
  { id: 'soccer', name: 'Soccer', icon: '⚽', color: '#22c55e' },
  { id: 'basketball', name: 'Basketball', icon: '🏀', color: '#f59e0b' },
  { id: 'tennis', name: 'Tennis', icon: '🎾', color: '#14b8a6' },
  { id: 'table-tennis', name: 'Table Tennis', icon: '🏓', color: '#6366f1' },
  { id: 'kabaddi', name: 'Kabaddi', icon: '🤼', color: '#ec4899' },
  { id: 'esoccer', name: 'eSoccer', icon: '🎮', color: '#8b5cf6' },
  { id: 'virtual-cricket', name: 'Virtual Fast Cricket', icon: '🏏', color: '#06b6d4' },
  { id: 'volleyball', name: 'Volleyball', icon: '🏐', color: '#eab308' },
  { id: 'american-football', name: 'American Football', icon: '🏈', color: '#b45309' },
];

export const leagues = [
  { id: 'hundred-m', name: 'The Hundred Men', sport: 'cricket' },
  { id: 'hundred-w', name: 'The Hundred Women', sport: 'cricket' },
  { id: 'ken-bah', name: 'T20 Series Kenya vs Bahrain', sport: 'cricket' },
  { id: 'lpl', name: 'T20 Lanka Premier League', sport: 'cricket' },
  { id: 'epl', name: 'Premier League', sport: 'soccer' },
  { id: 'laliga', name: 'La Liga', sport: 'soccer' },
];

export const matches = [
  {
    id: 'm1',
    league: 'The Hundred Men',
    sport: 'cricket',
    sportColor: '#f97316',
    time: 'Live',
    isLive: true,
    matchState: 'in',
    team1: { name: 'Birmingham Phoenix', shortName: 'BIR', color: '#22c55e' },
    team2: { name: 'Welsh Fire', shortName: 'WEL', color: '#e5e7eb' },
    odds: { team1: 1.68, team2: 2.24 },
    liveDetails: { runs: 145, wickets: 3, overs: '19.4', score2: 144, wickets2: 3, overs2: '20.0', commentary: 'Birmingham Phoenix win by 7 wickets' }
  },
  {
    id: 'm2',
    league: 'The Hundred Women',
    sport: 'cricket',
    sportColor: '#f97316',
    time: 'Live',
    isLive: true,
    matchState: 'in',
    team1: { name: 'London Spirit W', shortName: 'LON(W)', color: '#e5e7eb' },
    team2: { name: 'Southern Brave W', shortName: 'SOU(W)', color: '#e5e7eb' },
    odds: { team1: 2.18, team2: 1.69 },
    liveDetails: { runs: 128, wickets: 5, overs: '17.2', score2: 152, wickets2: 4, overs2: '20.0', commentary: 'London Spirit W chasing 153' }
  },
  {
    id: 'm3',
    league: 'T20 Series Kenya vs Bahrain',
    sport: 'cricket',
    sportColor: '#f97316',
    time: 'Live',
    isLive: true,
    matchState: 'in',
    team1: { name: 'Kenya', shortName: 'KEN', color: '#22c55e' },
    team2: { name: 'Bahrain', shortName: 'BAH', color: '#ef4444' },
    odds: { team1: 1.99, team2: 1.70 },
    liveDetails: { runs: 105, wickets: 4, overs: '14.2', score2: 148, wickets2: 5, overs2: '20.0', commentary: 'Kenya require 44 runs from 34 balls' }
  },
  {
    id: 'm4',
    league: 'Lanka Premier League',
    sport: 'cricket',
    sportColor: '#f97316',
    time: 'Live',
    isLive: true,
    matchState: 'in',
    team1: { name: 'Colombo Stars', shortName: 'COL', color: '#e5e7eb' },
    team2: { name: 'Galle Gladiators', shortName: 'GAL', color: '#e5e7eb' },
    odds: { team1: 1.49, team2: 2.38 },
    liveDetails: { runs: 168, wickets: 6, overs: '18.5', score2: 165, wickets2: 7, overs2: '20.0', commentary: 'Colombo Stars chasing 166' }
  },
  {
    id: 'm5',
    league: 'Premier League',
    sport: 'soccer',
    sportColor: '#22c55e',
    time: 'Today 20:00',
    isLive: true,
    matchState: 'in',
    team1: { name: 'Manchester City', shortName: 'MCI', color: '#6cb4ee' },
    team2: { name: 'Arsenal', shortName: 'ARS', color: '#ef4444' },
    odds: { team1: 2.10, draw: 3.40, team2: 3.20 },
    liveDetails: { score1: 2, score2: 1, minute: "74' 2nd Half", commentary: 'LiveScore Soccer: In Play' }
  },
  {
    id: 'm6',
    league: 'La Liga',
    sport: 'soccer',
    sportColor: '#22c55e',
    time: 'Tomorrow 00:30',
    isLive: false,
    matchState: 'pre',
    team1: { name: 'Real Madrid', shortName: 'RMA', color: '#ffffff' },
    team2: { name: 'Barcelona', shortName: 'FCB', color: '#a50044' },
    odds: { team1: 2.50, draw: 3.30, team2: 2.70 },
    liveDetails: { score1: 0, score2: 0, minute: "Scheduled", commentary: 'Upcoming match' }
  }
];

export const casinoCategories = [
  { id: 'all', name: 'All Games', icon: '🎰' },
  { id: 'slots', name: 'Slots', icon: '🎰' },
  { id: 'live-casino', name: 'Live Casino', icon: '🎲' },
  { id: 'crash-games', name: 'Crash Games', icon: '🚀' },
  { id: 'table-games', name: 'Table Games', icon: '🃏' },
  { id: 'jackpots', name: 'Jackpots', icon: '💰' },
];

export const liveCasinoCategories = [
  { id: 'all', name: 'All Tables', icon: '🎲' },
  { id: 'roulette', name: 'Roulette', icon: '🎡' },
  { id: 'blackjack', name: 'Blackjack', icon: '🃏' },
  { id: 'baccarat', name: 'Baccarat', icon: '🎴' },
  { id: 'game-shows', name: 'Game Shows', icon: '🎪' },
];

export const casinoGames = [
  {
    id: 'g1',
    name: 'Aviator',
    category: 'crash-games top-slots',
    provider: 'Spribe',
    image: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=600&q=80',
    isHot: true,
    isNew: false,
    rtp: '97.0%',
  },
  {
    id: 'g2',
    name: 'Crazy Time',
    category: 'live-casino top-slots',
    provider: 'Evolution',
    image: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?auto=format&fit=crop&w=600&q=80',
    isHot: true,
    isNew: false,
    rtp: '96.08%',
  },
  {
    id: 'g3',
    name: 'Gates of Olympus',
    category: 'slots top-slots',
    provider: 'Pragmatic Play',
    image: 'https://images.unsplash.com/photo-1511193311914-0346f16efe90?auto=format&fit=crop&w=600&q=80',
    isHot: true,
    isNew: false,
    rtp: '96.50%',
  },
  {
    id: 'g4',
    name: 'Lightning Roulette',
    category: 'live-casino top-slots',
    provider: 'Evolution',
    image: 'https://images.unsplash.com/photo-1606167668584-78701c57f13d?auto=format&fit=crop&w=600&q=80',
    isHot: false,
    isNew: true,
    rtp: '97.30%',
  },
  {
    id: 'g5',
    name: 'Sweet Bonanza',
    category: 'slots top-slots',
    provider: 'Pragmatic Play',
    image: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=600&q=80',
    isHot: true,
    isNew: false,
    rtp: '96.48%',
  },
  {
    id: 'g6',
    name: 'Infinite Blackjack',
    category: 'table-games top-slots',
    provider: 'Evolution',
    image: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?auto=format&fit=crop&w=600&q=80',
    isHot: false,
    isNew: false,
    rtp: '99.47%',
  },
];

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
