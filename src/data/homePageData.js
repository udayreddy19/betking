/** 10CRIC-style homepage content */

export const homePromoSlides = [
  {
    id: 'crypto',
    title: '5% EXTRA',
    subtitle: 'CASH ON CRYPTO',
    gradient: 'linear-gradient(135deg, #fef3c7 0%, #fce7f3 40%, #e0e7ff 100%)',
    accent: '#7c3aed',
    emoji: '₿',
  },
  {
    id: 'welcome',
    title: '150% WELCOME',
    subtitle: 'BONUS UP TO ₹30,000',
    gradient: 'linear-gradient(135deg, #ede9fe 0%, #fce7f3 50%, #fef3c7 100%)',
    accent: '#6d28d9',
    emoji: '🎁',
  },
];

export const homeCategoryTiles = [
  {
    id: 'sports',
    label: 'SPORTS',
    link: '/sports',
    size: 'large',
    bg: '#e8f0fe',
    image: 'https://images.unsplash.com/photo-1531415074968-036ba1b575da?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'live-casino',
    label: 'LIVE CASINO',
    link: '/live-casino',
    size: 'tall',
    bg: '#e6f7f0',
    image: 'https://images.unsplash.com/photo-1596838135731-f71d8ab1bf48?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'instant',
    label: 'INSTANT',
    link: '/casino?cat=crash-games',
    size: 'small',
    bg: '#f0f4ff',
    badge: 22,
    image: 'https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 'vip',
    label: 'VIP',
    link: '/profile',
    size: 'small',
    bg: '#fff8e6',
    image: 'https://images.unsplash.com/photo-1626074353761-517a2e4f387a?auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 'promos',
    label: 'PROMOS',
    link: '/promotions',
    size: 'small',
    bg: '#f3e8ff',
    image: 'https://images.unsplash.com/photo-1513885535751-8b9238bd345a?auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 'loyalty',
    label: 'LOYALTY',
    link: '/profile',
    size: 'small',
    bg: '#fef9c3',
    image: 'https://images.unsplash.com/photo-1567427017947-545c5f8d16ad?auto=format&fit=crop&w=400&q=80',
  },
];

export const gameProviders = [
  { id: 'spribe', name: 'Spribe', color: '#111827', textColor: '#fff' },
  { id: 'pgsoft', name: 'PGSoft', color: '#2563eb', textColor: '#fff' },
  { id: 'evolution-red', name: 'Evolution', color: '#dc2626', textColor: '#fff' },
  { id: 'evolution-green', name: 'Evolution', color: '#16a34a', textColor: '#fff' },
  { id: 'smartsoft', name: 'Smartsoft', color: '#f59e0b', textColor: '#111' },
  { id: 'aviatrix', name: 'Aviatrix', color: '#7c3aed', textColor: '#fff' },
  { id: 'endorphina', name: 'Endorphina', color: '#0f172a', textColor: '#fff' },
  { id: 'playtech', name: 'Playtech', color: '#1d4ed8', textColor: '#fff' },
  { id: 'jackpot', name: 'Jackpot', color: '#b45309', textColor: '#fff' },
  { id: 'microgaming', name: 'Microgaming', color: '#059669', textColor: '#fff' },
  { id: 'pragmatic', name: 'Pragmatic Play', color: '#ea580c', textColor: '#fff' },
];

/** Game ids for "Top Games" row — matches 10CRIC order */
export const topGameIds = ['g1', 'g3', 'g2', 'g4', 'g7', 'g8'];

/** Live game ids for "Top Live Games" row — resolved at runtime from liveCasinoGames */
export const topLiveGameCount = 6;
