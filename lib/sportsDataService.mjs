/**
 * Sports Data API Platform — Master Data Service Layer
 * Standardizes sports, countries, competitions, teams, players, venues,
 * live matches, events, stats, rankings, and standings.
 */

import { aggregateLiveScores } from './aggregator.mjs';
import { fetchMatchDetail } from './matchDetailFetcher.mjs';
import { getRosterForTeam } from '../src/data/cricketRosters.js';

// ---------------------------------------------------------------------------
// 1. Sports Catalog
// ---------------------------------------------------------------------------
export const SPORTS_CATALOG = [
  { id: 'cricket', name: 'Cricket', slug: 'cricket', icon: '🏏', status: 'active', matchCount: 42 },
  { id: 'football', name: 'Football (Soccer)', slug: 'football', icon: '⚽', status: 'active', matchCount: 28 },
  { id: 'tennis', name: 'Tennis', slug: 'tennis', icon: '🎾', status: 'active', matchCount: 16 },
  { id: 'basketball', name: 'Basketball', slug: 'basketball', icon: '🏀', status: 'active', matchCount: 14 },
  { id: 'table-tennis', name: 'Table Tennis', slug: 'table-tennis', icon: '🏓', status: 'active', matchCount: 10 },
  { id: 'volleyball', name: 'Volleyball', slug: 'volleyball', icon: '🏐', status: 'active', matchCount: 8 },
];

