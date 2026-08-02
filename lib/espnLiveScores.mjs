/**
 * ESPN Live Scores — server-side fetcher.
 * Fetches from ESPN's public scoreboard endpoints for cricket, soccer,
 * basketball, tennis, and american football.
 */

// ---------------------------------------------------------------------------
// Endpoint registry — grouped by sport
// ---------------------------------------------------------------------------
const ESPN_ENDPOINTS = [
  // Cricket
  { url: 'https://site.api.espn.com/apis/site/v2/sports/cricket/8048/scoreboard', sport: 'cricket', league: 'ICC' },
  { url: 'https://site.api.espn.com/apis/site/v2/sports/cricket/15414/scoreboard', sport: 'cricket', league: 'T20 Leagues' },
  { url: 'https://site.api.espn.com/apis/site/v2/sports/cricket/19601/scoreboard', sport: 'cricket', league: 'Internationals' },
  { url: 'https://site.api.espn.com/apis/site/v2/sports/cricket/21376/scoreboard', sport: 'cricket', league: 'Domestic' },

  // Soccer — top European leagues + Indian + MLS
  { url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard', sport: 'soccer', league: 'Premier League' },
  { url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard', sport: 'soccer', league: 'La Liga' },
  { url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/ger.1/scoreboard', sport: 'soccer', league: 'Bundesliga' },
  { url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/scoreboard', sport: 'soccer', league: 'Serie A' },
  { url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/scoreboard', sport: 'soccer', league: 'Ligue 1' },
  { url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/scoreboard', sport: 'soccer', league: 'MLS' },
  { url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/ind.1/scoreboard', sport: 'soccer', league: 'ISL' },
  { url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard', sport: 'soccer', league: 'Champions League' },
  { url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.europa/scoreboard', sport: 'soccer', league: 'Europa League' },

  // Basketball — NBA, WNBA
  { url: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard', sport: 'basketball', league: 'NBA' },
  { url: 'https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard', sport: 'basketball', league: 'WNBA' },

  // Tennis — ATP, WTA
  { url: 'https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard', sport: 'tennis', league: 'ATP' },
  { url: 'https://site.api.espn.com/apis/site/v2/sports/tennis/wta/scoreboard', sport: 'tennis', league: 'WTA' },

  // American Football — NFL
  { url: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard', sport: 'american-football', league: 'NFL' },
];

// ---------------------------------------------------------------------------
// Sport color map (matches the frontend sportsCategories)
// ---------------------------------------------------------------------------
const SPORT_COLORS = {
  cricket: '#f97316',
  soccer: '#22c55e',
  basketball: '#f59e0b',
  tennis: '#14b8a6',
  'american-football': '#b45309',
};

// ---------------------------------------------------------------------------
// Shared utilities
// ---------------------------------------------------------------------------
function normalizeTeamName(name = '') {
  return String(name)
    .toLowerCase()
    .replace(/\(men\)|\(women\)/gi, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function shortName(name = '', fallback = 'TBD') {
  const cleaned = String(name).trim();
  if (!cleaned) return fallback;
  const words = cleaned.split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.map((w) => w[0]).join('').slice(0, 3).toUpperCase();
}

function getStableMatchOdds(matchId, { hasDraw = false } = {}) {
  const seed = [...matchId].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const team1 = Number((1.35 + (seed % 90) / 100).toFixed(2));
  const team2 = Number((1.35 + ((seed * 13) % 95) / 100).toFixed(2));
  const odds = { team1, team2 };
  if (hasDraw) {
    odds.draw = Number((2.6 + ((seed * 3) % 80) / 100).toFixed(2));
  }
  return odds;
}

function safeNum(value, fallback = 0) {
  const n = typeof value === 'number' ? value : parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function getBaseMatchFields(evt, sport, idPrefix) {
  const comp = evt.competitions?.[0];
  const competitors = comp?.competitors || [];
  if (competitors.length < 2) return null;

  const home = competitors.find((c) => c.homeAway === 'home') || competitors[0];
  const away = competitors.find((c) => c.homeAway === 'away') || competitors[1];
  const state = evt.status?.type?.state || 'pre';
  const statusDetail = evt.status?.type?.detail || '';
  const isLive = state === 'in';
  const isCompleted = state === 'post';

  const homeName = (home.team?.displayName || home.athlete?.displayName || 'Team A')
    .replace(/\(Men\)|\(Women\)/gi, '').trim();
  const awayName = (away.team?.displayName || away.athlete?.displayName || 'Team B')
    .replace(/\(Men\)|\(Women\)/gi, '').trim();
  const matchId = `${idPrefix}_${evt.id}`;

  let timeDisplay = 'Scheduled';
  if (isLive) timeDisplay = 'Live';
  else if (isCompleted) timeDisplay = 'Completed';

  return {
    home, away, comp, state, statusDetail, isLive, isCompleted,
    homeName, awayName, matchId, timeDisplay,
  };
}

// ---------------------------------------------------------------------------
// Sport-specific mappers
// ---------------------------------------------------------------------------

function mapCricketEvent(evt) {
  const base = getBaseMatchFields(evt, 'cricket', 'api_cric');
  if (!base) return null;
  const { home, away, comp, state, statusDetail, isLive, isCompleted, homeName, awayName, matchId, timeDisplay } = base;

  const shortDetail = evt.status?.type?.shortDetail || '';
  const homeScore = home.score || '';
  const awayScore = away.score || '';
  const [hRunsRaw, hWicketsRaw] = homeScore.includes('/')
    ? homeScore.split('/').map(Number)
    : [parseInt(homeScore, 10), 0];
  const [aRunsRaw, aWicketsRaw] = awayScore.includes('/')
    ? awayScore.split('/').map(Number)
    : [parseInt(awayScore, 10), 0];

  let overs = '0.0';
  const ovMatch = shortDetail.match(/\(([0-9.]+)\s*[Oo]v/);
  if (ovMatch) overs = ovMatch[1];
  if (overs === '0.0') {
    const ovMatch2 = statusDetail.match(/\(([0-9.]+)\s*[Oo]v/);
    if (ovMatch2) overs = ovMatch2[1];
  }

  return {
    id: matchId,
    source: 'espn',
    league: comp?.name || evt.name || 'Cricket',
    sport: 'cricket',
    sportColor: SPORT_COLORS.cricket,
    time: timeDisplay,
    isLive,
    matchState: state,
    team1: { name: homeName, shortName: home.team?.abbreviation || shortName(homeName), color: '#22c55e' },
    team2: { name: awayName, shortName: away.team?.abbreviation || shortName(awayName), color: '#e5e7eb' },
    odds: getStableMatchOdds(matchId),
    liveDetails: {
      runs: safeNum(hRunsRaw),
      wickets: safeNum(hWicketsRaw),
      overs,
      score2: safeNum(aRunsRaw),
      wickets2: safeNum(aWicketsRaw),
      overs2: '20.0',
      commentary: statusDetail,
    },
    pairKey: [normalizeTeamName(homeName), normalizeTeamName(awayName)].sort().join('|'),
  };
}

function mapSoccerEvent(evt) {
  const base = getBaseMatchFields(evt, 'soccer', 'api_soc');
  if (!base) return null;
  const { home, away, comp, state, statusDetail, isLive, isCompleted, homeName, awayName, matchId, timeDisplay } = base;

  const clock = evt.status?.displayClock || '';
  const period = evt.status?.period || 0;

  const time = isCompleted ? 'FT' : timeDisplay;

  return {
    id: matchId,
    source: 'espn',
    league: comp?.name || evt.name || 'Soccer',
    sport: 'soccer',
    sportColor: SPORT_COLORS.soccer,
    time,
    isLive,
    matchState: state,
    team1: { name: homeName, shortName: home.team?.abbreviation || shortName(homeName), color: '#6cb4ee' },
    team2: { name: awayName, shortName: away.team?.abbreviation || shortName(awayName), color: '#ef4444' },
    odds: getStableMatchOdds(matchId, { hasDraw: true }),
    liveDetails: {
      score1: safeNum(parseInt(home.score, 10)),
      score2: safeNum(parseInt(away.score, 10)),
      minute: isLive ? `${clock}' ${period >= 2 ? '2nd Half' : '1st Half'}` : (isCompleted ? 'Full Time' : 'Scheduled'),
      commentary: statusDetail,
    },
    pairKey: [normalizeTeamName(homeName), normalizeTeamName(awayName)].sort().join('|'),
  };
}

function mapBasketballEvent(evt) {
  const base = getBaseMatchFields(evt, 'basketball', 'api_bball');
  if (!base) return null;
  const { home, away, comp, state, statusDetail, isLive, isCompleted, homeName, awayName, matchId, timeDisplay } = base;

  const clock = evt.status?.displayClock || '';
  const period = evt.status?.period || 0;

  const periodLabels = { 1: 'Q1', 2: 'Q2', 3: 'Q3', 4: 'Q4' };
  const periodLabel = period > 4 ? `OT${period - 4}` : (periodLabels[period] || '');
  const time = isCompleted ? 'FT' : timeDisplay;

  // Quarter scores
  const homeQuarters = (home.linescores || []).map((q) => q.value || 0);
  const awayQuarters = (away.linescores || []).map((q) => q.value || 0);

  return {
    id: matchId,
    source: 'espn',
    league: comp?.name || evt.name || 'Basketball',
    sport: 'basketball',
    sportColor: SPORT_COLORS.basketball,
    time,
    isLive,
    matchState: state,
    team1: { name: homeName, shortName: home.team?.abbreviation || shortName(homeName), color: '#f59e0b' },
    team2: { name: awayName, shortName: away.team?.abbreviation || shortName(awayName), color: '#6366f1' },
    odds: getStableMatchOdds(matchId),
    liveDetails: {
      score1: safeNum(parseInt(home.score, 10)),
      score2: safeNum(parseInt(away.score, 10)),
      quarter: isLive ? `${periodLabel} ${clock}` : (isCompleted ? 'Final' : 'Scheduled'),
      quarters1: homeQuarters,
      quarters2: awayQuarters,
      commentary: statusDetail,
    },
    pairKey: [normalizeTeamName(homeName), normalizeTeamName(awayName)].sort().join('|'),
  };
}

function mapTennisEvent(evt) {
  const comp = evt.competitions?.[0];
  const competitors = comp?.competitors || [];
  if (competitors.length < 2) return null;

  const player1 = competitors[0];
  const player2 = competitors[1];
  const state = evt.status?.type?.state || 'pre';
  const statusDetail = evt.status?.type?.detail || '';
  const isLive = state === 'in';
  const isCompleted = state === 'post';

  // Tennis uses athlete names
  const p1Name = player1.athlete?.displayName || player1.team?.displayName || 'Player 1';
  const p2Name = player2.athlete?.displayName || player2.team?.displayName || 'Player 2';
  const matchId = `api_ten_${evt.id}`;

  let timeDisplay = 'Scheduled';
  if (isLive) timeDisplay = 'Live';
  else if (isCompleted) timeDisplay = 'Completed';

  // Set scores
  const p1Sets = (player1.linescores || []).map((s) => s.value || 0);
  const p2Sets = (player2.linescores || []).map((s) => s.value || 0);

  // Generate short name from player's last name
  const p1Short = p1Name.split(/\s+/).pop()?.slice(0, 3).toUpperCase() || 'P1';
  const p2Short = p2Name.split(/\s+/).pop()?.slice(0, 3).toUpperCase() || 'P2';

  return {
    id: matchId,
    source: 'espn',
    league: comp?.name || evt.name || 'Tennis',
    sport: 'tennis',
    sportColor: SPORT_COLORS.tennis,
    time: timeDisplay,
    isLive,
    matchState: state,
    team1: { name: p1Name, shortName: p1Short, color: '#14b8a6' },
    team2: { name: p2Name, shortName: p2Short, color: '#f97316' },
    odds: getStableMatchOdds(matchId),
    liveDetails: {
      score1: safeNum(parseInt(player1.score, 10)),
      score2: safeNum(parseInt(player2.score, 10)),
      sets1: p1Sets,
      sets2: p2Sets,
      currentSet: isLive ? `Set ${Math.max(p1Sets.length, 1)}` : (isCompleted ? 'Final' : 'Scheduled'),
      commentary: statusDetail,
    },
    pairKey: [normalizeTeamName(p1Name), normalizeTeamName(p2Name)].sort().join('|'),
  };
}

function mapAmericanFootballEvent(evt) {
  const base = getBaseMatchFields(evt, 'american-football', 'api_nfl');
  if (!base) return null;
  const { home, away, comp, state, statusDetail, isLive, isCompleted, homeName, awayName, matchId, timeDisplay } = base;

  const clock = evt.status?.displayClock || '';
  const period = evt.status?.period || 0;

  const periodLabels = { 1: 'Q1', 2: 'Q2', 3: 'Q3', 4: 'Q4' };
  const periodLabel = period > 4 ? 'OT' : (periodLabels[period] || '');
  const time = isCompleted ? 'FT' : timeDisplay;

  // Quarter scores
  const homeQuarters = (home.linescores || []).map((q) => q.value || 0);
  const awayQuarters = (away.linescores || []).map((q) => q.value || 0);

  return {
    id: matchId,
    source: 'espn',
    league: comp?.name || evt.name || 'NFL',
    sport: 'american-football',
    sportColor: SPORT_COLORS['american-football'],
    time,
    isLive,
    matchState: state,
    team1: { name: homeName, shortName: home.team?.abbreviation || shortName(homeName), color: '#b45309' },
    team2: { name: awayName, shortName: away.team?.abbreviation || shortName(awayName), color: '#1e40af' },
    odds: getStableMatchOdds(matchId),
    liveDetails: {
      score1: safeNum(parseInt(home.score, 10)),
      score2: safeNum(parseInt(away.score, 10)),
      quarter: isLive ? `${periodLabel} ${clock}` : (isCompleted ? 'Final' : 'Scheduled'),
      quarters1: homeQuarters,
      quarters2: awayQuarters,
      commentary: statusDetail,
    },
    pairKey: [normalizeTeamName(homeName), normalizeTeamName(awayName)].sort().join('|'),
  };
}

// ---------------------------------------------------------------------------
// Mapper registry — maps sport name → mapper function
// ---------------------------------------------------------------------------
export {
  mapCricketEvent,
  mapSoccerEvent,
  mapBasketballEvent,
  mapTennisEvent,
  mapAmericanFootballEvent,
};

export { ESPN_ENDPOINTS };

// ---------------------------------------------------------------------------
// Main fetch function
// ---------------------------------------------------------------------------
export async function fetchEspnLiveScores() {
  const results = await Promise.allSettled(ESPN_ENDPOINTS.map((ep) => fetch(ep.url)));
  const matches = [];
  const sportCounts = {};

  const SPORT_MAPPERS = {
    cricket: mapCricketEvent,
    soccer: mapSoccerEvent,
    basketball: mapBasketballEvent,
    tennis: mapTennisEvent,
    'american-football': mapAmericanFootballEvent,
  };

  for (let i = 0; i < results.length; i += 1) {
    const result = results[i];
    if (result.status !== 'fulfilled' || !result.value.ok) continue;

    const data = await result.value.json();
    const events = data.events || [];
    const ep = ESPN_ENDPOINTS[i];
    const sport = ep.sport;
    const mapper = SPORT_MAPPERS[sport];
    if (!mapper) continue;

    const espnPath = ep.url.match(/sports\/(.+)\/scoreboard/)?.[1];

    sportCounts[sport] = (sportCounts[sport] || 0) + events.length;

    for (const evt of events) {
      const mapped = mapper(evt);
      if (mapped) {
        matches.push({
          ...mapped,
          espnEventId: evt.id,
          espnPath,
        });
      }
    }
  }

  return {
    source: 'espn',
    fetchedAt: new Date().toISOString(),
    matches,
    counts: { ...sportCounts, total: matches.length },
  };
}
