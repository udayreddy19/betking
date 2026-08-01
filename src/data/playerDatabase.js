/**
 * Local player profiles — career & T20 stats for featured squads.
 * Used when ESPN IDs are unavailable (mock matches / women's domestic).
 */

export const TEAM_SERIES_MAP = {
  'The Hundred Men': { seriesId: '19601', label: 'The Hundred' },
  'The Hundred Women': { seriesId: '21376', label: 'The Hundred Women' },
  'Lanka Premier League': { seriesId: '19943', label: 'Lanka Premier League' },
  'T20 Lanka Premier League': { seriesId: '19943', label: 'Lanka Premier League' },
  'IPL 2026': { seriesId: '8048', label: 'IPL' },
  'IPL SRL': { seriesId: '8048', label: 'IPL' },
};

const PLAYERS = {
  'j. root': {
    id: 'local-root',
    name: 'J. Root',
    fullName: 'Joseph William Root',
    team: 'Welsh Fire',
    role: 'Batter',
    battingStyle: 'Right-hand bat',
    bowlingStyle: 'Right-arm offbreak',
    career: { matches: 142, runs: 3587, average: 31.2, strikeRate: 133.4, hundreds: 2, fifties: 28 },
    t20: { matches: 142, runs: 3587, average: 31.2, strikeRate: 133.4 },
    bowling: { wickets: 8, economy: 7.2 },
    recentForm: '75 (42) vs BIR · 42* (28) vs OVL',
  },
  'j. cox': {
    id: 'local-cox',
    name: 'J. Cox',
    fullName: 'Jordan Cox',
    team: 'Welsh Fire',
    role: 'WK-Batter',
    battingStyle: 'Right-hand bat',
    bowlingStyle: '—',
    career: { matches: 48, runs: 1124, average: 28.8, strikeRate: 145.2, hundreds: 0, fifties: 8 },
    t20: { matches: 48, runs: 1124, average: 28.8, strikeRate: 145.2 },
    bowling: null,
    recentForm: '18 (14) vs BIR · 31 (22) vs NOS',
  },
  's. mahmood': {
    id: 'local-mahmood',
    name: 'S. Mahmood',
    fullName: 'Saqib Mahmood',
    team: 'Welsh Fire',
    role: 'Bowler',
    battingStyle: 'Right-hand bat',
    bowlingStyle: 'Right-arm fast-medium',
    career: { matches: 62, runs: 89, average: 8.1, strikeRate: 98.0, hundreds: 0, fifties: 0 },
    t20: { matches: 62, runs: 89, average: 8.1, strikeRate: 98.0 },
    bowling: { wickets: 78, economy: 8.1, average: 22.4, best: '4/18' },
    recentForm: '3/24 vs BIR · 2/31 vs OVL',
  },
  'j. bairstow': {
    id: 'local-bairstow',
    name: 'J. Bairstow',
    fullName: 'Jonny Bairstow',
    team: 'Welsh Fire',
    role: 'WK-Batter',
    battingStyle: 'Right-hand bat',
    bowlingStyle: '—',
    career: { matches: 98, runs: 2456, average: 34.5, strikeRate: 142.8, hundreds: 1, fifties: 18 },
    t20: { matches: 98, runs: 2456, average: 34.5, strikeRate: 142.8 },
    bowling: null,
    recentForm: '52 (38) vs BIR',
  },
  'l. livingstone': {
    id: 'local-livingstone',
    name: 'L. Livingstone',
    fullName: 'Liam Livingstone',
    team: 'Birmingham Phoenix',
    role: 'Allrounder',
    battingStyle: 'Right-hand bat',
    bowlingStyle: 'Right-arm legbreak',
    career: { matches: 88, runs: 1987, average: 29.4, strikeRate: 152.1, hundreds: 0, fifties: 12 },
    t20: { matches: 88, runs: 1987, average: 29.4, strikeRate: 152.1 },
    bowling: { wickets: 42, economy: 7.8, average: 24.1, best: '3/15' },
    recentForm: '45 (28) vs WEL',
  },
  'w. smeed': {
    id: 'local-smeed',
    name: 'W. Smeed',
    fullName: 'Will Smeed',
    team: 'Birmingham Phoenix',
    role: 'Batter',
    battingStyle: 'Right-hand bat',
    bowlingStyle: 'Right-arm offbreak',
    career: { matches: 36, runs: 892, average: 26.2, strikeRate: 158.3, hundreds: 0, fifties: 5 },
    t20: { matches: 36, runs: 892, average: 26.2, strikeRate: 158.3 },
    bowling: { wickets: 2, economy: 9.1 },
    recentForm: '62 (34) vs WEL',
  },
  'a. zampa': {
    id: 'local-zampa',
    name: 'A. Zampa',
    fullName: 'Adam Zampa',
    team: 'Birmingham Phoenix',
    role: 'Bowler',
    battingStyle: 'Right-hand bat',
    bowlingStyle: 'Right-arm legbreak',
    career: { matches: 54, runs: 112, average: 9.8, strikeRate: 88.0 },
    t20: { matches: 54, runs: 112, average: 9.8, strikeRate: 88.0 },
    bowling: { wickets: 65, economy: 7.4, average: 21.8, best: '4/22' },
    recentForm: '2/28 vs WEL',
  },
  'm. bouchier': {
    id: 'local-bouchier',
    name: 'M. Bouchier',
    fullName: 'Maia Bouchier',
    team: 'Southern Brave W',
    role: 'Batter',
    battingStyle: 'Right-hand bat',
    bowlingStyle: 'Right-arm medium',
    career: { matches: 52, runs: 1342, average: 30.5, strikeRate: 128.4, hundreds: 1, fifties: 9 },
    t20: { matches: 52, runs: 1342, average: 30.5, strikeRate: 128.4 },
    bowling: { wickets: 4, economy: 8.5 },
    recentForm: '28 (22) vs LON · 41 (35) vs TRE',
  },
  's. molineux': {
    id: 'local-molineux',
    name: 'S. Molineux',
    fullName: 'Sophie Molineux',
    team: 'Southern Brave W',
    role: 'Allrounder',
    battingStyle: 'Left-hand bat',
    bowlingStyle: 'Left-arm orthodox',
    career: { matches: 68, runs: 876, average: 18.2, strikeRate: 112.5 },
    t20: { matches: 68, runs: 876, average: 18.2, strikeRate: 112.5 },
    bowling: { wickets: 72, economy: 6.8, average: 19.2, best: '4/19' },
    recentForm: '14 (11) vs LON · 2/22 vs TRE',
  },
  'c. dean': {
    id: 'local-dean',
    name: 'C. Dean',
    fullName: 'Charlie Dean',
    team: 'London Spirit W',
    role: 'Bowler',
    battingStyle: 'Right-hand bat',
    bowlingStyle: 'Right-arm offbreak',
    career: { matches: 44, runs: 234, average: 14.6, strikeRate: 95.0 },
    t20: { matches: 44, runs: 234, average: 14.6, strikeRate: 95.0 },
    bowling: { wickets: 58, economy: 6.9, average: 18.4, best: '5/18' },
    recentForm: '3/26 vs SOU',
  },
  'd. wyatt': {
    id: 'local-wyatt',
    name: 'D. Wyatt',
    fullName: 'Danni Wyatt',
    team: 'Southern Brave W',
    role: 'Batter',
    battingStyle: 'Right-hand bat',
    bowlingStyle: 'Right-arm medium',
    career: { matches: 112, runs: 2890, average: 27.8, strikeRate: 136.2, hundreds: 2, fifties: 19 },
    t20: { matches: 112, runs: 2890, average: 27.8, strikeRate: 136.2 },
    bowling: { wickets: 12, economy: 7.9 },
    recentForm: '38 (29) vs LON',
  },
  'a. capsey': {
    id: 'local-capsey',
    name: 'A. Capsey',
    fullName: 'Alice Capsey',
    team: 'London Spirit W',
    role: 'Allrounder',
    battingStyle: 'Right-hand bat',
    bowlingStyle: 'Right-arm medium',
    career: { matches: 38, runs: 756, average: 24.4, strikeRate: 134.8 },
    t20: { matches: 38, runs: 756, average: 24.4, strikeRate: 134.8 },
    bowling: { wickets: 18, economy: 7.6 },
    recentForm: '22 (18) vs SOU',
  },
};

