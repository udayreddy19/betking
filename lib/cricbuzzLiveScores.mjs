import { teamKitColors } from './jerseyColors.mjs';
import { formatTeamShortName } from '../src/utils/teamShortName.js';
import { resolveCricketOversFormat } from '../src/utils/cricketFormat.js';

const CRICBUZZ_LIVE_URL = 'https://www.cricbuzz.com/cricket-match/live-scores';
const CRICBUZZ_SCHEDULE_URL = 'https://www.cricbuzz.com/cricket-schedule/upcoming-series';
const CRICBUZZ_SCHEDULE_PAGES = [
  'https://www.cricbuzz.com/cricket-schedule/upcoming-series/international',
  'https://www.cricbuzz.com/cricket-schedule/upcoming-series/league',
  'https://www.cricbuzz.com/cricket-schedule/upcoming-series/women',
  'https://www.cricbuzz.com/cricket-schedule/upcoming-series/domestic',
];
const CRICBUZZ_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.cricbuzz.com/',
};

function slugify(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
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

  if (
    state.includes('complete')
    || state.includes('stumps')
    || state.includes('abandon')
    || /\bwon by\b|\bhave won\b|need\s+0\s+runs|match over/i.test(status)
  ) {
    return { matchState: 'post', isLive: false, time: 'Completed' };
  }
  if (state.includes('progress') || state === 'live' || /innings\s*break/i.test(combined)) {
    const timeLabel = /innings\s*break/i.test(combined) ? 'Innings Break' : 'Live';
    return { matchState: 'in', isLive: true, time: timeLabel };
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
  for (const key of ['inngs1', 'inngs2', 'inngs3', 'inngs4']) {
    const inn = scoreBlock[key];
    if (!inn) continue;
    const fallbackId = parseInt(key.replace('inngs', ''), 10) || entries.length + 1;
    entries.push({
      inningsId: inn.inningsId ?? fallbackId,
      runs: inn.runs ?? inn.score ?? 0,
      wickets: inn.wickets ?? inn.wkts ?? 0,
      overs: inn.overs ?? inn.over ?? 0,
      declared: Boolean(inn.isDeclared || inn.declared || inn.declaredInnings || inn.isDeclaredInnings),
    });
  }
  if (Array.isArray(scoreBlock.innings) || Array.isArray(scoreBlock.teamInningsArray)) {
    const extra = scoreBlock.innings || scoreBlock.teamInningsArray;
    for (const inn of extra) {
      if (!inn) continue;
      entries.push({
        inningsId: inn.inningsId ?? entries.length + 1,
        runs: inn.runs ?? inn.score ?? 0,
        wickets: inn.wickets ?? inn.wkts ?? 0,
        overs: inn.overs ?? inn.over ?? 0,
        declared: Boolean(inn.isDeclared || inn.declared),
      });
    }
  }
  return entries;
}

function readInningsScoreList(matchScore = {}, info = {}) {
  const list = matchScore?.inningsScoreList
    || matchScore?.matchScoreDetails?.inningsScoreList
    || info.inningsScoreList
    || [];
  if (!Array.isArray(list)) return [];
  return list.map((inn, idx) => ({
    inningsId: inn.inningsId ?? idx + 1,
    runs: inn.runs ?? inn.score ?? 0,
    wickets: inn.wickets ?? inn.wkts ?? 0,
    overs: inn.overs ?? inn.over ?? 0,
    declared: Boolean(inn.isDeclared || inn.declared),
    teamName: inn.batTeamName || inn.teamName || '',
    teamSName: inn.batTeamShortName || inn.teamSName || '',
  }));
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

  const team1BattedFirst = info.matchTeamInfo?.[0]?.battingTeamId
    ? info.matchTeamInfo[0].battingTeamId === info.team1?.teamId
    : !(info.tossResults?.tossWinnerId === info.team2?.teamId && /bat/i.test(info.tossResults?.decision || ''));

  const t1Entries = readScoreBlockInnings(matchScore?.team1Score).map((inn, idx) => ({
    ...inn,
    inningsId: inn.inningsId ?? (team1BattedFirst ? (idx * 2 + 1) : (idx * 2 + 2)),
    teamName: inn.teamName || team1Name,
    teamSName: inn.teamSName || team1SName,
  }));

  const t2Entries = readScoreBlockInnings(matchScore?.team2Score).map((inn, idx) => ({
    ...inn,
    inningsId: inn.inningsId ?? (team1BattedFirst ? (idx * 2 + 2) : (idx * 2 + 1)),
    teamName: inn.teamName || team2Name,
    teamSName: inn.teamSName || team2SName,
  }));

  const fromBlocks = [...t1Entries, ...t2Entries];
  const fromList = readInningsScoreList(matchScore, info).map((inn) => ({
    ...inn,
    teamName: inn.teamName || (inn.teamSName === team1SName ? team1Name : team2Name),
    teamSName: inn.teamSName || (inn.teamName === team1Name ? team1SName : team2SName),
  }));
  const allInnings = [...fromBlocks, ...fromList]
    .filter((inn, idx, arr) => arr.findIndex((other) => other.inningsId === inn.inningsId && other.teamName === inn.teamName) === idx)
    .sort((a, b) => a.inningsId - b.inningsId);

  const hasPlay = allInnings.some((inn) => inningsHasPlay(inn, match));
  if (!hasPlay) {
    return { commentary };
  }

  const matchTeam = (innName, innSName, targetName, targetSName) => {
    if (!innName && !innSName) return false;
    const a = String(innName || '').toLowerCase().trim();
    const as = String(innSName || '').toLowerCase().trim();
    const b = String(targetName || '').toLowerCase().trim();
    const s = String(targetSName || '').toLowerCase().trim();
    if (a && b && a === b) return true;
    if (as && s && as === s) return true;
    if (as && b && as === b) return true;
    if (a && s && a === s) return true;
    if (b && b.length >= 4 && (a.startsWith(b) || a.includes(` ${b} `))) return true;
    if (a && a.length >= 4 && (b.startsWith(a) || b.includes(` ${a} `))) return true;
    return false;
  };

  const isTeam1 = (inn) => matchTeam(inn.teamName, inn.teamSName, team1Name, team1SName);
  const isTeam2 = (inn) => matchTeam(inn.teamName, inn.teamSName, team2Name, team2SName);

  const team1Innings = allInnings.filter((inn) => isTeam1(inn) && !isTeam2(inn));
  const team2Innings = allInnings.filter((inn) => isTeam2(inn) && !isTeam1(inn));

  // If ambiguity remains, assign by odd/even inningsId
  for (const inn of allInnings) {
    const in1 = team1Innings.some((i) => i.inningsId === inn.inningsId);
    const in2 = team2Innings.some((i) => i.inningsId === inn.inningsId);
    if (!in1 && !in2) {
      if (inn.inningsId % 2 === 1) team1Innings.push(inn);
      else team2Innings.push(inn);
    }
  }

  const team1Latest = latestTeamInnings(team1Innings);
  const team2Latest = latestTeamInnings(team2Innings);
  const firstInn = allInnings.find((inn) => inn.inningsId === 1) || allInnings[0];
  const chaseInn = allInnings.find((inn) => inn.inningsId === 2);

  // Structured forensic debug logging
  if (process.env.NODE_ENV !== 'production' || process.env.DEBUG_SCORE_MAPPING === 'true') {
    console.log(`[SCORE_MAPPING] match=${info.matchId} team1=${team1Name} (runs=${team1Latest?.runs ?? 0}) team2=${team2Name} (runs=${team2Latest?.runs ?? 0}) allInningsCount=${allInnings.length}`);
  }

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
  }
  // Do NOT copy first-innings ball count into chaseBallNbr — that false-settles chase start.

  // Test match: surface all innings when >2 exist
  const matchFormat = match?.matchFormat || info.matchFormat || '';
  const isTest = /test/i.test(matchFormat) || allInnings.length > 2;
  if (isTest && allInnings.length > 0) {
    result.testInnings = allInnings.map((inn) => ({
      inningsId: inn.inningsId,
      batTeam: inn.teamSName || inn.teamName,
      runs: inn.runs,
      wickets: inn.wickets,
      declared: Boolean(inn.declared),
      overs: normalizeOvers(inn.overs, match),
    }));
    result.matchFormat = 'Test';
    result.inningsId = allInnings[allInnings.length - 1].inningsId;

    // Test lead/trail from all completed innings
    const team1Totals = allInnings.filter((i) => i.teamName === team1Name).reduce((s, i) => s + i.runs, 0);
    const team2Totals = allInnings.filter((i) => i.teamName === team2Name).reduce((s, i) => s + i.runs, 0);
    result.testLead = team1Totals - team2Totals;
    result.testLeadingTeam = team1Totals >= team2Totals ? (team1SName || team1Name) : (team2SName || team2Name);

    // Test target only in innings 4
    const currentInnId = allInnings[allInnings.length - 1].inningsId;
    if (currentInnId === 4) {
      const currentBatTeam = allInnings[allInnings.length - 1].teamName;
      const batTeamTotal = allInnings.filter((i) => i.teamName === currentBatTeam).reduce((s, i) => s + i.runs, 0);
      const oppTeamTotal = allInnings.filter((i) => i.teamName !== currentBatTeam).reduce((s, i) => s + i.runs, 0);
      result.testTarget = oppTeamTotal - (batTeamTotal - allInnings[allInnings.length - 1].runs) + 1;
    }
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
    'Lanka Premier League': 'T20 Lanka Premier League',
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
  const gender = /\bwomen\b|\(women\)/i.test(`${team1Name} ${team2Name} ${info.seriesName || ''}`) ? 'w' : 'm';
  const pairKey = `${gender}|${[team1Name, team2Name].sort().join('|').toLowerCase()}`;
  const providerFormat = info.matchFormat || info.matchType || matchType;
  // Cricbuzz often puts T10 series under the T20 typeMatches bucket — resolve from league/series.
  const resolvedFormat = resolveCricketOversFormat({
    league,
    seriesName: info.seriesName,
    matchFormat: providerFormat,
    matchType: providerFormat,
  });
  const matchMeta = { league, seriesName: info.seriesName, matchFormat: resolvedFormat };

  const kit = teamKitColors(team1Name, team2Name);

  return {
    id: `cb_${info.matchId}`,
    source: 'cricbuzz',
    cricbuzzMatchId: info.matchId,
    cricbuzzSeriesId: info.seriesId,
    league,
    seriesName: info.seriesName,
    matchType: resolvedFormat,
    matchFormat: resolvedFormat,
    sport: 'cricket',
    sportColor: '#f97316',
    time: state.time,
    isLive: state.isLive,
    matchState: state.matchState,
    team1: {
      name: team1Name,
      shortName: formatTeamShortName(team1Name, info.team1.teamSName),
      color: kit.team1Color,
    },
    team2: {
      name: team2Name,
      shortName: formatTeamShortName(team2Name, info.team2.teamSName),
      color: kit.team2Color,
    },
    liveDetails: buildLiveDetails(info, raw.matchScore, state.matchState, matchMeta),
    venue: info.venueInfo?.city || info.venueInfo?.ground || '',
    pairKey,
  };
}

function extractTypeMatches(html) {
  const marker = 'typeMatches';
  const blocks = [];
  let from = 0;

  while (from < html.length) {
    const idx = html.indexOf(marker, from);
    if (idx < 0) break;

    const arrStart = html.indexOf('[', idx);
    if (arrStart < 0) break;

    let depth = 0;
    let end = -1;
    for (let i = arrStart; i < html.length; i += 1) {
      if (html[i] === '[') depth += 1;
      else if (html[i] === ']') {
        depth -= 1;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }

    if (end < 0) break;

    let rawStr = html.slice(arrStart, end);
    rawStr = rawStr.replace(/\\\\\"/g, '"').replace(/\\\"/g, '"');

    try {
      const parsed = JSON.parse(rawStr);
      if (Array.isArray(parsed)) blocks.push(...parsed);
    } catch (err) {
      console.warn('[Cricbuzz Parser] JSON parse error:', err.message);
    }

    from = end;
  }

  return blocks;
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
  const [liveHtml, scheduleHtml, ...schedulePages] = await Promise.allSettled([
    fetchHtml(CRICBUZZ_LIVE_URL),
    fetchHtml(CRICBUZZ_SCHEDULE_URL),
    ...CRICBUZZ_SCHEDULE_PAGES.map((url) => fetchHtml(url)),
  ]);

  const byId = new Map();
  let series = [];

  const ingestHtml = (html) => {
    if (!html) return;
    const parsed = flattenTypeMatches(extractTypeMatches(html));
    for (const match of parsed.matches) {
      if (!match?.id) continue;
      const existing = byId.get(match.id);
      if (!existing) {
        byId.set(match.id, match);
        continue;
      }
      const existingPlay = Number(existing.liveDetails?.runs || existing.liveDetails?.firstRuns || 0)
        + Number(existing.liveDetails?.wickets || 0);
      const nextPlay = Number(match.liveDetails?.runs || match.liveDetails?.firstRuns || 0)
        + Number(match.liveDetails?.wickets || 0);
      if (nextPlay > existingPlay) byId.set(match.id, match);
    }
    const existingSeries = new Set(series.map((s) => s.seriesId));
    for (const item of parsed.series) {
      if (!existingSeries.has(item.seriesId)) {
        series.push(item);
        existingSeries.add(item.seriesId);
      }
    }
  };

  if (liveHtml.status === 'fulfilled') ingestHtml(liveHtml.value);
  if (scheduleHtml.status === 'fulfilled') {
    ingestHtml(scheduleHtml.value);
    const scheduleSeries = extractScheduleSeries(scheduleHtml.value);
    const existingIds = new Set(series.map((s) => s.seriesId));
    for (const item of scheduleSeries) {
      if (!existingIds.has(item.seriesId)) series.push(item);
    }
  }
  for (const page of schedulePages) {
    if (page.status === 'fulfilled') ingestHtml(page.value);
  }

  const matches = [...byId.values()];
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
