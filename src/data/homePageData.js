/** Homepage promo content */

export const homePromoSlides = [
  {
    id: 'srl',
    title: 'ODDSYRA SRL',
    subtitle: 'BEGINS 10 SEPTEMBER — 70 LEAGUE + 4 PLAYOFFS',
    gradient: 'linear-gradient(135deg, #1a1408 0%, #7c2d12 55%, #ea580c 140%)',
    accent: '#fdba74',
    emoji: '⚡',
  },
  {
    id: 'sports',
    title: 'LIVE CRICKET',
    subtitle: 'IN-PLAY MARKETS OPEN NOW',
    gradient: 'linear-gradient(135deg, #163028 0%, #1f8a4c 55%, #7dff6b 140%)',
    accent: '#7dff6b',
    emoji: '🏏',
  },
  {
    id: 'promo',
    title: 'BOOSTED ODDS',
    subtitle: 'CLAIM OFFERS IN PROMOS',
    gradient: 'linear-gradient(135deg, #1c2a24 0%, #2a4a38 50%, #e07a2f 160%)',
    accent: '#e07a2f',
    emoji: '🎁',
  },
];

export const homeCategoryTiles = [
  {
    id: 'sports',
    label: 'SPORTS',
    link: '/sports',
    size: 'large',
    bg: '#e8eef8',
    image: 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?auto=format&fit=crop&w=700&q=80',
  },
  {
    id: 'live-betting',
    label: 'LIVE BETTING',
    link: '/live-betting',
    size: 'tall',
    bg: '#fde8e8',
    image: 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=700&q=80',
  },
  {
    id: 'cricket',
    label: 'CRICKET',
    link: '/sports?sport=cricket',
    size: 'small',
    bg: '#fff7ed',
    image: 'https://images.unsplash.com/photo-1459865264687-595d652de67e?auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 'vip',
    label: 'VIP',
    link: '/profile',
    size: 'small',
    bg: '#fff8e6',
    image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 'casino',
    label: 'CASINO',
    link: '/casino',
    size: 'small',
    bg: '#ecfdf5',
    image: 'https://images.unsplash.com/photo-1596838132731-3301c3fd4311?auto=format&fit=crop&w=400&q=80',
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

/** Top Games row — exact order & titles from recording */
export const homeTopGames = [
  {
    gameId: 'g1',
    displayName: 'Aviator',
    provider: 'Spribe',
    gradient: 'linear-gradient(180deg, #1a1a1a 0%, #7f1d1d 100%)',
    image: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=400&q=80',
  },
  {
    gameId: 'g33',
    displayName: 'Ganesha Fortune',
    provider: 'PGSoft',
    gradient: 'linear-gradient(180deg, #1e3a8a 0%, #312e81 100%)',
    image: 'https://images.unsplash.com/photo-1605647540924-852290f6b725?auto=format&fit=crop&w=400&q=80',
  },
  {
    gameId: 'g2',
    displayName: 'Crazy Time',
    provider: 'Evolution',
    gradient: 'linear-gradient(180deg, #ea580c 0%, #9a3412 100%)',
    image: 'https://images.unsplash.com/photo-1596838135731-f71d8ab1bf48?auto=format&fit=crop&w=400&q=80',
  },
  {
    gameId: 'g4',
    displayName: 'Lightning Roulette',
    provider: 'Evolution',
    gradient: 'linear-gradient(180deg, #14532d 0%, #052e16 100%)',
    image: 'https://images.unsplash.com/photo-1606166186982-7a0c4a8801c8?auto=format&fit=crop&w=400&q=80',
  },
  {
    gameId: 'g7',
    displayName: 'JetX',
    provider: 'Smartsoft',
    gradient: 'linear-gradient(180deg, #fbbf24 0%, #d97706 100%)',
    image: 'https://images.unsplash.com/photo-1540962351504-03099e0a754b?auto=format&fit=crop&w=400&q=80',
  },
  {
    gameId: 'g34',
    displayName: 'Aviatrix',
    provider: 'Aviatrix',
    gradient: 'linear-gradient(180deg, #4c1d95 0%, #1e1b4b 100%)',
    image: 'https://images.unsplash.com/photo-1540962351504-03099e0a754b?auto=format&fit=crop&w=400&q=80',
  },
];

/** Top Live Games row — exact titles from recording */
export const homeLiveGames = [
  {
    gameId: 'g30',
    displayName: 'Andar Bahar',
    image: 'https://images.unsplash.com/photo-1606166186982-7a0c4a8801c8?auto=format&fit=crop&w=400&q=80',
    gradient: 'linear-gradient(180deg, #7f1d1d 0%, #450a0a 100%)',
  },
  {
    gameId: 'lc2',
    displayName: 'Speed Auto Roulette',
    image: 'https://images.unsplash.com/photo-1596838135731-f71d8ab1bf48?auto=format&fit=crop&w=400&q=80',
    gradient: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
  },
  {
    gameId: 'g4',
    displayName: 'Lightning Roulette',
    image: 'https://images.unsplash.com/photo-1606166186982-7a0c4a8801c8?auto=format&fit=crop&w=400&q=80',
    gradient: 'linear-gradient(180deg, #14532d 0%, #052e16 100%)',
  },
  {
    gameId: 'lc9',
    displayName: 'Super Speed Baccarat',
    image: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=400&q=80',
    gradient: 'linear-gradient(180deg, #991b1b 0%, #450a0a 100%)',
  },
  {
    gameId: 'lc11',
    displayName: 'Super Sic Bo',
    image: 'https://images.unsplash.com/photo-1596838135731-f71d8ab1bf48?auto=format&fit=crop&w=400&q=80',
    gradient: 'linear-gradient(180deg, #b45309 0%, #78350f 100%)',
  },
  {
    gameId: 'lc1',
    displayName: 'Immersive Roulette',
    image: 'https://images.unsplash.com/photo-1606166186982-7a0c4a8801c8?auto=format&fit=crop&w=400&q=80',
    gradient: 'linear-gradient(180deg, #1e1b4b 0%, #0f172a 100%)',
  },
];