export const TEAM_ROSTERS = {
  'Birmingham Phoenix': {
    batters: ['L. Livingstone', 'W. Smeed', 'J. Root', 'J. Cox'],
    bowlers: ['A. Zampa', 'T. Southee', 'S. Mahmood'],
  },
  'Welsh Fire': {
    batters: ['J. Bairstow', 'T. Kohler-Cadmore', 'J. Root', 'J. Cox'],
    bowlers: ['S. Mahmood', 'D. Payne', 'M. Crane'],
  },
  'London Spirit W': {
    batters: ['M. Bouchier', 'S. Molineux', 'A. Capsey', 'D. Wyatt'],
    bowlers: ['C. Dean', 'L. Smith', 'A. Capsey'],
  },
  'Southern Brave W': {
    batters: ['D. Wyatt', 'S. Taylor', 'M. Bouchier', 'G. Adams'],
    bowlers: ['C. Dean', 'L. Smith', 'A. Capsey'],
  },
};

function normalizeKey(name) {
  return String(name || '').trim().toLowerCase();
}

export function getLocalPlayer(name) {
  return PLAYERS[normalizeKey(name)] || null;
}

export function getTeamRoster(teamName) {
  return TEAM_ROSTERS[teamName] || {
    batters: [`${teamName.split(' ')[0]} Opener`, `${teamName.split(' ')[0]} Batter 2`],
    bowlers: [`${teamName.split(' ')[0]} Bowler`],
  };
}

export function getSeriesIdForLeague(league) {
  return TEAM_SERIES_MAP[league]?.seriesId || null;
}

export function buildLocalPlayerProfile(name, team, matchStats = null) {
  const local = getLocalPlayer(name);
  const base = local || {
    id: `local-${normalizeKey(name).replace(/\s+/g, '-')}`,
    name,
    fullName: name,
    team,
    role: 'Player',
    battingStyle: '—',
    bowlingStyle: '—',
    career: null,
    t20: null,
    bowling: null,
    recentForm: null,
  };

  return {
    ...base,
    team: team || base.team,
    source: 'local',
    headshot: null,
    matchStats,
  };
}
