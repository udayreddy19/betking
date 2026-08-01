const FANCODE_HOME = 'https://www.fancode.com';
const FANCODE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; BetKing/1.0; +https://betking.app)',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-IN,en;q=0.9',
};

const CRICKET_TOUR_URLS = [
  `${FANCODE_HOME}/cricket/tour/lanka-premier-league-2026-19768678/matches`,
  `${FANCODE_HOME}/cricket/tour/delhi-premier-league-2026-19783899/matches`,
  `${FANCODE_HOME}/cricket/tour/global-super-league-2026-19781961/matches`,
  `${FANCODE_HOME}/cricket/tour/india-tour-of-zimbabwe-2026-19726523/matches`,
  `${FANCODE_HOME}/cricket/tour/pakistan-tour-of-west-indies-2026-19752613/matches`,
];

const SOCCER_TOUR_URLS = [
  `${FANCODE_HOME}/football/tour/club-friendlies-2026-19784077/matches`,
  `${FANCODE_HOME}/football/tour/laliga-2026-27-19782952/matches`,
];

export function extractInitState(html) {
  const marker = 'window.__INIT_STATE__ = ';
  const start = html.indexOf(marker);
  if (start < 0) return null;

  const jsonStart = html.indexOf('{', start);
  if (jsonStart < 0) return null;

  let depth = 0;
  for (let i = jsonStart; i < html.length; i += 1) {
    const ch = html[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(jsonStart, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

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

function mapSport(slug = '', name = '') {
  const value = `${slug} ${name}`.toLowerCase();
  if (value.includes('cricket')) return 'cricket';
  if (value.includes('football') || value.includes('soccer')) return 'soccer';
  if (value.includes('basketball')) return 'basketball';
  if (value.includes('tennis')) return 'tennis';
  if (value.includes('kabaddi')) return 'kabaddi';
  return null;
}

function mapMatchState(status = '') {
  const value = String(status).toUpperCase();
  if (value === 'LIVE' || value === 'STARTED') return 'in';
  if (value === 'COMPLETED' || value === 'RESULT') return 'post';
  return 'pre';
}

function getLatestCricketInnings(cricketScore = []) {
  if (!Array.isArray(cricketScore) || !cricketScore.length) return null;
  return cricketScore[cricketScore.length - 1];
}

function parseCricketSquads(squads = []) {
  const parsed = squads.map((squad) => ({
    name: squad.name,
    shortName: squad.shortName || shortName(squad.name),
    color: squad.color || '#64748b',
    isBatting: squad.status?.cricket?.isBatting === true,
    innings: getLatestCricketInnings(squad.cricketScore),
  }));

  const batting = parsed.find((s) => s.isBatting);
  const completed = parsed.find((s) => s.innings && !s.isBatting);
  const firstInnings = parsed.find((s) => s.innings?.status === 'COMPLETED') || parsed.find((s) => s.innings);
  const secondInnings = batting?.innings ? batting : parsed.find((s) => s.innings?.status === 'IN_PROGRESS');

  const team1 = firstInnings || parsed[0] || { name: 'Team A', shortName: 'TMA' };
  const team2 = secondInnings && secondInnings !== team1 ? secondInnings : parsed[1] || { name: 'Team B', shortName: 'TMB' };

  const innings1 = team1.innings || {};
  const innings2 = team2.innings || {};

  return {
    team1: { name: team1.name, shortName: team1.shortName, color: team1.color },
    team2: { name: team2.name, shortName: team2.shortName, color: team2.color },
    liveDetails: {
      runs: innings1.runs ?? 0,
      wickets: innings1.wickets ?? 0,
      overs: String(innings1.overs ?? '0.0'),
      score2: innings2.runs ?? 0,
      wickets2: innings2.wickets ?? 0,
      overs2: String(innings2.overs ?? '0.0'),
    },
  };
}

function parseFootballSquads(squads = []) {
  const team1 = squads[0] || { name: 'Home', shortName: 'HOM' };
  const team2 = squads[1] || { name: 'Away', shortName: 'AWY' };
  const score1 = team1.footballScore?.[0]?.score ?? team1.footballScore?.score ?? 0;
  const score2 = team2.footballScore?.[0]?.score ?? team2.footballScore?.score ?? 0;

  return {
    team1: { name: team1.name, shortName: team1.shortName || shortName(team1.name), color: team1.color || '#6cb4ee' },
    team2: { name: team2.name, shortName: team2.shortName || shortName(team2.name), color: team2.color || '#ef4444' },
    liveDetails: {
      score1: Number(score1) || 0,
      score2: Number(score2) || 0,
      minute: 'Live',
      commentary: '',
    },
  };
}

function buildMatchFromScheduleItem(item) {
  const sport = mapSport(item.sport?.slug, item.sport?.name);
  if (!sport) return null;

  const matchState = mapMatchState(item.status);
  const isLive = matchState === 'in';
  const commentary = item.scorecard?.cricketScore?.description
    || item.scorecard?.footballScore?.description
    || item.scorecard?.cricketScore?.newDescription
    || '';

  let teams;
  if (sport === 'cricket') {
    teams = parseCricketSquads(item.squads);
    teams.liveDetails.commentary = commentary;
  } else if (sport === 'soccer') {
    teams = parseFootballSquads(item.squads);
    teams.liveDetails.commentary = commentary;
  } else {
    return null;
  }

  const league = item.tour?.name || item.matchDesc || item.name || 'FanCode Live';

  return {
    id: `fc_${item.id}`,
    source: 'fancode',
    fancodeMatchId: item.id,
    league,
    sport,
    sportColor: sport === 'cricket' ? '#f97316' : '#22c55e',
    time: isLive ? 'Live' : matchState === 'post' ? 'Completed' : 'Scheduled',
    isLive,
    matchState,
    team1: teams.team1,
    team2: teams.team2,
    liveDetails: teams.liveDetails,
    pairKey: [normalizeTeamName(teams.team1.name), normalizeTeamName(teams.team2.name)].sort().join('|'),
  };
}

function buildMatchFromLiveEdge(edge) {
  const sport = mapSport(edge.match?.sport?.slug, edge.match?.sport?.name);
  if (!sport) return null;

  const teams = edge.match?.teams || [];
  const team1 = teams[0] || { name: 'Team A' };
  const team2 = teams[1] || { name: 'Team B' };
  const matchState = mapMatchState(edge.status?.status);
  const isLive = matchState === 'in';
  const commentary = edge.status?.liveDesc || edge.status?.matchDesc || '';

  const base = {
    id: `fc_${edge.id || edge.match?.id}`,
    source: 'fancode',
    fancodeMatchId: edge.id || edge.match?.id,
    league: edge.tour?.name || edge.match?.name || 'FanCode Live',
    sport,
    sportColor: sport === 'cricket' ? '#f97316' : '#22c55e',
    time: isLive ? 'Live' : 'Scheduled',
    isLive,
    matchState,
    team1: {
      name: team1.name,
      shortName: team1.shortName || shortName(team1.name),
      color: team1.color || '#22c55e',
    },
    team2: {
      name: team2.name,
      shortName: team2.shortName || shortName(team2.name),
      color: team2.color || '#e5e7eb',
    },
    liveDetails: {
      commentary,
    },
    pairKey: [normalizeTeamName(team1.name), normalizeTeamName(team2.name)].sort().join('|'),
  };

  if (sport === 'cricket') {
    base.liveDetails = {
      ...base.liveDetails,
      runs: 0,
      wickets: 0,
      overs: '0.0',
      score2: 0,
      wickets2: 0,
      overs2: '0.0',
    };
  } else if (sport === 'soccer') {
    base.liveDetails = {
      ...base.liveDetails,
      score1: 0,
      score2: 0,
      minute: isLive ? 'Live' : 'Scheduled',
    };
  }

  return base;
}

function extractLiveNowMatches(state) {
  const key = Object.keys(state).find((k) => k.includes('LiveNowSegment') && state[k]?.liveNowSegment);
  if (!key) return [];
  return (state[key].liveNowSegment.edges || [])
    .map(buildMatchFromLiveEdge)
    .filter(Boolean);
}

function extractTourMatches(state) {
  const matches = [];
  for (const [key, value] of Object.entries(state)) {
    if (!key.includes('MatchScheduleTab') || !value?.response) continue;
    for (const bucket of ['today', 'future', 'past']) {
      for (const item of value.response[bucket] || []) {
        const mapped = buildMatchFromScheduleItem(item);
        if (mapped) matches.push(mapped);
      }
    }
  }
  return matches;
}

function dedupeFanCodeMatches(matches) {
  const byId = new Map();
  const byPair = new Map();

  for (const match of matches) {
    const existing = byId.get(match.id);
    if (!existing) {
      byId.set(match.id, match);
      byPair.set(match.pairKey, match);
      continue;
    }

    const existingHasScore = existing.sport === 'cricket'
      ? (existing.liveDetails?.runs > 0 || existing.liveDetails?.score2 > 0)
      : (existing.liveDetails?.score1 > 0 || existing.liveDetails?.score2 > 0);
    const nextHasScore = match.sport === 'cricket'
      ? (match.liveDetails?.runs > 0 || match.liveDetails?.score2 > 0)
      : (match.liveDetails?.score1 > 0 || match.liveDetails?.score2 > 0);

    if (!existingHasScore && nextHasScore) {
      byId.set(match.id, match);
      byPair.set(match.pairKey, match);
    }
  }

  return [...byId.values()];
}

async function fetchHtml(url) {
  const response = await fetch(url, { headers: FANCODE_HEADERS });
  if (!response.ok) throw new Error(`FanCode request failed (${response.status}) for ${url}`);
  return response.text();
}

export async function fetchFanCodeLiveScores() {
  const urls = [FANCODE_HOME, ...CRICKET_TOUR_URLS, ...SOCCER_TOUR_URLS];
  const results = await Promise.allSettled(urls.map((url) => fetchHtml(url)));

  const parsedMatches = [];
  let pagesFetched = 0;

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    const state = extractInitState(result.value);
    if (!state) continue;
    pagesFetched += 1;
    parsedMatches.push(...extractLiveNowMatches(state), ...extractTourMatches(state));
  }

  const matches = dedupeFanCodeMatches(parsedMatches);
  const cricketCount = matches.filter((m) => m.sport === 'cricket').length;
  const soccerCount = matches.filter((m) => m.sport === 'soccer').length;
  const liveCount = matches.filter((m) => m.isLive).length;

  return {
    source: 'fancode',
    fetchedAt: new Date().toISOString(),
    pagesFetched,
    counts: {
      total: matches.length,
      live: liveCount,
      cricket: cricketCount,
      soccer: soccerCount,
    },
    matches,
  };
}

export { normalizeTeamName };
