/**
 * Cricbuzz ball-by-ball feed — full-commentary → overHistory → match_ball_events.
 *
 * Works for every cricket format (T10 / T20 / ODI / The Hundred / Test / List A / etc.).
 *
 * Prefers per-ball commentary rows (legalRuns / totalRuns / event / ballNbr).
 * Falls back to overSeparator.o_summary when ball rows are sparse.
 * Detects explicit "Scorecard updates only" feeds (no inventing balls).
 */

const CRICBUZZ_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  Accept: 'application/json',
  Referer: 'https://www.cricbuzz.com/',
};

const feedCache = new Map();
const CACHE_TTL_MS = 8_000;

/** How many innings endpoints to probe for a given format. */
export function maxInningsForFormat(formatOrMatch) {
  const raw = typeof formatOrMatch === 'string'
    ? formatOrMatch
    : (formatOrMatch?.format
      || formatOrMatch?.matchFormat
      || formatOrMatch?.matchType
      || formatOrMatch?.matchHeader?.matchFormat
      || '');
  const norm = String(raw || '').toUpperCase();
  if (norm.includes('TEST') || norm.includes('COUNTY') || norm.includes('FIRST CLASS') || norm.includes('4-DAY')) {
    return 4;
  }
  return 2;
}

/** Parse "0 4 Wd 1 W 2" style over summaries into ball labels. */
export function parseBallSummary(summary = '') {
  return String(summary)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => token !== '|')
    .map((token) => {
      const t = token.toUpperCase();
      if (t === 'W' || t === 'WKT') return 'W';
      if (t === '0' || t === '.' || t === '•') return '•';
      if (/^\d+$/.test(t)) return t;
      if (t.includes('WD')) return token.replace(/wd/i, 'wd');
      if (t.includes('NB')) return token.replace(/nb/i, 'nb');
      if (t.includes('LB')) return token.replace(/lb/i, 'lb');
      return token;
    });
}

/**
 * Cricbuzz overNum 0.6 = end of over 1, 9.6 = end of over 10.
 * Convert to 1-based integer over used in market ids (next_delivery_*_10_1).
 */
export function cricbuzzOverNumToInteger(overNum) {
  const n = Number(overNum);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n) + 1;
}

