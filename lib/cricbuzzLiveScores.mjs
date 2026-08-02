const CRICBUZZ_LIVE_URL = 'https://www.cricbuzz.com/cricket-match/live-scores';
const CRICBUZZ_SCHEDULE_URL = 'https://www.cricbuzz.com/cricket-schedule/upcoming-series';
const CRICBUZZ_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; BetKing/1.0)',
  Accept: 'text/html,application/xhtml+xml',
  Referer: 'https://www.cricbuzz.com/',
};

function slugify(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function shortName(name = '', fallback = 'TBD') {
  const cleaned = String(name).trim();
  if (!cleaned) return fallback;
  const words = cleaned.split(/\s+/);
  if (words.length === 1) return cleaned.slice(0, 3).toUpperCase();
  return words.map((w) => w[0]).join('').slice(0, 4).toUpperCase();
}

function normalizeOvers(value) {
  const str = String(value ?? '0');
  if (!str || str === '0') return '0.0';

  const parts = str.split('.');
  const whole = parseInt(parts[0], 10) || 0;
  const ball = parseInt(parts[1], 10) || 0;

  // Cricbuzz uses ball number 1-6 in decimal part; 9.6 = 10 overs complete
  if (ball >= 6) {
    return `${whole + Math.floor(ball / 6)}.${ball % 6}`;
  }

  const num = Number(value);
  if (Number.isFinite(num) && num > 0 && !str.includes('.')) {
    return Number.isInteger(num) ? `${num}.0` : str;
  }

  return `${whole}.${ball}`;
}

function mapState(info = {}) {
  const state = String(info.state || '').toLowerCase();
  const status = String(info.status || '');

  if (/toss delayed|delayed due|rain delay|wet outfield|not started|match starts|start delayed|no play/i.test(status)) {
    return { matchState: 'pre', isLive: false, time: status };
  }

  if (state.includes('progress') || state === 'live') {
    return { matchState: 'in', isLive: true, time: 'Live' };
  }
  if (state.includes('complete') || state.includes('stumps') || state.includes('abandon')) {
    return { matchState: 'post', isLive: false, time: 'Completed' };
  }
  if (state.includes('preview') || status.toLowerCase().includes('preview')) {
    return { matchState: 'pre', isLive: false, time: 'Preview' };
  }
  if (state.includes('upcoming') || info.startDate) {
    const start = Number(info.startDate);
    if (start) {
      const date = new Date(start);
      return {
        matchState: 'pre',
        isLive: false,
        time: date.toLocaleString('en-IN', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        }),
      };
    }
    return { matchState: 'pre', isLive: false, time: 'Scheduled' };
  }
  return { matchState: 'pre', isLive: false, time: status || 'Scheduled' };
}

function extractInnings(scoreBlock = {}) {
  return scoreBlock.inngs2 || scoreBlock.inngs1 || null;
}

function parseOversBallCount(overs) {
  const str = String(overs ?? '0');
  const parts = str.split('.');
  const whole = parseInt(parts[0], 10) || 0;
  const ball = parseInt(parts[1], 10) || 0;
  return whole * 6 + ball;
}

function inningsHasPlay(innings) {
  if (!innings) return false;
  const runs = innings.runs ?? 0;
  const wickets = innings.wickets ?? 0;
  const balls = parseOversBallCount(innings.overs);
  return runs > 0 || wickets > 0 || balls > 0;
}

function buildLiveDetails(info, matchScore, matchState = 'pre') {
  const commentary = info.status || info.stateTitle || '';

  if (matchState === 'pre') {
    return { commentary };
  }

  const team1Innings = extractInnings(matchScore?.team1Score);
  const team2Innings = extractInnings(matchScore?.team2Score);
  const hasPlay = inningsHasPlay(team1Innings) || inningsHasPlay(team2Innings);

  if (!hasPlay) {
    return { commentary };
  }

  return {
    runs: team1Innings?.runs ?? 0,
    wickets: team1Innings?.wickets ?? 0,
    overs: normalizeOvers(team1Innings?.overs ?? 0),
    score2: team2Innings?.runs ?? 0,
    wickets2: team2Innings?.wickets ?? 0,
    overs2: normalizeOvers(team2Innings?.overs ?? 0),
    commentary,
  };
}

function mapSeriesName(seriesName = '') {
  const name = seriesName.trim();
  const mappings = {
    "The Hundred Men's Competition 2026": 'The Hundred Men',
    "The Hundred Women's Competition 2026": 'The Hundred Women',
    'LPL, 2026': 'T20 Lanka Premier League',
    'Lanka Premier League, 2026': 'T20 Lanka Premier League',
    'DPL 2026': 'Delhi Premier League',
    'Delhi Premier League, 2026': 'Delhi Premier League',
    'Global Super League 2026': 'Global Super League',
    'Bahrain tour of Kenya, 2026': 'T20 Series Kenya vs Bahrain',
    'England Domestic One-Day Cup': 'One-Day Cup',
    'West Indies v Pakistan, 2026': 'Test Series West Indies vs. Pakistan',
    'Lanka Premier League, 2026': 'T20 Lanka Premier League',
    'Lanka Premier League': 'T20 Lanka Premier League',
    'Delhi Premier League, 2026': 'Delhi Premier League',
    'Global Super League, 2026': 'Global Super League',
    'Pakistan tour of West Indies, 2026': 'Test Series West Indies vs. Pakistan',
    'Pakistan Women tour of Sri Lanka, 2026': 'T20 Series Sri Lanka vs Pakistan, Women',
    'Pakistan Women tour of Sri Lanka': 'T20 Series Sri Lanka vs Pakistan, Women',
    'Sri Lanka Women vs Pakistan Women': 'T20 Series Sri Lanka vs Pakistan, Women',
    'Indian Premier League SRL': 'Indian Premier League SRL',
    'T20 International SRL': 'T20 International SRL',
    'Quantum Cricket League': 'Quantum Cricket League',
  };
  return mappings[name] || name.replace(/,\s*2026$/, '').replace(/\s*2026$/, '').trim();
}

