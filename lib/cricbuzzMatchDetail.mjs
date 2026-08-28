/**
 * Fetches live batter/bowler names and enriched scores from a Cricbuzz match page.
 */

const CRICBUZZ_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
  Referer: 'https://www.cricbuzz.com/',
};

function parsePlayerScore(scoreStr = '') {
  const m = String(scoreStr).match(/(\d+)\((\d+)\)/);
  if (m) return { runs: parseInt(m[1], 10), balls: parseInt(m[2], 10) };
  const runs = parseInt(scoreStr, 10);
  return { runs: Number.isFinite(runs) ? runs : 0, balls: 0 };
}

function unescapeJsonFragment(raw = '') {
  return raw
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

function extractJsonObject(html, key) {
  const patterns = [
    `"${key}":`,
    `\\"${key}\\":`,
  ];

  for (const marker of patterns) {
    const idx = html.indexOf(marker);
    if (idx < 0) continue;

    const braceStart = html.indexOf('{', idx + marker.length);
    if (braceStart < 0) continue;

    let depth = 0;
    for (let i = braceStart; i < html.length; i += 1) {
      const ch = html[i];
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          try {
            return JSON.parse(unescapeJsonFragment(html.slice(braceStart, i + 1)));
          } catch {
            break;
          }
        }
      }
    }
  }

  return null;
}

export function normalizeCricbuzzOvers(value) {
  const str = String(value ?? '0');
  if (!str || str === '0') return '0.0';

  const parts = str.split('.');
  const whole = parseInt(parts[0], 10) || 0;
  const ball = parseInt(parts[1], 10) || 0;

  if (ball >= 6) {
    const extraOvers = Math.floor(ball / 6);
    return `${whole + extraOvers}.${ball % 6}`;
  }

  return `${whole}.${ball}`;
}

export function oversToBalls(oversStr) {
  const { whole, ball } = (() => {
    const parts = String(oversStr || '0.0').split('.');
    return {
      whole: parseInt(parts[0], 10) || 0,
      ball: parseInt(parts[1], 10) || 0,
    };
  })();

  if (ball >= 6) return whole * 6 + ball;
  return whole * 6 + ball;
}

function isPlaceholderPlayerName(name) {
  if (!name || typeof name !== 'string') return true;
  const trimmed = name.trim();
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();
  return /^batter\s*\d*$/i.test(lower) || /^bowler\s*\d*$/i.test(lower);
}

function mapBatter(obj) {
  if (!obj) return null;

  if (obj.name && obj.playerScore == null) {
    if (isPlaceholderPlayerName(obj.name)) return null;
    return {
      name: obj.name.trim(),
      runs: obj.runs ?? 0,
      balls: obj.balls ?? 0,
      fours: obj.fours ?? 0,
      sixes: obj.sixes ?? 0,
    };
  }

  const playerName = obj.playerName || obj.name;
  if (!playerName || isPlaceholderPlayerName(playerName)) return null;
  const stats = obj.playerScore != null
    ? parsePlayerScore(obj.playerScore)
    : { runs: obj.runs ?? 0, balls: obj.balls ?? 0 };

  return {
    name: playerName.trim(),
    runs: stats.runs,
    balls: stats.balls,
    fours: obj.fours ?? 0,
    sixes: obj.sixes ?? 0,
  };
}

function mapBowler(obj) {
  if (!obj) return null;
  const name = obj.name || obj.playerName;
  if (!name || isPlaceholderPlayerName(name)) return null;
  return { name: name.trim() };
}