function cleanCommText(text = '') {
  return String(text)
    .replace(/<[^>]*>/g, ' ')
    .replace(/B\d+\$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Map a single Cricbuzz commentary ball row → display/settlement label.
 * Uses event + legalRuns/totalRuns first; text is fallback only.
 */
export function ballLabelFromCommentaryEntry(entry) {
  if (!entry || Number(entry.ballNbr) <= 0) return null;

  const event = String(entry.event || '').toUpperCase();
  const text = cleanCommText(entry.commText || '');
  const legal = Number(entry.legalRuns);
  const total = Number(entry.totalRuns);

  if (event.includes('WICKET')) return 'W';
  if (event === 'SIX' || legal === 6) return '6';
  if (event === 'FOUR' || legal === 4) return '4';

  // Only treat as wide/no-ball when event says so, or commentary outcome slot is ", wide," /
  // ", no ball," — NOT descriptive phrases like "wide outside off".
  const outcomeWide = event.includes('WIDE') || /,\s*\d*\s*wides?\b/i.test(text);
  const outcomeNoBall = event.includes('NO_BALL') || event.includes('NOBALL')
    || /,\s*\d*\s*no[\s-]?balls?\b/i.test(text);
  if (outcomeWide) {
    const n = (Number.isFinite(total) && total > 0 ? total : 1);
    return n > 1 ? `${n}wd` : 'wd';
  }
  if (outcomeNoBall) {
    const n = (Number.isFinite(total) && total > 0 ? total : 1);
    return n > 1 ? `${n}nb` : 'nb';
  }
  if (/,\s*\d*\s*leg[\s-]?byes?\b/i.test(text)) {
    const n = Number.isFinite(total) && total > 0
      ? total
      : (Number.isFinite(legal) && legal > 0 ? legal : 1);
    return `${n}lb`;
  }
  if (/,\s*\d*\s*byes?\b/i.test(text) && !/leg/i.test(text)) {
    const n = Number.isFinite(total) && total > 0 ? total : 1;
    return String(n);
  }

  if (Number.isFinite(legal)) {
    if (legal === 0) return '•';
    return String(legal);
  }
  if (Number.isFinite(total)) {
    if (total === 0) return '•';
    return String(total);
  }

  if (/no run/i.test(text)) return '•';
  const runHit = text.match(/\b(\d+)\s*runs?\b/i);
  if (runHit) return runHit[1];
  if (/\bout\b|caught|bowled|lbw|stumped|run out|hit wicket/i.test(text)) return 'W';
  return null;
}

function extractSepsFromCommentaryPayload(data) {
  const blocks = data?.commentary || [];
  const seps = [];
  for (const block of blocks) {
    const list = block?.commentaryList || [];
    for (const entry of list) {
      const sep = entry?.overSeparator;
      if (!sep) continue;
      const overNum = cricbuzzOverNumToInteger(sep.overNum ?? sep.overNumber);
      if (!overNum) continue;
      const summary = sep.o_summary || sep.overSummary || '';
      const balls = parseBallSummary(summary);
      if (!balls.length) continue;
      seps.push({
        overNum,
        balls,
        runs: Number(sep.runs ?? sep.overRuns ?? 0) || 0,
        wickets: Number(sep.wickets ?? 0) || 0,
        score: Number(sep.score ?? 0) || 0,
        inningsId: Number(sep.inningsId ?? block.inningsId ?? 0) || null,
        isCurrent: false,
        rawOverNum: sep.overNum,
        source: 'o_summary',
      });
    }
  }
  return seps;
}

/** Build overs from individual ball rows (authoritative when present). */
export function extractOversFromBallEntries(data, inningsFallback = 1, { ballsPerOver = 6 } = {}) {
  const blocks = data?.commentary || [];
  const byKey = new Map();
  const perOver = Math.max(1, Number(ballsPerOver) || 6);

  for (const block of blocks) {
    const inningsId = Number(block?.inningsId || inningsFallback) || inningsFallback;
    const list = block?.commentaryList || [];
    for (const entry of list) {
      if (Number(entry?.ballNbr) <= 0) continue;
      const label = ballLabelFromCommentaryEntry(entry);
      if (!label) continue;
      const overNum = cricbuzzOverNumToInteger(entry.overNumber ?? entry.overNum);
      if (!overNum) continue;
      const key = `${inningsId}:${overNum}`;
      if (!byKey.has(key)) {
        byKey.set(key, {
          overNum,
          inningsId,
          items: [],
          runs: 0,
          wickets: 0,
          isCurrent: true,
          source: 'ball_entries',
        });
      }
      const row = byKey.get(key);
      // Dedupe by ballNbr within over (API list is newest-first)
      if (row.items.some((it) => it.ballNbr === entry.ballNbr)) continue;
      row.items.push({ ballNbr: Number(entry.ballNbr), label });
      row.score = Number(entry.batTeamScore) || row.score || 0;
      row.rawOverNum = entry.overNumber;
    }
  }

  for (const row of byKey.values()) {
    // CRITICAL: commentary list is newest-first — sort ascending for settlement order.
    row.items.sort((a, b) => a.ballNbr - b.ballNbr);
    row.balls = row.items.map((it) => it.label);
    row.runs = 0;
    row.wickets = 0;
    let legal = 0;
    for (const b of row.balls) {
      const s = String(b).toLowerCase();
      if (b === 'W') row.wickets += 1;
      else {
        const n = Number(String(b).replace(/[^\d]/g, ''));
        if (Number.isFinite(n)) row.runs += n;
      }
      if (s.includes('wd') || s.includes('nb')) continue;
      legal += 1;
    }
    row.isCurrent = legal < perOver;
    delete row.items;
  }

  return [...byKey.values()].sort((a, b) => {
    if (a.inningsId !== b.inningsId) return a.inningsId - b.inningsId;
    return a.overNum - b.overNum;
  });
}

function commentaryLooksScorecardOnly(data) {
  const blocks = data?.commentary || [];
  for (const block of blocks) {
    for (const entry of block?.commentaryList || []) {
      const text = cleanCommText(entry?.commText || '');
      if (/scorecard updates only/i.test(text)) return true;
    }
  }
  return false;
}

async function fetchFullCommentaryInnings(cricbuzzMatchId, inningsId) {
  const url = `https://www.cricbuzz.com/api/mcenter/${cricbuzzMatchId}/full-commentary/${inningsId}`;
  const res = await fetch(url, {
    headers: CRICBUZZ_HEADERS,
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return null;
  return res.json();
}

/** Lightweight /comm probe — detects "Scorecard updates only" and recent over balls. */
async function fetchCommScorecardHints(cricbuzzMatchId) {
  const url = `https://www.cricbuzz.com/api/mcenter/comm/${cricbuzzMatchId}`;
  try {
    const res = await fetch(url, {
      headers: CRICBUZZ_HEADERS,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { scorecardOnly: false, currentOverBalls: [] };
    const data = await res.json();
    let scorecardOnly = false;
    for (const entry of Object.values(data?.matchCommentary || {})) {
      const text = cleanCommText(entry?.commText || '');
      if (/scorecard updates only/i.test(text)) scorecardOnly = true;
    }
    const recent = parseBallSummary(data?.miniscore?.recentOvsStats || '');
    const currentOverBalls = recent.filter((b) => b && b !== '|');
    return { scorecardOnly, currentOverBalls };
  } catch {
    return { scorecardOnly: false, currentOverBalls: [] };
  }
}

/**
 * Resolve a numeric Cricbuzz match id for any live id (cb_*, oy_*, 10cric_*, …).
 */
export async function resolveCricbuzzIdForBallFeed(match, cricbuzzMatchId = null) {
  const direct = cricbuzzMatchId
    || match?.cricbuzzMatchId
    || (String(match?.id || '').startsWith('cb_')
      ? String(match.id).replace(/^cb_/i, '')
      : null);
  const cleaned = String(direct || '').replace(/^cb_/i, '').trim();
  if (cleaned && /^\d+$/.test(cleaned)) return cleaned;

  try {
    const { lookupCricbuzzId } = await import('./matchDetailFetcher.mjs');
    const looked = await lookupCricbuzzId(match);
    const id = String(looked || '').replace(/^cb_/i, '').trim();
    return /^\d+$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

function mergeOverRows(primary, secondary) {
  const map = new Map();
  for (const row of [...secondary, ...primary]) {
    const key = `${row.inningsId || 0}:${row.overNum}`;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { ...row });
      continue;
    }
    const prevScore = (prev.balls || []).filter((b) => String(b).trim() && b !== '|').length;
    const nextScore = (row.balls || []).filter((b) => String(b).trim() && b !== '|').length;
    // Prefer more balls; on ties prefer o_summary (stable strip) over ball_entries.
    if (nextScore > prevScore) {
      map.set(key, { ...prev, ...row, balls: row.balls });
    } else if (nextScore === prevScore && row.source === 'o_summary' && prev.source !== 'o_summary') {
      map.set(key, { ...prev, ...row, balls: row.balls, source: 'o_summary' });
    }
  }
  return [...map.values()].sort((a, b) => {
    const ia = Number(a.inningsId || 0);
    const ib = Number(b.inningsId || 0);
    if (ia !== ib) return ia - ib;
    return a.overNum - b.overNum;
  });
}

/**
 * Fetch ball-by-ball over history for a Cricbuzz match across innings.
 * @returns {{ overHistory: Array, hasBallFeed: boolean, inningsCovered: number[], scorecardOnly?: boolean }}
 */
export async function fetchCricbuzzBallFeed(cricbuzzMatchId, { maxInnings, format } = {}) {
  const id = String(cricbuzzMatchId || '').replace(/^cb_/i, '').trim();
  if (!id || !/^\d+$/.test(id)) {
    return { overHistory: [], hasBallFeed: false, inningsCovered: [], scorecardOnly: false };
  }

  const inningsLimit = Number.isFinite(Number(maxInnings)) && Number(maxInnings) > 0
    ? Number(maxInnings)
    : maxInningsForFormat(format);

  const formatNorm = String(
    typeof format === 'string'
      ? format
      : (format?.format || format?.matchFormat || format?.matchType || ''),
  ).toUpperCase();
  const ballsPerOver = (formatNorm.includes('100') || formatNorm.includes('HUNDRED')) ? 5 : 6;

  const cacheKey = `${id}:${inningsLimit}:bp${ballsPerOver}:v3`;
  const cached = feedCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }

  let overHistory = [];
  const inningsCovered = [];
  let scorecardOnly = false;

  for (let inn = 1; inn <= inningsLimit; inn += 1) {
    let data;
    try {
      data = await fetchFullCommentaryInnings(id, inn);
    } catch {
      continue;
    }
    if (!data) continue;
    if (commentaryLooksScorecardOnly(data)) scorecardOnly = true;

    const fromBalls = extractOversFromBallEntries(data, inn, { ballsPerOver });
    const fromSeps = extractSepsFromCommentaryPayload(data).map((row) => ({
      ...row,
      inningsId: row.inningsId || inn,
    }));
    const merged = mergeOverRows(fromBalls, fromSeps);
    if (!merged.length) continue;
    inningsCovered.push(inn);
    overHistory = mergeOverRows(overHistory, merged);
  }

  // /comm carries the explicit "Scorecard updates only" banner + recentOvsStats.
  let currentOverBalls = [];
  if (!overHistory.length || scorecardOnly) {
    const hints = await fetchCommScorecardHints(id);
    if (hints.scorecardOnly) scorecardOnly = true;
    currentOverBalls = hints.currentOverBalls || [];
  }

  const value = {
    overHistory,
    hasBallFeed: overHistory.length > 0,
    inningsCovered,
    scorecardOnly: Boolean(scorecardOnly && overHistory.length === 0),
    currentOverBalls,
    cricbuzzMatchId: id,
    maxInnings: inningsLimit,
    fetchedAt: new Date().toISOString(),
  };
  feedCache.set(cacheKey, { at: Date.now(), value });
  return value;
}

/** True when match already carries usable ball-by-ball history. */
export function matchHasBallFeed(match) {
  const history = match?.overHistory || match?.liveDetails?.overHistory || [];
  if (!Array.isArray(history) || history.length === 0) return false;
  return history.some((row) => {
    const balls = row?.balls;
    if (!Array.isArray(balls) || balls.length === 0) return false;
    return balls.some((b) => {
      const s = String(b || '').trim();
      return s && s !== '|';
    });
  });
}

/**
 * Attach Cricbuzz ball feed onto a match object (any format / any public match id).
 * Resolves oy_/10cric ids to Cricbuzz via team lookup when needed.
 */
export async function enrichMatchWithBallFeed(match, cricbuzzMatchId = null) {
  if (!match) return match;
  if (matchHasBallFeed(match)) {
    return { ...match, hasBallFeed: true, scorecardOnly: false };
  }

  const cbId = await resolveCricbuzzIdForBallFeed(match, cricbuzzMatchId);
  if (!cbId) {
    return { ...match, hasBallFeed: false };
  }

  const feed = await fetchCricbuzzBallFeed(cbId, { format: match });
  if (!feed.hasBallFeed) {
    return {
      ...match,
      cricbuzzMatchId: Number(cbId) || match.cricbuzzMatchId,
      hasBallFeed: false,
      scorecardOnly: Boolean(feed.scorecardOnly),
      ballFeedCheckedAt: feed.fetchedAt,
      liveDetails: {
        ...(match.liveDetails || {}),
        currentOverBalls: feed.currentOverBalls?.length
          ? feed.currentOverBalls
          : match.liveDetails?.currentOverBalls,
        ballFeedSource: feed.scorecardOnly ? 'scorecard_only' : match.liveDetails?.ballFeedSource,
      },
    };
  }

  const batInn = Number(match.liveDetails?.inningsId || match.liveDetails?.innings || 0);
  let history = feed.overHistory;
  if (batInn >= 1) {
    const scoped = history.filter((h) => Number(h.inningsId) === batInn);
    if (scoped.length) history = scoped;
  }

  return {
    ...match,
    cricbuzzMatchId: Number(cbId) || match.cricbuzzMatchId,
    overHistory: history,
    hasBallFeed: true,
    scorecardOnly: false,
    liveDetails: {
      ...(match.liveDetails || {}),
      overHistory: history,
      currentOverBalls: feed.currentOverBalls?.length
        ? feed.currentOverBalls
        : match.liveDetails?.currentOverBalls,
      ballFeedSource: 'cricbuzz_full_commentary',
    },
    ballFeedCheckedAt: feed.fetchedAt,
  };
}
