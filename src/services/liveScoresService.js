import { getStableMatchOdds, safeNum } from '../utils/odds';
import { normalizeTeamName } from '../utils/teamNames';

const ESPN_ENDPOINTS = [
  { url: 'https://site.api.espn.com/apis/site/v2/sports/cricket/8048/scoreboard', sport: 'cricket' },
  { url: 'https://site.api.espn.com/apis/site/v2/sports/cricket/15414/scoreboard', sport: 'cricket' },
  { url: 'https://site.api.espn.com/apis/site/v2/sports/cricket/19601/scoreboard', sport: 'cricket' },
  { url: 'https://site.api.espn.com/apis/site/v2/sports/cricket/21376/scoreboard', sport: 'cricket' },
  { url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard', sport: 'soccer' },
  { url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard', sport: 'soccer' },
  { url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/ger.1/scoreboard', sport: 'soccer' },
];

function shortName(name = '', fallback = 'TBD') {
  const cleaned = String(name).trim();
  if (!cleaned) return fallback;
  const words = cleaned.split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.map((w) => w[0]).join('').slice(0, 3).toUpperCase();
}

function mapCricketEvent(evt, oddsCache) {
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
  if (!oddsCache.has(matchId)) oddsCache.set(matchId, getStableMatchOdds(matchId));

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
    odds: oddsCache.get(matchId),
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

function mapSoccerEvent(evt, oddsCache) {
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
  if (!oddsCache.has(matchId)) oddsCache.set(matchId, getStableMatchOdds(matchId, { hasDraw: true }));

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
    odds: oddsCache.get(matchId),
    liveDetails: {
      score1: safeNum(parseInt(home.score, 10)),
      score2: safeNum(parseInt(away.score, 10)),
      minute: isLive ? `${clock}' ${period >= 2 ? '2nd Half' : '1st Half'}` : (isCompleted ? 'Full Time' : 'Scheduled'),
      commentary: statusDetail,
    },
    pairKey: [normalizeTeamName(homeName), normalizeTeamName(awayName)].sort().join('|'),
  };
}

export async function fetchEspnLiveScores(oddsCache = new Map()) {
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
        const mapped = mapCricketEvent(evt, oddsCache);
        if (mapped) matches.push(mapped);
      });
    } else {
      soccerEvents += events.length;
      events.forEach((evt) => {
        const mapped = mapSoccerEvent(evt, oddsCache);
        if (mapped) matches.push(mapped);
      });
    }
  }

  return {
    source: 'espn',
    matches,
    counts: { cricket: cricketEvents, soccer: soccerEvents, total: matches.length },
  };
}

export async function fetchFanCodeScores() {
  const response = await fetch('/api/fancode/live-scores');
  if (!response.ok) throw new Error(`FanCode API failed (${response.status})`);
  const data = await response.json();
  return {
    source: 'fancode',
    matches: data.matches || [],
    counts: data.counts || {},
    fetchedAt: data.fetchedAt,
  };
}

export function mergeLiveScoreSources(primaryMatches = [], secondaryMatches = []) {
  const merged = new Map();

  for (const match of [...secondaryMatches, ...primaryMatches]) {
    const key = match.pairKey || [normalizeTeamName(match.team1?.name), normalizeTeamName(match.team2?.name)].sort().join('|');
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, match);
      continue;
    }

    const existingHasScore = existing.sport === 'cricket'
      ? (existing.liveDetails?.runs > 0 || existing.liveDetails?.score2 > 0)
      : (existing.liveDetails?.score1 > 0 || existing.liveDetails?.score2 > 0);
    const nextHasScore = match.sport === 'cricket'
      ? (match.liveDetails?.runs > 0 || match.liveDetails?.score2 > 0)
      : (match.liveDetails?.score1 > 0 || match.liveDetails?.score2 > 0);

    const preferred = match.source === 'fancode' && nextHasScore ? match : existing;
    const fallback = preferred === match ? existing : match;

    merged.set(key, {
      ...fallback,
      ...preferred,
      liveDetails: {
        ...fallback.liveDetails,
        ...preferred.liveDetails,
      },
      isLive: preferred.isLive || fallback.isLive,
      matchState: preferred.isLive ? preferred.matchState : fallback.matchState,
      time: preferred.isLive ? preferred.time : fallback.time,
    });
  }

  return [...merged.values()];
}
