/**
 * ESPN Live Scores — server-side fetcher.
 * Fetches from ESPN's public scoreboard endpoints for cricket and soccer.
 */

const ESPN_ENDPOINTS = [
  { url: 'https://site.api.espn.com/apis/site/v2/sports/cricket/8048/scoreboard', sport: 'cricket' },
  { url: 'https://site.api.espn.com/apis/site/v2/sports/cricket/15414/scoreboard', sport: 'cricket' },
  { url: 'https://site.api.espn.com/apis/site/v2/sports/cricket/19601/scoreboard', sport: 'cricket' },
  { url: 'https://site.api.espn.com/apis/site/v2/sports/cricket/21376/scoreboard', sport: 'cricket' },
  { url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard', sport: 'soccer' },
  { url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard', sport: 'soccer' },
  { url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/ger.1/scoreboard', sport: 'soccer' },
];

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

function mapCricketEvent(evt) {
  const comp = evt.competitions?.[0];
  const competitors = comp?.competitors || [];
  if (competitors.length < 2) return null;

  const home = competitors[0];
  const away = competitors[1];
  const state = evt.status?.type?.state || 'pre';
  const statusDetail = evt.status?.type?.detail || '';
  const shortDetail = evt.status?.type?.shortDetail || '';
  const isLive = state === 'in';
  const isCompleted = state === 'post';

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

  const homeName = (home.team?.displayName || 'Team A').replace(/\(Men\)|\(Women\)/gi, '').trim();
  const awayName = (away.team?.displayName || 'Team B').replace(/\(Men\)|\(Women\)/gi, '').trim();
  const matchId = `api_cric_${evt.id}`;
  const odds = getStableMatchOdds(matchId);

  let timeDisplay = 'Scheduled';
  if (isLive) timeDisplay = 'Live';
  else if (isCompleted) timeDisplay = 'Completed';

  return {
    id: matchId,
    source: 'espn',
    league: comp?.name || evt.name || 'Cricket',
    sport: 'cricket',
    sportColor: '#f97316',
    time: timeDisplay,
    isLive,
    matchState: state,
    team1: { name: homeName, shortName: home.team?.abbreviation || shortName(homeName), color: '#22c55e' },
    team2: { name: awayName, shortName: away.team?.abbreviation || shortName(awayName), color: '#e5e7eb' },
    odds,
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
  const comp = evt.competitions?.[0];
  const competitors = comp?.competitors || [];
  if (competitors.length < 2) return null;

  const home = competitors.find((c) => c.homeAway === 'home') || competitors[0];
  const away = competitors.find((c) => c.homeAway === 'away') || competitors[1];
  const state = evt.status?.type?.state || 'pre';
  const statusDetail = evt.status?.type?.detail || '';
  const isLive = state === 'in';
  const isCompleted = state === 'post';
  const clock = evt.status?.displayClock || '';
  const period = evt.status?.period || 0;

  const homeName = home.team?.displayName || 'Home';
  const awayName = away.team?.displayName || 'Away';
  const matchId = `api_soc_${evt.id}`;
  const odds = getStableMatchOdds(matchId, { hasDraw: true });

  let timeDisplay = 'Scheduled';
  if (isLive) timeDisplay = 'Live';
  else if (isCompleted) timeDisplay = 'FT';

  return {
    id: matchId,
    source: 'espn',
    league: comp?.name || evt.name || 'Soccer',
    sport: 'soccer',
    sportColor: '#22c55e',
    time: timeDisplay,
    isLive,
    matchState: state,
    team1: { name: homeName, shortName: home.team?.abbreviation || shortName(homeName), color: '#6cb4ee' },
    team2: { name: awayName, shortName: away.team?.abbreviation || shortName(awayName), color: '#ef4444' },
    odds,
    liveDetails: {
      score1: safeNum(parseInt(home.score, 10)),
      score2: safeNum(parseInt(away.score, 10)),
      minute: isLive ? `${clock}' ${period >= 2 ? '2nd Half' : '1st Half'}` : (isCompleted ? 'Full Time' : 'Scheduled'),
      commentary: statusDetail,
    },
    pairKey: [normalizeTeamName(homeName), normalizeTeamName(awayName)].sort().join('|'),
  };
}

export async function fetchEspnLiveScores() {
  const results = await Promise.allSettled(ESPN_ENDPOINTS.map((endpoint) => fetch(endpoint.url)));
  const matches = [];
  let cricketEvents = 0;
  let soccerEvents = 0;

  for (let i = 0; i < results.length; i += 1) {
    const result = results[i];
    if (result.status !== 'fulfilled' || !result.value.ok) continue;

    const data = await result.value.json();
    const events = data.events || [];
    if (ESPN_ENDPOINTS[i].sport === 'cricket') {
      cricketEvents += events.length;
      events.forEach((evt) => {
        const mapped = mapCricketEvent(evt);
        if (mapped) matches.push(mapped);
      });
    } else {
      soccerEvents += events.length;
      events.forEach((evt) => {
        const mapped = mapSoccerEvent(evt);
        if (mapped) matches.push(mapped);
      });
    }
  }

  return {
    source: 'espn',
    fetchedAt: new Date().toISOString(),
    matches,
    counts: { cricket: cricketEvents, soccer: soccerEvents, total: matches.length },
  };
}