function parseBattersFromOgTitle(html) {
  const og = html.match(/og:title" content="([^"]+)"/)
    || html.match(/property="og:title" content="([^"]+)"/);
  if (!og) return {};

  const groups = [...og[1].matchAll(/\(([^()]+)\)/g)];
  for (const group of groups) {
    const players = [...group[1].matchAll(/([A-Za-z][A-Za-z\s.'-]+?)\s+(\d+)\((\d+)\)/g)];
    if (players.length >= 2) {
      return {
        batter1: {
          name: players[0][1].trim(),
          runs: parseInt(players[0][2], 10),
          balls: parseInt(players[0][3], 10),
          fours: 0,
          sixes: 0,
        },
        batter2: {
          name: players[1][1].trim(),
          runs: parseInt(players[1][2], 10),
          balls: parseInt(players[1][3], 10),
          fours: 0,
          sixes: 0,
        },
      };
    }
  }

  return {};
}

function parseInningsArray(scoreObj) {
  const arr = scoreObj?.teamInningsArray;
  if (!Array.isArray(arr) || !arr.length) return null;
  const inn = arr[arr.length - 1];
  return {
    runs: inn.score ?? 0,
    wickets: inn.wickets ?? 0,
    overs: normalizeCricbuzzOvers(inn.overs ?? 0),
    ballNbr: inn.ballNbr ?? oversToBalls(normalizeCricbuzzOvers(inn.overs ?? 0)),
    inningsId: inn.inningsId,
    teamId: inn.batTeamId,
    teamName: inn.batTeamName || scoreObj.teamName,
  };
}

function isHundredFormat(matchHeader) {
  const format = matchHeader?.matchFormat || '';
  const series = matchHeader?.seriesName || '';
  return /hun/i.test(format) || /hundred/i.test(series);
}

function oversFromBallNbr(ballNbr) {
  const balls = Math.max(0, Math.min(100, Number(ballNbr) || 0));
  return `${Math.floor(balls / 5)}.${balls % 5}`;
}

function parseCommentaryBattersAndBowler(html) {
  const result = {};

  // Matches "Mohammed Azharuddeen 50 (30)", "Akshay TK * 42(28)", "D Warner 41 (26)"
  const batterMatches = [...html.matchAll(/([A-Z][A-Za-z0-9\.\'\s\-]+?)\s*[*†]?\s+(\d+)\s*\(\s*(\d+)\s*\)/g)];
  if (batterMatches.length >= 1) {
    result.batter1 = {
      name: batterMatches[0][1].replace(/[*†]/g, '').trim(),
      runs: parseInt(batterMatches[0][2], 10),
      balls: parseInt(batterMatches[0][3], 10),
      fours: 0,
      sixes: 0,
    };
  }
  if (batterMatches.length >= 2) {
    result.batter2 = {
      name: batterMatches[1][1].replace(/[*†]/g, '').trim(),
      runs: parseInt(batterMatches[1][2], 10),
      balls: parseInt(batterMatches[1][3], 10),
      fours: 0,
      sixes: 0,
    };
  }

  const bowlerMatch = html.match(/([A-Z][A-Za-z0-9\.\'\s\-]+?)\s*[*†]?\s+(\d+)[/-](\d+)/);
  if (bowlerMatch) {
    result.bowler = {
      name: bowlerMatch[1].replace(/[*†]/g, '').trim(),
      wickets: parseInt(bowlerMatch[2], 10),
      runs: parseInt(bowlerMatch[3], 10),
    };
  }

  return result;
}

export function parseCricbuzzMatchHtml(html, matchId) {
  const meta = parseMetaScores(html);
  const batStriker = extractJsonObject(html, 'batsmanStriker')
    || extractJsonObject(html, 'batStrikerObj');
  const batNonStriker = extractJsonObject(html, 'batsmanNonStriker')
    || extractJsonObject(html, 'batNonStrikerObj');
  const bowler = extractJsonObject(html, 'bowlerStriker')
    || extractJsonObject(html, 'bowlerObj');
  const batTeamScore = extractJsonObject(html, 'batTeamScoreObj');
  const bowlTeamScore = extractJsonObject(html, 'bowlerTeamScoreObj')
    || extractJsonObject(html, 'bowlTeamScoreObj');
  const matchHeader = extractJsonObject(html, 'matchHeader');

  const battingInnings = parseInningsArray(batTeamScore);
  const bowlingInnings = parseInningsArray(bowlTeamScore);

  const batter1 = mapBatter(batStriker);
  const batter2 = mapBatter(batNonStriker);

  let status = matchHeader?.status || meta?.commentary || '';
  if (!status) {
    const statusMatch = html.match(/"status":"([^"]+)"/)
      || html.match(/\\"status\\":\\"([^"\\]+)\\"/);
    status = statusMatch ? statusMatch[1] : '';
  }

  const liveDetails = {
    commentary: status,
    ...meta,
  };

  if (battingInnings) {
    const isChase = (battingInnings.inningsId ?? 1) > 1;
    const hundred = isHundredFormat(matchHeader);
    const overs = hundred && battingInnings.ballNbr
      ? oversFromBallNbr(battingInnings.ballNbr)
      : battingInnings.overs;

    if (isChase) {
      liveDetails.chaseRuns = battingInnings.runs;
      liveDetails.chaseWickets = battingInnings.wickets;
      liveDetails.chaseOvers = overs;
      liveDetails.chaseBallNbr = battingInnings.ballNbr;
      liveDetails.chaseTeamId = battingInnings.teamId;
      liveDetails.chaseTeamName = battingInnings.teamName;
    } else {
      liveDetails.firstRuns = battingInnings.runs;
      liveDetails.firstWickets = battingInnings.wickets;
      liveDetails.firstOvers = overs;
      liveDetails.firstTeamId = battingInnings.teamId;
      liveDetails.firstTeamName = battingInnings.teamName;
      liveDetails.chaseBallNbr = battingInnings.ballNbr;
    }
  }

  if (bowlingInnings) {
    const hundred = isHundredFormat(matchHeader);
    const overs = hundred && bowlingInnings.ballNbr
      ? oversFromBallNbr(bowlingInnings.ballNbr)
      : bowlingInnings.overs;
    liveDetails.firstRuns = bowlingInnings.runs;
    liveDetails.firstWickets = bowlingInnings.wickets;
    liveDetails.firstOvers = overs;
    liveDetails.firstTeamId = bowlingInnings.teamId;
    liveDetails.firstTeamName = bowlingInnings.teamName;
  }

  // Test match multi-innings extraction
  const matchFormat = matchHeader?.matchFormat || '';
  const isTestMatch = /test/i.test(matchFormat);
  if (isTestMatch) {
    const allTestInnings = [];
    const batArr = batTeamScore?.teamInningsArray || [];
    const bowlArr = bowlTeamScore?.teamInningsArray || [];
    const allArr = [...batArr, ...bowlArr];
    const seenIds = new Set();
    for (const inn of allArr) {
      const iid = inn.inningsId ?? allTestInnings.length + 1;
      if (seenIds.has(iid)) continue;
      seenIds.add(iid);
      allTestInnings.push({
        inningsId: iid,
        batTeam: inn.batTeamName || (batArr.includes(inn) ? batTeamScore?.teamName : bowlTeamScore?.teamName) || '',
        runs: inn.score ?? inn.runs ?? 0,
        wickets: inn.wickets ?? 0,
        overs: normalizeCricbuzzOvers(inn.overs ?? 0),
        declared: inn.isDeclared || false,
        allOut: (inn.wickets ?? 0) >= 10,
      });
    }
    allTestInnings.sort((a, b) => a.inningsId - b.inningsId);

    if (allTestInnings.length > 0) {
      liveDetails.testInnings = allTestInnings;
      liveDetails.matchFormat = 'Test';
      liveDetails.inningsId = allTestInnings[allTestInnings.length - 1].inningsId;

      // Compute Test lead/trail across all innings
      const teamTotals = new Map();
      for (const inn of allTestInnings) {
        teamTotals.set(inn.batTeam, (teamTotals.get(inn.batTeam) || 0) + inn.runs);
      }
      const teams = [...teamTotals.entries()];
      if (teams.length === 2) {
        liveDetails.testLead = teams[0][1] - teams[1][1];
        liveDetails.testLeadingTeam = teams[0][1] >= teams[1][1] ? teams[0][0] : teams[1][0];
      }

      // Test target only in innings 4
      const currentInn = allTestInnings[allTestInnings.length - 1];
      if (currentInn.inningsId === 4) {
        const batTeamTotal = allTestInnings.filter((i) => i.batTeam === currentInn.batTeam).reduce((s, i) => s + i.runs, 0);
        const oppTotal = allTestInnings.filter((i) => i.batTeam !== currentInn.batTeam).reduce((s, i) => s + i.runs, 0);
        liveDetails.testTarget = oppTotal - (batTeamTotal - currentInn.runs) + 1;
      }
    }
  }

  if (batter1) liveDetails.batter1 = batter1;
  if (batter2) liveDetails.batter2 = batter2;
  const mappedBowler = mapBowler(bowler);
  if (mappedBowler) liveDetails.bowler = mappedBowler;

  if (!liveDetails.batter1 || !liveDetails.batter2 || !liveDetails.bowler) {
    const parsedFallback = parseCommentaryBattersAndBowler(html);
    if (!liveDetails.batter1 && parsedFallback.batter1) liveDetails.batter1 = parsedFallback.batter1;
    if (!liveDetails.batter2 && parsedFallback.batter2) liveDetails.batter2 = parsedFallback.batter2;
    if (!liveDetails.bowler && parsedFallback.bowler) liveDetails.bowler = parsedFallback.bowler;
  }

  const headerState = String(matchHeader?.state || status || '').toLowerCase();
  const isLive = headerState.includes('progress')
    || headerState.includes('innings break')
    || headerState === 'live';

  return {
    matchId,
    liveDetails,
    matchHeader,
    isLive,
    fetchedAt: new Date().toISOString(),
  };
}

/** Parse scores from og:title / meta — available in first ~15KB of page */
export function parseMetaScores(html) {
  const og = html.match(/og:title" content="([^"]+)"/)
    || html.match(/property="og:title" content="([^"]+)"/);
  if (!og) return null;

  const title = og[1].replace(/\s+/g, ' ').trim();
  const desc = html.match(/"description" content="([^"]+)"/);
  const commentary = desc?.[1]?.match(/(?:[A-Za-z\s]+)?need \d+ runs? in \d+ balls?/i)?.[0]
    || desc?.[1]?.slice(0, 120)
    || '';

  // Match pattern: TEAM1 242 (49.5) vs TEAM2 39/1 (3.0) or TEAM1 242/10 vs TEAM2 39/1
  const scoreMatch = title.match(
    /([A-Z]{2,4}W?)\s+(\d+)(?:\/(\d+))?\s*(?:\(([\d.]+)\))?\s+vs\s+([A-Z]{2,4}W?)\s+(\d+)(?:\/(\d+))?\s*(?:\(([\d.]+)\))?/i,
  );
  if (scoreMatch) {
    const t1Name = scoreMatch[1];
    const t1Runs = parseInt(scoreMatch[2], 10);
    const t1Wkts = scoreMatch[3] ? parseInt(scoreMatch[3], 10) : 10;
    const t1Overs = normalizeCricbuzzOvers(scoreMatch[4] || '50.0');

    const t2Name = scoreMatch[5];
    const t2Runs = parseInt(scoreMatch[6], 10);
    const t2Wkts = scoreMatch[7] ? parseInt(scoreMatch[7], 10) : 0;
    const t2Overs = normalizeCricbuzzOvers(scoreMatch[8] || '0.0');

    return {
      chaseTeamName: t2Name,
      chaseRuns: t2Runs,
      chaseWickets: t2Wkts,
      chaseOvers: t2Overs,
      firstTeamName: t1Name,
      firstRuns: t1Runs,
      firstWickets: t1Wkts,
      firstOvers: t1Overs,
      commentary: commentary || undefined,
    };
  }

  const singleMatch = title.match(/([A-Z]{2,4}W?)\s+(\d+)(?:\/(\d+))?\s*\(([\d.]+)\)/i);
  if (singleMatch) {
    return {
      firstTeamName: singleMatch[1],
      firstRuns: parseInt(singleMatch[2], 10),
      firstWickets: singleMatch[3] ? parseInt(singleMatch[3], 10) : 10,
      firstOvers: normalizeCricbuzzOvers(singleMatch[4]),
      commentary: commentary || undefined,
    };
  }

  if (commentary) {
    return { commentary };
  }

  return null;
}

export function parseCricbuzzMatchHtmlFast(html, matchId) {
  const meta = parseMetaScores(html);

  const batStriker = extractJsonObject(html, 'batsmanStriker')
    || extractJsonObject(html, 'batStrikerObj');
  const batNonStriker = extractJsonObject(html, 'batsmanNonStriker')
    || extractJsonObject(html, 'batNonStrikerObj');
  const bowler = extractJsonObject(html, 'bowlerStriker')
    || extractJsonObject(html, 'bowlerObj');

  const liveDetails = { ...(meta || {}) };
  const batter1 = mapBatter(batStriker);
  const batter2 = mapBatter(batNonStriker);
  const mappedBowler = mapBowler(bowler);

  if (batter1) liveDetails.batter1 = batter1;
  if (batter2) liveDetails.batter2 = batter2;
  if (mappedBowler) liveDetails.bowler = mappedBowler;

  if (!batter1 || !batter2) {
    const fromTitle = parseBattersFromOgTitle(html);
    if (!batter1 && fromTitle.batter1) liveDetails.batter1 = fromTitle.batter1;
    if (!batter2 && fromTitle.batter2) liveDetails.batter2 = fromTitle.batter2;
  }

  if (!liveDetails.batter1 && !liveDetails.batter2) {
    const bowlerMatch = html.match(/bowlerObj\\":\{[^}]*\\"playerName\\":\\"([^"\\]+)\\"/);
    const striker = html.match(/batStrikerObj\\":\{[^}]*\\"playerName\\":\\"([^"\\]+)\\"[^}]*\\"playerScore\\":\\"([^"\\]+)\\"/);
    const nonStriker = html.match(/batNonStrikerObj\\":\{[^}]*\\"playerName\\":\\"([^"\\]+)\\"[^}]*\\"playerScore\\":\\"([^"\\]+)\\"/);

    if (striker) {
      const s = parsePlayerScore(striker[2]);
      liveDetails.batter1 = { name: striker[1], runs: s.runs, balls: s.balls, fours: 0, sixes: 0 };
    }
    if (nonStriker) {
      const s = parsePlayerScore(nonStriker[2]);
      liveDetails.batter2 = { name: nonStriker[1], runs: s.runs, balls: s.balls, fours: 0, sixes: 0 };
    }
    if (bowlerMatch) liveDetails.bowler = { name: bowlerMatch[1] };
  }

  const hasBatters = !!(liveDetails.batter1 || liveDetails.batter2);
  if (!meta && !hasBatters) return null;

  return { matchId, liveDetails, fetchedAt: new Date().toISOString() };
}

async function readPartialText(response, maxBytes = 12000, stopMarker = 'og:title') {
  const reader = response.body?.getReader?.();
  if (!reader) return response.text();

  const decoder = new TextDecoder();
  let buffer = '';
  while (buffer.length < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    if (stopMarker && buffer.includes(stopMarker)) break;
  }
  try { reader.cancel(); } catch { /* ignore */ }
  return buffer;
}

export async function fetchCricbuzzMatchDetailFast(matchId) {
  if (!matchId) throw new Error('matchId required');

  const url = `https://www.cricbuzz.com/live-cricket-scores/${matchId}`;
  const response = await fetch(url, { headers: CRICBUZZ_HEADERS });
  if (!response.ok) {
    throw new Error(`Cricbuzz fast detail failed (${response.status})`);
  }

  const html = await readPartialText(response, 350000, 'batsmanStriker');
  const parsed = parseCricbuzzMatchHtmlFast(html, matchId);
  if (!parsed) {
    throw new Error('Could not parse fast scores from Cricbuzz page');
  }

  return parsed;
}

export async function fetchCricbuzzMatchDetail(matchId) {
  if (!matchId) throw new Error('matchId required');

  const url = `https://www.cricbuzz.com/live-cricket-scores/${matchId}`;
  const response = await fetch(url, { headers: CRICBUZZ_HEADERS });
  if (!response.ok) {
    throw new Error(`Cricbuzz match detail failed (${response.status})`);
  }

  const html = await response.text();
  return parseCricbuzzMatchHtml(html, matchId);
}

const detailCache = new Map();
const DETAIL_CACHE_TTL_MS = 0;

export async function fetchCricbuzzMatchDetailCached(matchId, { fast = false } = {}) {
  if (!fast) {
    const cached = detailCache.get(matchId);
    if (cached && DETAIL_CACHE_TTL_MS > 0 && Date.now() - cached.at < DETAIL_CACHE_TTL_MS) {
      return cached.data;
    }
  }

  const detail = fast
    ? await fetchCricbuzzMatchDetailFast(matchId)
    : await fetchCricbuzzMatchDetail(matchId);

  detailCache.set(matchId, { data: detail, at: Date.now() });
  return detail;
}

export function enrichMatchWithDetail(match, detail) {
  if (!match || !detail?.liveDetails) return match;

  const ld = detail.liveDetails;
  const team1Id = match.team1?.id || detail.matchHeader?.team1?.id;
  const team2Id = match.team2?.id || detail.matchHeader?.team2?.id;

  const chaseTeamId = ld.chaseTeamId;
  const isTeam1Chasing = chaseTeamId && team1Id && chaseTeamId === team1Id;
  const isTeam2Chasing = chaseTeamId && team2Id && chaseTeamId === team2Id;

  let runs = match.liveDetails?.runs ?? 0;
  let wickets = match.liveDetails?.wickets ?? 0;
  let overs = match.liveDetails?.overs || '0.0';
  let score2 = match.liveDetails?.score2 ?? 0;
  let wickets2 = match.liveDetails?.wickets2 ?? 0;
  let overs2 = match.liveDetails?.overs2 || '0.0';

  if (ld.firstRuns != null && ld.chaseRuns != null) {
    if (isTeam1Chasing) {
      runs = ld.firstRuns;
      wickets = ld.firstWickets ?? 0;
      overs = ld.firstOvers || overs;
      score2 = ld.chaseRuns;
      wickets2 = ld.chaseWickets ?? 0;
      overs2 = ld.chaseOvers || overs2;
    } else if (isTeam2Chasing) {
      runs = ld.firstRuns;
      wickets = ld.firstWickets ?? 0;
      overs = ld.firstOvers || overs;
      score2 = ld.chaseRuns;
      wickets2 = ld.chaseWickets ?? 0;
      overs2 = ld.chaseOvers || overs2;
    } else {
      const team1Name = (match.team1?.name || '').toLowerCase();
      const chaseName = (ld.chaseTeamName || '').toLowerCase();
      const firstName = (ld.firstTeamName || '').toLowerCase();

      if (chaseName && team1Name.includes(chaseName.slice(0, 3))) {
        score2 = ld.chaseRuns;
        wickets2 = ld.chaseWickets ?? 0;
        overs2 = ld.chaseOvers || overs2;
        runs = ld.firstRuns;
        wickets = ld.firstWickets ?? 0;
        overs = ld.firstOvers || overs;
      } else if (firstName && team1Name.includes(firstName.slice(0, 3))) {
        runs = ld.firstRuns;
        wickets = ld.firstWickets ?? 0;
        overs = ld.firstOvers || overs;
        score2 = ld.chaseRuns;
        wickets2 = ld.chaseWickets ?? 0;
        overs2 = ld.chaseOvers || overs2;
      }
    }
  }

  const enriched = {
    ...match,
    liveDetails: {
      ...match.liveDetails,
      runs,
      wickets,
      overs: normalizeCricbuzzOvers(overs),
      score2,
      wickets2,
      overs2: normalizeCricbuzzOvers(overs2),
      chaseBallNbr: ld.chaseBallNbr,
      commentary: ld.commentary || match.liveDetails?.commentary,
      batter1: ld.batter1 || match.liveDetails?.batter1,
      batter2: ld.batter2 || match.liveDetails?.batter2,
      bowler: ld.bowler || match.liveDetails?.bowler,
    },
  };

  // Pass through Test match multi-innings data
  if (ld.testInnings) {
    enriched.liveDetails.testInnings = ld.testInnings;
    enriched.liveDetails.matchFormat = 'Test';
    enriched.liveDetails.inningsId = ld.inningsId;
    enriched.liveDetails.testLead = ld.testLead;
    enriched.liveDetails.testLeadingTeam = ld.testLeadingTeam;
    if (ld.testTarget) enriched.liveDetails.testTarget = ld.testTarget;
  }

  return enriched;
}
