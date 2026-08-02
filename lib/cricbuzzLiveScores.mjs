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

function normalizeOvers(value, match = null) {
  const league = match?.league || match?.seriesName || '';
  if (/hundred/i.test(league)) {
    const str = String(value ?? '0');
    if (!str || str === '0') return '0.0';

    // Already in 5-ball overs form (e.g. "3.2") — keep it.
    if (str.includes('.')) {
      const parts = str.split('.');
      const whole = parseInt(parts[0], 10) || 0;
      const ball = parseInt(parts[1], 10) || 0;
      if (ball <= 5 && whole <= 20) return `${whole}.${ball}`;
    }

    // Live-scores JSON stores total balls bowled as an integer (e.g. 100, 15).
    const num = Number(value);
    if (Number.isFinite(num) && num >= 0 && num <= 100) {
      const balls = Math.round(num);
      return `${Math.floor(balls / 5)}.${balls % 5}`;
    }

    return '0.0';
  }

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
  const stateTitle = String(info.stateTitle || '').toLowerCase();
  const combined = `${state} ${status} ${stateTitle}`;

  if (/toss delayed|delayed due|rain delay|wet outfield|not started|match starts|start delayed|no play/i.test(status)) {
    return { matchState: 'pre', isLive: false, time: status };
  }

  if (state.includes('progress') || state === 'live' || /innings\s*break/i.test(combined)) {
    const timeLabel = /innings\s*break/i.test(combined) ? 'Innings Break' : 'Live';
    return { matchState: 'in', isLive: true, time: timeLabel };
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

function readScoreBlockInnings(scoreBlock = {}) {
  const entries = [];
  for (const key of ['inngs1', 'inngs2']) {
    const inn = scoreBlock[key];
    if (!inn) continue;
    entries.push({
      inningsId: inn.inningsId ?? (key === 'inngs2' ? 2 : 1),
      runs: inn.runs ?? 0,
      wickets: inn.wickets ?? 0,
      overs: inn.overs ?? 0,
    });
  }
  return entries;
}

function latestTeamInnings(entries) {
  if (!entries.length) return null;
  return entries.reduce((latest, entry) => (
    entry.inningsId >= (latest?.inningsId ?? 0) ? entry : latest
  ), null);
}

function parseOversBallCount(overs, match = null) {
  const league = match?.league || match?.seriesName || '';
  if (/hundred/i.test(league)) {
    const num = Number(overs);
    // Live-scores JSON stores balls directly (including values like 15 or 100).
    if (Number.isFinite(num) && Number.isInteger(num) && num >= 0 && num <= 100) {
      return num;
    }
    const str = String(overs ?? '0');
    const parts = str.split('.');
    const whole = parseInt(parts[0], 10) || 0;
    const ball = parseInt(parts[1], 10) || 0;
    return whole * 5 + ball;
  }
  const str = String(overs ?? '0');
  const parts = str.split('.');
  const whole = parseInt(parts[0], 10) || 0;
  const ball = parseInt(parts[1], 10) || 0;
  return whole * 6 + ball;
}

function inningsHasPlay(innings, match) {
  if (!innings) return false;
  const runs = innings.runs ?? 0;
  const wickets = innings.wickets ?? 0;
  const balls = parseOversBallCount(innings.overs, match);
  return runs > 0 || wickets > 0 || balls > 0;
}

function buildLiveDetails(info, matchScore, matchState = 'pre', match = null) {
  const commentary = info.status || info.stateTitle || '';

  if (matchState === 'pre') {
    return { commentary };
  }

  const team1Name = info.team1?.teamName || '';
  const team2Name = info.team2?.teamName || '';
  const team1SName = info.team1?.teamSName || '';
  const team2SName = info.team2?.teamSName || '';

  const allInnings = [
    ...readScoreBlockInnings(matchScore?.team1Score).map((inn) => ({
      ...inn,
      teamName: team1Name,
      teamSName: team1SName,
    })),
    ...readScoreBlockInnings(matchScore?.team2Score).map((inn) => ({
      ...inn,
      teamName: team2Name,
      teamSName: team2SName,
    })),
  ].sort((a, b) => a.inningsId - b.inningsId);

  const hasPlay = allInnings.some((inn) => inningsHasPlay(inn, match));
  if (!hasPlay) {
    return { commentary };
  }

  const team1Latest = latestTeamInnings(allInnings.filter((inn) => inn.teamName === team1Name));
  const team2Latest = latestTeamInnings(allInnings.filter((inn) => inn.teamName === team2Name));
  const firstInn = allInnings.find((inn) => inn.inningsId === 1) || allInnings[0];
  const chaseInn = allInnings.find((inn) => inn.inningsId === 2);

  const result = {
    commentary,
    runs: team1Latest?.runs ?? 0,
    wickets: team1Latest?.wickets ?? 0,
    overs: normalizeOvers(team1Latest?.overs ?? 0, match),
    score2: team2Latest?.runs ?? 0,
    wickets2: team2Latest?.wickets ?? 0,
    overs2: normalizeOvers(team2Latest?.overs ?? 0, match),
  };

  if (firstInn) {
    result.firstRuns = firstInn.runs;
    result.firstWickets = firstInn.wickets;
    result.firstOvers = normalizeOvers(firstInn.overs, match);
    result.firstTeamName = firstInn.teamSName || firstInn.teamName;
  }

  if (chaseInn) {
    result.chaseRuns = chaseInn.runs;
    result.chaseWickets = chaseInn.wickets;
    result.chaseOvers = normalizeOvers(chaseInn.overs, match);
    result.chaseTeamName = chaseInn.teamSName || chaseInn.teamName;
    result.chaseBallNbr = parseOversBallCount(chaseInn.overs, match);
  } else if (firstInn) {
    result.chaseBallNbr = parseOversBallCount(firstInn.overs, match);
  }

  return result;
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
    'England Domestic One-Day Cup 2026': 'One-Day Cup',
    'One-Day Cup, 2026': 'One-Day Cup',
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
  const matchMeta = { league, seriesName: info.seriesName };

  return {
    id: `cb_${info.matchId}`,
    source: 'cricbuzz',
    cricbuzzMatchId: info.matchId,
    cricbuzzSeriesId: info.seriesId,
    league,
    seriesName: info.seriesName,
    matchType,
    matchFormat: info.matchFormat || info.matchType || matchType,
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
    liveDetails: buildLiveDetails(info, raw.matchScore, state.matchState, matchMeta),
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
