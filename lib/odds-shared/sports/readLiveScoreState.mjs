function num(value, fallback = 0) {
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function clockBlob(liveDetails = {}) {
  return [
    liveDetails.minute,
    liveDetails.clock,
    liveDetails.quarter,
    liveDetails.period,
    liveDetails.displayClock,
    liveDetails.commentary,
    liveDetails.status,
    liveDetails.time,
  ].filter((v) => v != null && String(v).trim() !== '').map(String).join(' ');
}

function quarterLengthMinutes(sport = '') {
  const s = String(sport || '').toLowerCase();
  if (s === 'american-football') return 15;
  return 12; // NBA / default basketball
}

function totalRegulationMinutes(sport = '') {
  const s = String(sport || '').toLowerCase();
  if (s === 'american-football') return 60;
  if (s === 'soccer' || s === 'esoccer') return 90;
  return 48;
}

/**
 * Parse ESPN-style "Q4 2:15" / "OT1 3:00" into elapsed regulation minutes.
 * Clock is remaining time in the period.
 */
export function parseQuarterElapsedMinutes(text, sport = '') {
  const raw = String(text || '');
  const ot = raw.match(/\bOT\s*(\d+)?\s+(\d{1,2}):(\d{2})\b/i);
  if (ot) {
    return totalRegulationMinutes(sport);
  }
  const q = raw.match(/\bQ\s*([1-8])\s+(\d{1,2}):(\d{2})\b/i)
    || raw.match(/\b([1-8])(?:st|nd|rd|th)?\s*(?:Q|quarter)\s+(\d{1,2}):(\d{2})\b/i);
  if (!q) return null;
  const period = parseInt(q[1], 10);
  const remMin = parseInt(q[2], 10);
  const remSec = parseInt(q[3], 10);
  if (!(period >= 1) || !(remMin >= 0)) return null;
  const qLen = quarterLengthMinutes(sport);
  const total = totalRegulationMinutes(sport);
  if (period > 4) return total;
  const rem = remMin + (Number.isFinite(remSec) ? remSec / 60 : 0);
  const elapsed = (period - 1) * qLen + Math.max(0, qLen - rem);
  return clamp(Math.round(elapsed), 0, total + 20);
}

/**
 * True when the feed has a usable clock (not bare "Live" / empty).
 */
export function isLiveClockKnown(liveDetails = {}, opts = {}) {
  const minuteRaw = String(liveDetails.minute ?? '').trim();
  // Half-time is a known clock state (parseMinute maps HT → 45).
  if (/^(ht|half[\s-]?time)$/i.test(minuteRaw)) return true;
  if (/^(live|scheduled|final|ft|in progress)$/i.test(minuteRaw)) {
    const alt = String(liveDetails.quarter || liveDetails.clock || liveDetails.displayClock || '');
    return /\d/.test(alt);
  }
  const blob = clockBlob(liveDetails);
  if (!/\d/.test(blob)) return false;
  if (parseMinute(liveDetails, opts) > 0) return true;
  if (/\bQ1\s+0:0/i.test(blob) || /^(0|0\.0|0:00|0')$/.test(minuteRaw)) return true;
  // Numeric minute field present (including 0)
  if (/^\d+/.test(minuteRaw)) return true;
  return Boolean(parseQuarterElapsedMinutes(blob, opts.sport) != null);
}

/**
 * Elapsed match minute from heterogeneous provider clocks.
 * @param {object} liveDetails
 * @param {{ sport?: string }} [opts]
 */
export function parseMinute(liveDetails = {}, opts = {}) {
  const sport = String(opts.sport || '').toLowerCase();
  const blob = clockBlob(liveDetails);
  if (!blob) return 0;

  // Prefer explicit quarter clocks (ESPN basketball / NFL).
  const fromQuarter = parseQuarterElapsedMinutes(
    String(liveDetails.quarter || liveDetails.clock || blob),
    sport,
  );
  if (fromQuarter != null) return fromQuarter;

  // Soccer: "84'" / "84+2" / commentary "84' 2nd Half"
  if (sport === 'soccer' || sport === 'esoccer' || !/\bQ[1-8]\b/i.test(blob)) {
    const stoppage = blob.match(/\b(\d{1,3})\s*\+\s*(\d{1,2})\b/);
    if (stoppage) {
      return clamp(parseInt(stoppage[1], 10) + parseInt(stoppage[2], 10), 0, 120);
    }
    const withPrime = blob.match(/\b(\d{1,3})\s*'/);
    if (withPrime) return clamp(parseInt(withPrime[1], 10), 0, 120);
  }

  if (/\bHT\b|half[\s-]?time/i.test(blob)) {
    return sport === 'soccer' || sport === 'esoccer' ? 45 : 24;
  }

  // Plain numeric minute / clock fields (ignore bare "Live")
  const minuteRaw = String(liveDetails.minute ?? '').trim();
  if (minuteRaw && !/^(live|scheduled|final|ft|ht)$/i.test(minuteRaw)) {
    const n = parseInt(minuteRaw, 10);
    if (Number.isFinite(n)) return clamp(n, 0, 120);
  }
  const clockRaw = String(liveDetails.clock ?? '').trim();
  if (clockRaw && /^\d+/.test(clockRaw)) {
    const n = parseInt(clockRaw, 10);
    if (Number.isFinite(n)) return clamp(n, 0, 120);
  }

  // Commentary like "84' 2nd Half" when minute field is missing/Live
  const commentaryMin = String(liveDetails.commentary || '').match(/\b(\d{1,3})\s*'/);
  if (commentaryMin) return clamp(parseInt(commentaryMin[1], 10), 0, 120);

  return 0;
}

function asSetList(value) {
  if (Array.isArray(value) && value.length > 0) {
    return value.map((v) => num(v?.value ?? v, NaN)).filter((n) => Number.isFinite(n));
  }
  const n = num(value, NaN);
  return Number.isFinite(n) ? [n] : [];
}

export function hasSetScores(liveDetails = {}) {
  const a = asSetList(liveDetails.sets1);
  const b = asSetList(liveDetails.sets2);
  return a.length > 0 && b.length > 0;
}

/** True when a tennis set score is finished (not an in-progress games tally). */
export function isCompletedTennisSet(gamesA, gamesB) {
  const a = Number(gamesA);
  const b = Number(gamesB);
  if (!(Number.isFinite(a) && Number.isFinite(b))) return false;
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  if (hi < 6) return false;
  if (hi - lo >= 2) return true; // 6-0..6-4, 7-5, 8-6…
  if (hi === 7 && lo === 6) return true; // standard tiebreak set
  return false;
}

export function countSetWins(sets1, sets2) {
  const a = asSetList(sets1);
  const b = asSetList(sets2);
  const n = Math.min(a.length, b.length);
  let setWins1 = 0;
  let setWins2 = 0;
  for (let i = 0; i < n; i += 1) {
    if (!isCompletedTennisSet(a[i], b[i])) continue;
    if (a[i] > b[i]) setWins1 += 1;
    else if (b[i] > a[i]) setWins2 += 1;
  }
  return { setWins1, setWins2 };
}

export function totalSetUnits(liveDetails = {}) {
  const a = asSetList(liveDetails.sets1);
  const b = asSetList(liveDetails.sets2);
  if (!a.length || !b.length) return null;
  const sum = (arr) => arr.reduce((acc, v) => acc + v, 0);
  return sum(a) + sum(b);
}

export function isFinishedMatch(match) {
  const status = String(match?.matchState || match?.status || '').toUpperCase();
  if (['POST', 'COMPLETED', 'FINISHED', 'DETERMINED', 'SETTLED'].includes(status)) {
    return true;
  }
  const time = String(match?.time || '').toLowerCase();
  return time === 'ft' || time.includes('full time') || time.includes('completed');
}

export function isLiveMatch(match) {
  if (isFinishedMatch(match)) return false;
  if (match?.isLive === true) return true;
  const status = String(match?.matchState || match?.status || '').toUpperCase();
  return status === 'IN' || status === 'LIVE';
}

export function readLiveScoreState(match = {}) {
  const liveDetails = match.liveDetails || {};
  const sport = match.sport || '';
  const score1 = num(
    liveDetails.score1 ?? match.score1 ?? match.team1?.runs ?? match.team1?.score,
    0,
  );
  const score2 = num(
    liveDetails.score2 ?? match.score2 ?? match.team2?.runs ?? match.team2?.score,
    0,
  );
  const sets1 = asSetList(liveDetails.sets1);
  const sets2 = asSetList(liveDetails.sets2);
  const { setWins1, setWins2 } = countSetWins(sets1, sets2);
  const minute = parseMinute(liveDetails, { sport });
  return {
    score1,
    score2,
    liveDetails,
    minute,
    clockKnown: isLiveClockKnown(liveDetails, { sport }),
    live: isLiveMatch(match),
    finished: isFinishedMatch(match),
    sets1,
    sets2,
    hasSetScores: sets1.length > 0 && sets2.length > 0,
    setWins1,
    setWins2,
    totalSetUnits: totalSetUnits(liveDetails),
  };
}
