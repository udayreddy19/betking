/**
 * UI filter labels for market tabs. Does not compute odds.
 * Authoritative prices come from OddsEngineV3 via /api/public/sports/matches/:id/odds.
 */
export function getMarketCategoriesForSport(sport = 'cricket') {
  switch (sport) {
    case 'cricket':
    case 'virtual-cricket':
      return [
        { id: 'all', label: 'All' },
        { id: 'main', label: 'Main' },
        { id: 'totals', label: 'Match Totals' },
        { id: 'over', label: 'Overs' },
        { id: 'delivery', label: 'Deliveries' },
        { id: 'partnership', label: 'Partnership' },
        { id: 'props', label: 'Player Props' },
      ];
    case 'soccer':
    case 'esoccer':
      return [
        { id: 'all', label: 'All' },
        { id: 'main', label: 'Main' },
        { id: 'goals', label: 'Goals' },
        { id: 'halves', label: 'Halves' },
        { id: 'chance', label: 'Double Chance' },
      ];
    case 'basketball':
    case 'american-football':
      return [
        { id: 'all', label: 'All' },
        { id: 'main', label: 'Main' },
        { id: 'spreads', label: 'Handicap & Spreads' },
        { id: 'totals', label: 'Total Points' },
        { id: 'quarters', label: 'Quarters' },
      ];
    case 'tennis':
      return [
        { id: 'all', label: 'All' },
        { id: 'main', label: 'Main' },
        { id: 'sets', label: 'Sets' },
        { id: 'games', label: 'Games' },
      ];
    default:
      return [
        { id: 'all', label: 'All' },
        { id: 'main', label: 'Main' },
        { id: 'totals', label: 'Totals' },
        { id: 'specials', label: 'Specials' },
      ];
  }
}
