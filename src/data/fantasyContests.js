export const FANTASY_CONTESTS = [
  {
    id: 'mega-cricket',
    title: 'Mega Cricket Contest',
    sport: 'cricket',
    entryFee: 49,
    prizePool: 100000,
    spots: 2500,
    filled: 1840,
    maxTeams: 1,
  },
  {
    id: 'ipl-expert',
    title: 'IPL Expert League',
    sport: 'cricket',
    entryFee: 99,
    prizePool: 250000,
    spots: 5000,
    filled: 3120,
    maxTeams: 1,
  },
  {
    id: 'soccer-rush',
    title: 'Soccer Rush',
    sport: 'soccer',
    entryFee: 29,
    prizePool: 50000,
    spots: 2000,
    filled: 960,
    maxTeams: 1,
  },
  {
    id: 'free-roll',
    title: 'Practice Free Roll',
    sport: 'cricket',
    entryFee: 0,
    prizePool: 5000,
    spots: 10000,
    filled: 6400,
    maxTeams: 1,
  },
];

const ENTRIES_KEY = 'betking_fantasy_entries';

export function loadFantasyEntries(email) {
  if (!email) return [];
  try {
    const all = JSON.parse(localStorage.getItem(ENTRIES_KEY) || '{}');
    return all[email] || [];
  } catch {
    return [];
  }
}

export function saveFantasyEntry(email, entry) {
  if (!email) return [];
  const all = JSON.parse(localStorage.getItem(ENTRIES_KEY) || '{}');
  const list = all[email] || [];
  const next = [{ id: `FE-${Date.now()}`, joinedAt: new Date().toISOString(), ...entry }, ...list].slice(0, 50);
  all[email] = next;
  localStorage.setItem(ENTRIES_KEY, JSON.stringify(all));
  return next;
}