function mapMatch(raw, matchType = 'League') {
  const info = raw.matchInfo || raw;
  if (!info?.team1 || !info?.team2) return null;

  const state = mapState(info);
  const league = mapSeriesName(info.seriesName || 'Cricket');
  const team1Name = info.team1.teamName;
  const team2Name = info.team2.teamName;
  const pairKey = [team1Name, team2Name].sort().join('|').toLowerCase();

  return {
    id: `cb_${info.matchId}`,
    source: 'cricbuzz',
    cricbuzzMatchId: info.matchId,
    cricbuzzSeriesId: info.seriesId,
    league,
    seriesName: info.seriesName,
    matchType,
    sport: 'cricket',
    sportColor: '#f97316',
    time: state.time,
    isLive: state.isLive,
    matchState: state.matchState,
    team1: {
      name: team1Name,
      shortName: info.team1.teamSName || shortName(team1Name),
      color: '#22c55e',
    },
    team2: {
      name: team2Name,
      shortName: info.team2.teamSName || shortName(team2Name),
      color: '#e5e7eb',
    },
    liveDetails: buildLiveDetails(info, raw.matchScore, state.matchState),
    venue: info.venueInfo?.city || info.venueInfo?.ground || '',
    pairKey,
  };
}

function extractTypeMatches(html) {
  const marker = html.includes('"typeMatches":') ? '"typeMatches":' : 'typeMatches\\":';
  const start = html.indexOf(marker);
  if (start < 0) return [];

  let chunk = html.slice(start, start + 250000);
  if (chunk.includes('\\"')) {
    chunk = chunk.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }

  const arrStart = chunk.indexOf('[');
  if (arrStart < 0) return [];

  let depth = 0;
  for (let i = arrStart; i < chunk.length; i += 1) {
    const ch = chunk[i];
    if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(chunk.slice(arrStart, i + 1));
        } catch {
          return [];
        }
      }
    }
  }
  return [];
}

function flattenTypeMatches(typeMatches = []) {
  const matches = [];
  const seriesMap = new Map();

  for (const block of typeMatches) {
    const matchType = block.matchType || 'League';
    for (const group of block.seriesMatches || []) {
      const wrapper = group.seriesAdWrapper || {};
      const seriesId = wrapper.seriesId;
      const seriesName = wrapper.seriesName;
      if (seriesId && seriesName && !seriesMap.has(seriesId)) {
        seriesMap.set(seriesId, {
          id: `cb-series-${seriesId}`,
          seriesId,
          name: mapSeriesName(seriesName),
          rawName: seriesName,
          matchType,
        });
      }

      for (const raw of wrapper.matches || []) {
        const mapped = mapMatch(raw, matchType);
        if (mapped) matches.push(mapped);
      }
    }
  }

  return { matches, series: [...seriesMap.values()] };
}

function extractScheduleSeries(html) {
  const series = new Map();
  const pattern = /\/cricket-series\/(\d+)\/([^"'\\]+)/g;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const seriesId = Number(match[1]);
    const rawSlug = match[2].replace(/\\$/, '');
    const rawName = rawSlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    if (!series.has(seriesId)) {
      series.set(seriesId, {
        id: `cb-series-${seriesId}`,
        seriesId,
        name: mapSeriesName(rawName),
        rawName,
        matchType: 'Scheduled',
      });
    }
  }
  return [...series.values()];
}

async function fetchHtml(url) {
  const response = await fetch(url, { headers: CRICBUZZ_HEADERS });
  if (!response.ok) throw new Error(`Cricbuzz request failed (${response.status}) for ${url}`);
  return response.text();
}

export async function fetchCricbuzzMatches() {
  const [liveHtml, scheduleHtml] = await Promise.allSettled([
    fetchHtml(CRICBUZZ_LIVE_URL),
    fetchHtml(CRICBUZZ_SCHEDULE_URL),
  ]);

  let matches = [];
  let series = [];

  if (liveHtml.status === 'fulfilled') {
    const typeMatches = extractTypeMatches(liveHtml.value);
    const parsed = flattenTypeMatches(typeMatches);
    matches = parsed.matches;
    series = parsed.series;
  }

  if (scheduleHtml.status === 'fulfilled') {
    const scheduleSeries = extractScheduleSeries(scheduleHtml.value);
    const existingIds = new Set(series.map((s) => s.seriesId));
    for (const item of scheduleSeries) {
      if (!existingIds.has(item.seriesId)) series.push(item);
    }
  }

  const liveCount = matches.filter((m) => m.isLive).length;
  const upcomingCount = matches.filter((m) => m.matchState === 'pre').length;
  const completedCount = matches.filter((m) => m.matchState === 'post').length;

  return {
    source: 'cricbuzz',
    fetchedAt: new Date().toISOString(),
    counts: {
      total: matches.length,
      live: liveCount,
      upcoming: upcomingCount,
      completed: completedCount,
      series: series.length,
    },
    series,
    matches,
  };
}

export { mapSeriesName, slugify };