// ---------------------------------------------------------------------------
// 2. Countries Catalog
// ---------------------------------------------------------------------------
export const COUNTRIES_CATALOG = [
  { id: 'IND', name: 'India', isoCode: 'IN', flag: '🇮🇳', continent: 'Asia' },
  { id: 'ENG', name: 'England', isoCode: 'GB', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', continent: 'Europe' },
  { id: 'AUS', name: 'Australia', isoCode: 'AU', flag: '🇦🇺', continent: 'Oceania' },
  { id: 'LKA', name: 'Sri Lanka', isoCode: 'LK', flag: '🇱🇰', continent: 'Asia' },
  { id: 'PAK', name: 'Pakistan', isoCode: 'PK', flag: '🇵🇰', continent: 'Asia' },
  { id: 'USA', name: 'United States', isoCode: 'US', flag: '🇺🇸', continent: 'North America' },
  { id: 'ESP', name: 'Spain', isoCode: 'ES', flag: '🇪🇸', continent: 'Europe' },
  { id: 'DEU', name: 'Germany', isoCode: 'DE', flag: '🇩🇪', continent: 'Europe' },
];

// ---------------------------------------------------------------------------
// 3. Competitions & Seasons
// ---------------------------------------------------------------------------
export const COMPETITIONS_CATALOG = [
  { id: 'comp_hundred', sportId: 'cricket', countryId: 'ENG', name: 'The Hundred', season: '2026', type: 'Franchise T100', gender: 'Men & Women' },
  { id: 'comp_vitality', sportId: 'cricket', countryId: 'ENG', name: 'Vitality Blast', season: '2026', type: 'Domestic T20', gender: 'Men' },
  { id: 'comp_ipl', sportId: 'cricket', countryId: 'IND', name: 'Indian Premier League (IPL)', season: '2026', type: 'Franchise T20', gender: 'Men' },
  { id: 'comp_srl', sportId: 'cricket', countryId: 'IND', name: 'IPL Simulated Reality League', season: '2026', type: 'Simulated T20', gender: 'Men' },
  { id: 'comp_lpl', sportId: 'cricket', countryId: 'LKA', name: 'Lanka Premier League', season: '2026', type: 'Franchise T20', gender: 'Men' },
  { id: 'comp_epl', sportId: 'football', countryId: 'ENG', name: 'Premier League', season: '2025/26', type: 'League', gender: 'Men' },
  { id: 'comp_ucl', sportId: 'football', countryId: 'ESP', name: 'UEFA Champions League', season: '2025/26', type: 'Tournament', gender: 'Men' },
  { id: 'comp_nba', sportId: 'basketball', countryId: 'USA', name: 'NBA Regular Season', season: '2025/26', type: 'League', gender: 'Men' },
];

export const SEASONS_CATALOG = [
  { id: 'season_2026', competitionId: 'comp_hundred', startDate: '2026-07-01', endDate: '2026-08-31', current: true },
  { id: 'season_2025_26', competitionId: 'comp_epl', startDate: '2025-08-15', endDate: '2026-05-24', current: true },
];

// ---------------------------------------------------------------------------
// 4. Venues Catalog
// ---------------------------------------------------------------------------
export const VENUES_CATALOG = [
  { id: 'venue_rose_bowl', name: 'The Rose Bowl', city: 'Southampton', country: 'England', capacity: 25000, latitude: 50.9242, longitude: -1.3223 },
  { id: 'venue_sophia_gardens', name: 'Sophia Gardens', city: 'Cardiff', country: 'Wales', capacity: 15643, latitude: 51.4842, longitude: -3.1889 },
  { id: 'venue_premadasa', name: 'R. Premadasa Stadium', city: 'Colombo', country: 'Sri Lanka', capacity: 35000, latitude: 6.9405, longitude: 79.8711 },
  { id: 'venue_lords', name: "Lord's Cricket Ground", city: 'London', country: 'England', capacity: 31100, latitude: 51.5299, longitude: -0.1727 },
  { id: 'venue_wankhede', name: 'Wankhede Stadium', city: 'Mumbai', country: 'India', capacity: 33108, latitude: 18.9389, longitude: 72.8258 },
  { id: 'venue_bernabeu', name: 'Santiago Bernabéu', city: 'Madrid', country: 'Spain', capacity: 81044, latitude: 40.4531, longitude: -3.6883 },
  { id: 'venue_emirates', name: 'Emirates Stadium', city: 'London', country: 'England', capacity: 60704, latitude: 51.5549, longitude: -0.1084 },
];

// ---------------------------------------------------------------------------
// Master Team & Player Resolution Engine
// ---------------------------------------------------------------------------
export function getStandardizedTeams() {
  const teamsMap = new Map();

  const predefined = [
    { id: 'team_hampshire', name: 'Hampshire', shortName: 'HAM', logo: 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=100&auto=format&fit=crop&q=80', country: 'England', coach: 'Adrian Birrell', captain: 'James Vince', founded: 1863 },
    { id: 'team_glamorgan', name: 'Glamorgan', shortName: 'GLA', logo: 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=100&auto=format&fit=crop&q=80', country: 'Wales', coach: 'Grant Bradburn', captain: 'Sam Northeast', founded: 1888 },
    { id: 'team_colombo', name: 'Colombo Kaps', shortName: 'CK', logo: 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=100&auto=format&fit=crop&q=80', country: 'Sri Lanka', coach: 'Sanath Jayasuriya', captain: 'Sahan Dhananjaya', founded: 2020 },
    { id: 'team_kandy', name: 'Kandy Royals', shortName: 'KR', logo: 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=100&auto=format&fit=crop&q=80', country: 'Sri Lanka', coach: 'Graham Ford', captain: 'Pathum Nissanka', founded: 2020 },
    { id: 'team_london_spirit', name: 'London Spirit', shortName: 'LNS', logo: 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=100&auto=format&fit=crop&q=80', country: 'England', coach: 'Trevor Bayliss', captain: 'Dan Lawrence', founded: 2019 },
    { id: 'team_southern_brave', name: 'Southern Brave', shortName: 'SOB', logo: 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=100&auto=format&fit=crop&q=80', country: 'England', coach: 'Stephen Fleming', captain: 'James Vince', founded: 2019 },
    { id: 'team_india', name: 'India', shortName: 'IND', logo: 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=100&auto=format&fit=crop&q=80', country: 'India', coach: 'Gautam Gambhir', captain: 'Rohit Sharma', founded: 1932 },
    { id: 'team_australia', name: 'Australia', shortName: 'AUS', logo: 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=100&auto=format&fit=crop&q=80', country: 'Australia', coach: 'Andrew McDonald', captain: 'Pat Cummins', founded: 1877 },
    { id: 'team_england', name: 'England', shortName: 'ENG', logo: 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=100&auto=format&fit=crop&q=80', country: 'England', coach: 'Brendon McCullum', captain: 'Jos Buttler', founded: 1877 },
    { id: 'team_real_madrid', name: 'Real Madrid', shortName: 'RMA', logo: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=100&auto=format&fit=crop&q=80', country: 'Spain', coach: 'Carlo Ancelotti', captain: 'Luka Modrić', founded: 1902 },
    { id: 'team_arsenal', name: 'Arsenal FC', shortName: 'ARS', logo: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=100&auto=format&fit=crop&q=80', country: 'England', coach: 'Mikel Arteta', captain: 'Martin Ødegaard', founded: 1886 },
    { id: 'team_lakers', name: 'LA Lakers', shortName: 'LAL', logo: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=100&auto=format&fit=crop&q=80', country: 'United States', coach: 'JJ Redick', captain: 'LeBron James', founded: 1947 },
  ];

  predefined.forEach(t => teamsMap.set(t.id, t));
  return Array.from(teamsMap.values());
}

export function getPlayersForTeam(teamIdOrName) {
  const roster = getRosterForTeam(teamIdOrName);
  const batters = roster?.batters || ['Player A', 'Player B', 'Player C'];
  const bowlers = roster?.bowlers || ['Bowler X', 'Bowler Y'];

  const allNames = [...batters, ...bowlers];
  return allNames.map((name, idx) => ({
    playerId: `ply_${String(name).toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
    teamId: teamIdOrName,
    name,
    age: 24 + (idx % 12),
    country: 'International',
    position: idx < batters.length ? 'Batter' : 'Bowler',
    height: `${175 + (idx % 15)} cm`,
    weight: `${70 + (idx % 20)} kg`,
    image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    stats: {
      matches: 48 + (idx * 5),
      runs: idx < batters.length ? 1250 + (idx * 310) : 180 + (idx * 15),
      wickets: idx >= batters.length ? 65 + (idx * 12) : 4 + idx,
      average: idx < batters.length ? (32.4 + (idx * 1.8)).toFixed(2) : (18.5 + (idx * 0.9)).toFixed(2),
      strikeRate: idx < batters.length ? (138.5 + (idx * 4.2)).toFixed(2) : (14.2 + (idx * 0.5)).toFixed(2),
    },
  }));
}

// ---------------------------------------------------------------------------
// 5. Master Matches Fetcher & Filters
// ---------------------------------------------------------------------------
export async function getAllApiMatches() {
  const aggregated = await aggregateLiveScores({ force: false });
  return aggregated.matches || [];
}

export async function getMatchesFiltered(filters = {}) {
  const rawMatches = await getAllApiMatches();
  let result = rawMatches;

  if (filters.sport) {
    const sp = String(filters.sport).toLowerCase();
    result = result.filter(m => String(m.sport || '').toLowerCase() === sp);
  }

  if (filters.status) {
    const st = String(filters.status).toLowerCase();
    if (st === 'live') {
      result = result.filter(m => m.isLive || m.matchState === 'in');
    } else if (st === 'upcoming' || st === 'scheduled') {
      result = result.filter(m => m.matchState === 'pre');
    } else if (st === 'completed') {
      result = result.filter(m => m.matchState === 'post');
    }
  }

  if (filters.search) {
    const q = String(filters.search).toLowerCase();
    result = result.filter(m =>
      m.team1?.name?.toLowerCase().includes(q) ||
      m.team2?.name?.toLowerCase().includes(q) ||
      (m.league || m.seriesName || '').toLowerCase().includes(q)
    );
  }

  return result;
}

// ---------------------------------------------------------------------------
// 6. Match Details Builder
// ---------------------------------------------------------------------------
export async function getSingleMatchDetails(matchId) {
  const all = await getAllApiMatches();
  const match = all.find(m => String(m.id) === String(matchId));
  if (!match) return null;

  let detailData = null;
  try {
    detailData = await fetchMatchDetail(match, { fast: false });
  } catch (err) {
    console.warn('[SportsDataService] Error fetching detailed match data:', err.message);
  }

  const team1Name = match.team1?.name || 'Team 1';
  const team2Name = match.team2?.name || 'Team 2';

  const t1Players = getPlayersForTeam(team1Name);
  const t2Players = getPlayersForTeam(team2Name);

  return {
    matchId: match.id,
    match,
    detailData,
    score: {
      team1: match.team1,
      team2: match.team2,
      liveDetails: match.liveDetails || {},
      status: match.time || 'In Progress',
    },
    events: [
      { id: 'evt_1', type: 'Four', minute: '0.4 ov', team: team1Name, description: `${t1Players[0]?.name || 'Batter'} hits a boundary for 4 runs` },
      { id: 'evt_2', type: 'Six', minute: '1.2 ov', team: team1Name, description: `${t1Players[0]?.name || 'Batter'} launches a huge six!` },
      { id: 'evt_3', type: 'Wicket', minute: '2.1 ov', team: team1Name, description: `WICKET! ${t1Players[1]?.name || 'Batter'} caught by keeper` },
    ],
    commentary: [
      { over: '2.1', ball: '2.1', text: `OUT! Caught by keeper. Outstanding delivery!`, isWicket: true },
      { over: '1.2', ball: '1.2', text: `SIX! Smashed over deep mid-wicket for 6 runs!`, isSix: true },
      { over: '0.4', ball: '0.4', text: `FOUR! Driven beautifully past extra cover.`, isFour: true },
    ],
    statistics: {
      team1: { possession: '54%', totalShots: 14, shotsOnTarget: 6, fouls: 8, yellowCards: 1 },
      team2: { possession: '46%', totalShots: 9, shotsOnTarget: 3, fouls: 11, yellowCards: 2 },
    },
    lineups: {
      team1: { name: team1Name, players: t1Players },
      team2: { name: team2Name, players: t2Players },
    },
    headToHead: {
      totalPlayed: 12,
      team1Wins: 6,
      team2Wins: 4,
      draws: 2,
      lastMatch: `${team1Name} won by 4 wickets (2025)`,
    },
  };
}

// ---------------------------------------------------------------------------
// 7. Standings & Rankings
// ---------------------------------------------------------------------------
export function getStandingsCatalog() {
  return [
    { rank: 1, team: 'Hampshire', played: 14, won: 10, lost: 3, tied: 1, points: 21, nrr: '+1.425' },
    { rank: 2, team: 'Glamorgan', played: 14, won: 9, lost: 4, tied: 1, points: 19, nrr: '+0.890' },
    { rank: 3, team: 'Southern Brave', played: 14, won: 8, lost: 5, tied: 1, points: 17, nrr: '+0.450' },
    { rank: 4, team: 'London Spirit', played: 14, won: 7, lost: 7, tied: 0, points: 14, nrr: '-0.120' },
  ];
}

export function getRankingsCatalog() {
  return {
    teams: [
      { rank: 1, team: 'India', rating: 121, points: 4320 },
      { rank: 2, team: 'Australia', rating: 118, points: 4150 },
      { rank: 3, team: 'England', rating: 115, points: 3980 },
      { rank: 4, team: 'South Africa', rating: 108, points: 3620 },
    ],
    players: [
      { rank: 1, player: 'James Vince', team: 'Hampshire', rating: 890, category: 'Batting' },
      { rank: 2, player: 'Sam Northeast', team: 'Glamorgan', rating: 865, category: 'Batting' },
      { rank: 3, player: 'Pathum Nissanka', team: 'Sri Lanka', rating: 842, category: 'Batting' },
      { rank: 4, player: 'Jasprit Bumrah', team: 'India', rating: 905, category: 'Bowling' },
    ],
  };
}

// ---------------------------------------------------------------------------
// 8. Global Multi-Entity Search Engine
// ---------------------------------------------------------------------------
export async function performGlobalSearch(query = '') {
  const q = String(query).toLowerCase().trim();
  if (!q) {
    return { sports: [], teams: [], players: [], competitions: [], matches: [] };
  }

  const sports = SPORTS_CATALOG.filter(s => s.name.toLowerCase().includes(q) || s.slug.includes(q));
  const countries = COUNTRIES_CATALOG.filter(c => c.name.toLowerCase().includes(q) || c.isoCode.toLowerCase().includes(q));
  const competitions = COMPETITIONS_CATALOG.filter(c => c.name.toLowerCase().includes(q));
  const teams = getStandardizedTeams().filter(t => t.name.toLowerCase().includes(q) || t.shortName.toLowerCase().includes(q));
  const players = getPlayersForTeam('Hampshire').filter(p => p.name.toLowerCase().includes(q));

  const allMatches = await getAllApiMatches();
  const matches = allMatches.filter(m =>
    m.team1?.name?.toLowerCase().includes(q) ||
    m.team2?.name?.toLowerCase().includes(q) ||
    (m.league || m.seriesName || '').toLowerCase().includes(q)
  );

  return {
    query,
    sports,
    countries,
    competitions,
    teams,
    players,
    matches,
  };
}
