/**
 * Settle open bets from live-score completion (not only the empty matches table).
 */

import { query } from '../db/pg.js';
import { betSettlementEngine } from './betSettlementEngine.mjs';
import { getCachedAggregatedLiveScores, aggregateLiveScores } from './aggregator.mjs';
import { isCricketMatchCompleted } from '../src/utils/cricketMatchComplete.js';
import { getMatchMaxOvers, oversToBallsForMatch } from '../src/utils/cricketFormat.js';
import { teamNameMatches } from '../src/utils/cricketScores.js';
import {
  recordMatchOverSnapshots,
  recordMatchDismissalSnapshots,
  getRunsInOver,
  getScoreAtOverEnd,
  getScoreAtDismissal,
  isTargetOverComplete,
  getBattingOversAndScore,
} from './matchOverSnapshotStore.mjs';
import { parseOuLine as parseLineFromText } from './odds-v3/lineIdentity.mjs';
import { getFormatRules, nextBallSlot, resolveCricketFormat } from './odds-v3/format/CricketFormatRules.mjs';
import { isInPlayMatch } from './matchState.mjs';
import { matchIdAliases } from './matchIdPublic.mjs';

function parseRuns(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  const str = String(value);
  const match = str.match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function isMatchFinal(match) {
  if (!match) return false;
  const state = String(match.matchState || '').toLowerCase();
  const status = String(match.status || match.liveStatus || match.time || '').toUpperCase();
  if (state === 'post' || state === 'completed') return true;
  if (['COMPLETED', 'FINAL', 'FINISHED', 'CLOSED', 'ABANDONED', 'CANCELLED'].includes(status)) return true;
  if (/^(COMPLETED|FINAL|FINISHED|CLOSED)$/i.test(String(match.time || ''))) return true;
  if (isCricketMatchCompleted(match)) return true;
  return false;
}

/** @returns {'1'|'2'|'X'|null} */
export function resolveLiveMatchWinner(match) {
  if (!match || !isMatchFinal(match)) return null;

  const text = [
    match.result,
    match.status,
    match.liveStatus,
    match.time,
    match.liveDetails?.commentary,
    match.liveDetails?.status,
    match.matchHeader?.status,
  ].filter(Boolean).join(' ');

  const t1 = match.team1?.name || match.team1?.shortName || '';
  const t2 = match.team2?.name || match.team2?.shortName || '';

  if (t1 && new RegExp(`${escapeReg(t1)}.{0,40}\\b(won|beat|defeated)\\b`, 'i').test(text)) return '1';
  if (t2 && new RegExp(`${escapeReg(t2)}.{0,40}\\b(won|beat|defeated)\\b`, 'i').test(text)) return '2';
  if (t1 && new RegExp(`\\b(won|beat|defeated)\\b.{0,40}${escapeReg(t1)}`, 'i').test(text)) return '1';
  if (t2 && new RegExp(`\\b(won|beat|defeated)\\b.{0,40}${escapeReg(t2)}`, 'i').test(text)) return '2';

  const ld = match.liveDetails || {};
  const firstRuns = parseRuns(ld.firstRuns);
  const chaseRuns = parseRuns(ld.chaseRuns ?? ld.score2);
  const chaseTeam = String(ld.chaseTeamName || '');
  const firstTeam = String(ld.firstTeamName || '');

  // Cricket chase result is authoritative when both innings present
  if (firstRuns > 0 && (chaseRuns > 0 || ld.chaseWickets != null)) {
    const chaseWon = chaseRuns >= firstRuns + 1;
    if (chaseTeam && (t1 || t2)) {
      const chaseIsTeam1 = teamNameMatches(chaseTeam, t1) || teamNameMatches(t1, chaseTeam);
      const chaseIsTeam2 = teamNameMatches(chaseTeam, t2) || teamNameMatches(t2, chaseTeam);
      if (chaseWon) {
        if (chaseIsTeam1) return '1';
        if (chaseIsTeam2) return '2';
      } else {
        // defending side won
        if (chaseIsTeam1) return '2';
        if (chaseIsTeam2) return '1';
        if (firstTeam) {
          if (teamNameMatches(firstTeam, t1) || teamNameMatches(t1, firstTeam)) return '1';
          if (teamNameMatches(firstTeam, t2) || teamNameMatches(t2, firstTeam)) return '2';
        }
      }
    }
  }

  const s1 = parseRuns(match.team1?.runs ?? match.score1 ?? ld.score1 ?? ld.runs);
  const s2 = parseRuns(match.team2?.runs ?? match.score2 ?? ld.score2 ?? ld.chaseRuns);
  if (s1 > s2) return '1';
  if (s2 > s1) return '2';

  const sport = String(match.sport || '').toLowerCase();
  if (sport === 'soccer' || sport === 'football' || sport === 'esoccer') return 'X';
  return null;
}

function escapeReg(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function selectionLooksLikeTeam(selectionId, selectionName, team) {
  if (!team) return false;
  const tokens = [selectionId, selectionName, team.name, team.shortName, team.code]
    .filter(Boolean)
    .map((v) => String(v));
  for (const c of tokens) {
    if (teamNameMatches(c, team.name) || teamNameMatches(c, team.shortName)) return true;
    const a = String(c).toLowerCase().replace(/^sel[_-]?/i, '');
    const short = String(team.shortName || team.code || '').toLowerCase();
    const name = String(team.name || '').toLowerCase();
    if (short && (a === short || a.includes(short) || short.includes(a))) return true;
    if (name && a.length >= 2 && name.split(/\s+/).some((w) => w.startsWith(a) || a.startsWith(w.slice(0, 3)))) return true;
  }
  return false;
}

/**
 * Build settlement matchState for betSettlementEngine + evaluate cricket match_winner.
 */
export function buildSettlementMatchState(match) {
  const abandoned = /abandon|cancel|no result|washed out/i.test(
    `${match?.status || ''} ${match?.result || ''} ${match?.liveDetails?.commentary || ''}`,
  );
  const final = isMatchFinal(match);
  const winnerSide = final ? resolveLiveMatchWinner(match) : null;

  return {
    matchId: match?.id || match?.matchId || null,
    status: abandoned ? 'ABANDONED' : (final ? 'COMPLETED' : 'IN_PLAY'),
    winnerSide,
    winnerId: winnerSide === '1' ? 'home' : winnerSide === '2' ? 'away' : winnerSide === 'X' ? 'TIE' : null,
    homeTeam: { teamId: 'home', name: match?.team1?.name, shortName: match?.team1?.shortName },
    awayTeam: { teamId: 'away', name: match?.team2?.name, shortName: match?.team2?.shortName },
    match: match || null,
  };
}

function parseOuLine(selectionName = '', selectionId = '') {
  // Prefer "Over 45.5" / "Under 7.5" in the name; never scrape sel_05_over → 5
  return parseLineFromText(selectionName) ?? parseLineFromText(selectionId);
}

function isOverSelection(selectionId, selectionName) {
  const s = `${selectionId} ${selectionName}`.toLowerCase();
  return /\bover\b/.test(s) && !/\bunder\b/.test(s);
}

function isUnderSelection(selectionId, selectionName) {
  const s = `${selectionId} ${selectionName}`.toLowerCase();
  return /\bunder\b/.test(s);
}

export async function evaluateOverMarketBet(bet, match) {
  const market = String(bet.market_id || '');
  const selectionId = String(bet.selection_id || '');
  const selectionName = String(bet.selection_name || '');

  const nextOver = market.match(/^(?:i(\d+)_)?next_over_(\d+)_total$/i);
  if (nextOver) {
    const marketInnings = nextOver[1] != null ? Number(nextOver[1]) : null;
    const overNum = Number(nextOver[2]);
    const bat = getBattingOversAndScore(match);
    const settleInnings = marketInnings ?? (bat.innings >= 2 ? 1 : bat.innings);

    // Do not settle 1st-innings overs against chase data
    if (marketInnings != null && bat.innings !== marketInnings && bat.innings < marketInnings) {
      return null;
    }
    if (settleInnings === bat.innings && !isTargetOverComplete(match, overNum)) return null;
    if (settleInnings !== bat.innings && bat.innings < 2) return null;
    // When chase has started, 1st-innings next-over is complete if we have snapshot or first overs past
    if (settleInnings !== bat.innings) {
      const firstOvers = match.liveDetails?.firstOvers;
      const parts = String(firstOvers || '').match(/^(\d+)/);
      if (parts && Number(parts[1]) < overNum && bat.innings < 2) return null;
    }

    let runs = await getRunsInOver(match.id || match.matchId, overNum, settleInnings);
    if (runs == null) {
      const hist = match.overHistory || match.liveDetails?.overHistory || [];
      const row = hist.find((h) => Number(h.overNum || h.over) === overNum && !h.isCurrent);
      if (row) {
        if (row.runs != null) runs = Number(row.runs);
        else if (Array.isArray(row.balls)) {
          runs = row.balls.reduce((sum, b) => {
            const s = String(b);
            if (/^\d+$/.test(s)) return sum + Number(s);
            return sum;
          }, 0);
        }
      }
    }

    if (runs == null || !Number.isFinite(runs)) {
      return { outcome: 'VOID', reason: `over_${overNum}_i${settleInnings}_runs_unknown` };
    }

    const line = parseOuLine(selectionName, selectionId);
    if (line == null) return null; // never invent a line (was 7.5 — money loss)
    const tookOver = isOverSelection(selectionId, selectionName);
    const tookUnder = isUnderSelection(selectionId, selectionName);
    if (tookOver) {
      return { outcome: runs > line ? 'WON' : 'LOST', reason: `over_${overNum}_i${settleInnings}_runs=${runs}_line=${line}` };
    }
    if (tookUnder) {
      return { outcome: runs < line ? 'WON' : 'LOST', reason: `over_${overNum}_i${settleInnings}_runs=${runs}_line=${line}` };
    }
    return null;
  }

  const milestone = market.match(/^(?:i(\d+)_)?overs_0_(\d+)_total$/i);
  if (milestone) {
    const marketInnings = milestone[1] != null ? Number(milestone[1]) : null;
    const targetOvers = Number(milestone[2]);
    const bat = getBattingOversAndScore(match);
    // Legacy unscoped id: settle against 1st innings once chase has started
    const settleInnings = marketInnings
      ?? (bat.innings >= 2 ? 1 : bat.innings);
    if (marketInnings != null && bat.innings !== marketInnings && bat.innings < marketInnings) {
      return null; // market's innings not reached yet
    }
    if (settleInnings === bat.innings && !isTargetOverComplete(match, targetOvers)) return null;
    if (settleInnings !== bat.innings && bat.innings < 2) return null;

    let score = await getScoreAtOverEnd(match.id || match.matchId, targetOvers, settleInnings);
    if (score == null && settleInnings === bat.innings) {
      const parts = String(bat.oversStr || '').match(/^(\d+)(?:\.(\d+))?$/);
      if (parts && Number(parts[1]) === targetOvers && Number(parts[2] || 0) === 0) {
        score = Number(bat.score) || 0;
      }
    }
    // First-innings legacy: use firstRuns if phase is past target overs
    if (score == null && settleInnings === 1 && bat.innings >= 2) {
      const firstScore = Number(match.liveDetails?.firstRuns);
      if (Number.isFinite(firstScore) && firstScore > 0) score = firstScore;
    }
    if (score == null || !Number.isFinite(score)) {
      return { outcome: 'VOID', reason: `milestone_${targetOvers}_i${settleInnings}_score_unknown` };
    }
    const line = parseOuLine(selectionName, selectionId);
    if (line == null) return null;
    if (isOverSelection(selectionId, selectionName)) {
      return { outcome: score > line ? 'WON' : 'LOST', reason: `milestone_${targetOvers}_i${settleInnings}_score=${score}` };
    }
    if (isUnderSelection(selectionId, selectionName)) {
      return { outcome: score < line ? 'WON' : 'LOST', reason: `milestone_${targetOvers}_i${settleInnings}_score=${score}` };
    }
  }

  return null;
}

export async function evaluateDismissalMarketBet(bet, match) {
  const market = String(bet.market_id || '');
  const hit = market.match(/^(?:i(\d+)_)?team_score_at_(\d+)_dismissal$/i);
  if (!hit) return null;

  const marketInnings = hit[1] != null ? Number(hit[1]) : null;
  const wicketNum = Number(hit[2]);
  const bat = getBattingOversAndScore(match);
  const settleInnings = marketInnings ?? (bat.innings >= 2 ? 1 : bat.innings);

  if (marketInnings != null && bat.innings < marketInnings) return null;

  // Need the wicket to have fallen in that innings
  const wicketsForSettle = settleInnings === bat.innings
    ? (Number(bat.wickets) || 0)
    : (settleInnings === 1
      ? Number(match.liveDetails?.firstWickets ?? match.team1?.wickets ?? 0)
      : Number(match.liveDetails?.chaseWickets ?? 0));
  if (wicketsForSettle < wicketNum) return null;

  let score = await getScoreAtDismissal(match.id || match.matchId, wicketNum, settleInnings);
  if (score == null && settleInnings === bat.innings && (Number(bat.wickets) || 0) === wicketNum) {
    score = Number(bat.score) || 0;
  }
  if (score == null && settleInnings === 1 && bat.innings >= 2) {
    // Too late without snapshot — void rather than grade against chase score
    return { outcome: 'VOID', reason: `dismissal_${wicketNum}_i1_score_unknown` };
  }
  if (score == null || !Number.isFinite(score)) {
    return { outcome: 'VOID', reason: `dismissal_${wicketNum}_score_unknown` };
  }

  const selectionId = String(bet.selection_id || '');
  const selectionName = String(bet.selection_name || '');
  const line = parseOuLine(selectionName, selectionId);
  if (line == null) return null;

  if (isOverSelection(selectionId, selectionName)) {
    return {
      outcome: score > line ? 'WON' : 'LOST',
      reason: `dismissal_${wicketNum}_i${settleInnings}_score=${score}_line=${line}`,
    };
  }
  if (isUnderSelection(selectionId, selectionName)) {
    return {
      outcome: score < line ? 'WON' : 'LOST',
      reason: `dismissal_${wicketNum}_i${settleInnings}_score=${score}_line=${line}`,
    };
  }
  return null;
}

/** Settle team_total / match_total when innings or match is decided. */
export function evaluateTotalsMarketBet(bet, match) {
  const market = String(bet.market_id || '').toLowerCase();
  const selectionId = String(bet.selection_id || '');
  const selectionName = String(bet.selection_name || '');
  const line = parseOuLine(selectionName, selectionId);
  if (line == null) return null;

  const ld = match?.liveDetails || {};
  const bat = getBattingOversAndScore(match);

  if (market === 'team_total' || market.startsWith('team_total_alt_')) {
    // First-innings team total: settle when 1st inns finished (chase started or all out / overs done)
    const firstDone = bat.innings >= 2
      || Number(ld.firstWickets) >= 10
      || /all\s*out/i.test(String(ld.commentary || ''));
    if (!firstDone) {
      // Still live 1st inns: Under is lost if score already past line
      const score = Number(bat.score) || 0;
      if (isUnderSelection(selectionId, selectionName) && score > line) {
        return { outcome: 'LOST', reason: `team_total_under_crossed score=${score}_line=${line}` };
      }
      if (isOverSelection(selectionId, selectionName) && score > line) {
        return { outcome: 'WON', reason: `team_total_over_hit score=${score}_line=${line}` };
      }
      return null;
    }
    const score = Number(ld.firstRuns ?? match.team1?.runs ?? match.team2?.runs ?? bat.score) || 0;
    // Prefer firstRuns when chase underway
    const finalScore = bat.innings >= 2
      ? (Number(ld.firstRuns) || score)
      : score;
    if (isOverSelection(selectionId, selectionName)) {
      return { outcome: finalScore > line ? 'WON' : 'LOST', reason: `team_total_final=${finalScore}_line=${line}` };
    }
    if (isUnderSelection(selectionId, selectionName)) {
      return { outcome: finalScore < line ? 'WON' : 'LOST', reason: `team_total_final=${finalScore}_line=${line}` };
    }
    return null;
  }

  if (market === 'match_total' || market.startsWith('match_total_alt')) {
    if (!isMatchFinal(match)) {
      const combined = (Number(match.team1?.runs) || 0) + (Number(match.team2?.runs) || 0)
        || (Number(ld.firstRuns) || 0) + (Number(ld.chaseRuns) || 0);
      if (isUnderSelection(selectionId, selectionName) && combined > line) {
        return { outcome: 'LOST', reason: `match_total_under_crossed score=${combined}_line=${line}` };
      }
      if (isOverSelection(selectionId, selectionName) && combined > line) {
        return { outcome: 'WON', reason: `match_total_over_hit score=${combined}_line=${line}` };
      }
      return null;
    }
    const combined = (Number(match.team1?.runs) || 0) + (Number(match.team2?.runs) || 0)
      || (Number(ld.firstRuns) || 0) + (Number(ld.chaseRuns) || 0);
    if (isOverSelection(selectionId, selectionName)) {
      return { outcome: combined > line ? 'WON' : 'LOST', reason: `match_total_final=${combined}_line=${line}` };
    }
    if (isUnderSelection(selectionId, selectionName)) {
      return { outcome: combined < line ? 'WON' : 'LOST', reason: `match_total_final=${combined}_line=${line}` };
    }
  }

  return null;
}

export function evaluateOpenBetOutcome(bet, matchState) {
  if (!matchState || matchState.status === 'ABANDONED') {
    return { outcome: 'VOID', reason: 'Match abandoned/cancelled' };
  }
  if (matchState.status !== 'COMPLETED') {
    return null;
  }

  const market = String(bet.market_id || '').toLowerCase();
  const selectionId = String(bet.selection_id || '');
  const selectionName = String(bet.selection_name || '');

  // Match winner (+ super over variants)
  if (market.includes('match_winner') || market === 'winner' || market === '1x2') {
    const winnerSide = matchState.winnerSide;
    if (!winnerSide) {
      return { outcome: 'VOID', reason: 'match_complete_winner_unknown' };
    }

    if (['1', '2', 'X'].includes(selectionId)) {
      return {
        outcome: selectionId === winnerSide ? 'WON' : 'LOST',
        reason: `match_winner selection=${selectionId} winner=${winnerSide}`,
      };
    }

    const homeWin = selectionLooksLikeTeam(selectionId, selectionName, matchState.homeTeam)
      || /t1|team1|home/i.test(selectionId);
    const awayWin = selectionLooksLikeTeam(selectionId, selectionName, matchState.awayTeam)
      || /t2|team2|away/i.test(selectionId);

    if (homeWin && !awayWin) {
      return { outcome: winnerSide === '1' ? 'WON' : 'LOST', reason: 'matched home team' };
    }
    if (awayWin && !homeWin) {
      return { outcome: winnerSide === '2' ? 'WON' : 'LOST', reason: 'matched away team' };
    }

    const code = selectionId.replace(/^sel[_-]?/i, '').toLowerCase();
    if (code && matchState.homeTeam?.shortName?.toLowerCase() === code) {
      return { outcome: winnerSide === '1' ? 'WON' : 'LOST', reason: `code ${code} ~ home` };
    }
    if (code && matchState.awayTeam?.shortName?.toLowerCase() === code) {
      return { outcome: winnerSide === '2' ? 'WON' : 'LOST', reason: `code ${code} ~ away` };
    }
    if (code && matchState.homeTeam?.name?.toLowerCase().includes(code)) {
      return { outcome: winnerSide === '1' ? 'WON' : 'LOST', reason: `code ${code} ~ home` };
    }
    if (code && matchState.awayTeam?.name?.toLowerCase().includes(code)) {
      return { outcome: winnerSide === '2' ? 'WON' : 'LOST', reason: `code ${code} ~ away` };
    }

    return { outcome: 'VOID', reason: 'match_winner_selection_unmatched' };
  }

  return null;
}

/** In-play / ungradeable markets once the fixture is over or gone from the book. */
export function evaluateBetAfterMatchOver(bet) {
  const market = String(bet.market_id || '');
  if (/next_delivery_|wicket_in_|method_of_next_wicket|odd_even|current_over_/i.test(market)) {
    return { outcome: 'VOID', reason: 'in_play_market_match_over' };
  }
  if (/match_winner|winner|1x2/i.test(market)) {
    return { outcome: 'VOID', reason: 'match_over_winner_unknown' };
  }
  if (/team_total|match_total|team_score_at|next_over_|overs_0_/i.test(market)) {
    return { outcome: 'VOID', reason: 'market_ungradeable_match_over' };
  }
  return { outcome: 'VOID', reason: 'match_over_ungradeable' };
}

export function evaluateDeliveryMarketBet(bet, match) {
  const hit = String(bet.market_id || '').match(/^(?:i(\d+)_)?next_delivery_[a-z]+_(\d+)_(\d+)$/i);
  if (!hit) return null;

  if (!match || isMatchFinal(match)) {
    return { outcome: 'VOID', reason: 'delivery_match_over' };
  }
  if (!isInPlayMatch(match)) {
    return { outcome: 'VOID', reason: 'delivery_not_in_play' };
  }

  const marketInn = hit[1] != null ? Number(hit[1]) : null;
  const overNum = Number(hit[2]);
  const ballNum = Number(hit[3]);
  const maxOvers = getMatchMaxOvers(match);
  if (maxOvers && overNum > maxOvers) {
    return { outcome: 'VOID', reason: 'delivery_over_past_format' };
  }

  const bat = getBattingOversAndScore(match);
  if (marketInn != null && bat.innings > marketInn) {
    return { outcome: 'VOID', reason: 'delivery_innings_passed' };
  }

  const oversStr = bat.oversStr || match.liveDetails?.overs;
  if (oversStr == null || String(oversStr).trim() === '') return null;

  const format = resolveCricketFormat(match);
  const rules = getFormatRules(format) || getFormatRules('T20');
  const ballsCompleted = oversToBallsForMatch(oversStr, match);
  const slot = nextBallSlot(ballsCompleted, rules.ballsPerOver || 6);
  if (slot.overNum > overNum || (slot.overNum === overNum && slot.ballNum > ballNum)) {
    return {
      outcome: 'VOID',
      reason: `delivery_ball_passed live=${slot.overNum}.${slot.ballNum} bet=${overNum}.${ballNum}`,
    };
  }
  return null;
}

function indexMatch(byId, match) {
  if (!match) return;
  const ids = [
    match.id,
    match.matchId,
    match.legacyId,
    ...matchIdAliases(match.id || match.matchId),
  ];
  if (match.tencricEventId) {
    ids.push(`oy_${match.tencricEventId}`, `10cric_${match.tencricEventId}`);
  }
  for (const id of ids) {
    const key = String(id || '').trim();
    if (key) byId.set(key, match);
  }
}

function lookupMatch(byId, matchId) {
  for (const alias of matchIdAliases(matchId)) {
    if (byId.has(alias)) return byId.get(alias);
  }
  return null;
}

export async function settleOpenBetsFromLiveScores({ limit = 200 } = {}) {
  const betsRes = await query(
    `SELECT b.bet_id, b.match_id, b.market_id, b.selection_id, b.status, b.stake,
            bs.selection_name
     FROM bets b
     LEFT JOIN LATERAL (
       SELECT selection_name FROM bet_selections WHERE bet_id = b.bet_id ORDER BY created_at ASC LIMIT 1
     ) bs ON TRUE
     WHERE UPPER(b.status) IN ('ACCEPTED', 'PENDING', 'OPEN')
     ORDER BY b.created_at ASC
     LIMIT $1`,
    [limit],
  );

  let matches = [];
  try {
    // Always go through the aggregator so the worker does not settle from a
    // hours-old in-memory snapshot while the public live list has already dropped the fixture.
    const snap = await aggregateLiveScores({ force: true });
    matches = snap?.matches || [];
  } catch (err) {
    console.error('[liveMatchSettlement] live book refresh failed', err.message);
    matches = getCachedAggregatedLiveScores()?.matches || [];
  }
  const liveBookReady = matches.length > 0;
  const liveById = new Map();
  const byId = new Map();
  for (const m of matches) {
    indexMatch(liveById, m);
    indexMatch(byId, m);
  }

  // Hydrate open-bet matches missing from the live list (finished / dropped off feed)
  for (const bet of betsRes.rows) {
    const id = String(bet.match_id || '');
    if (!id || lookupMatch(liveById, id)) continue;
    try {
      let detail = null;
      if (/^(oy_|10cric_)/i.test(id)) {
        const { fetch10CricMatchById } = await import('./providers/tencricProvider.mjs');
        detail = await fetch10CricMatchById(id);
      }
      if (!detail) {
        const { fetchMatchDetail } = await import('./matchDetailFetcher.mjs');
        detail = await fetchMatchDetail({ id, matchId: id, sport: 'cricket' }, { fast: true }).catch(() => null);
      }
      if (detail) indexMatch(byId, detail);
    } catch (err) {
      console.error('[liveMatchSettlement] hydrate', id, err.message);
    }
  }

  // Snapshot every live match that has open bets (and a few extras)
  const matchIdsNeeded = new Set(betsRes.rows.map((b) => String(b.match_id)));
  for (const match of matches) {
    const id = String(match.id || match.matchId || '');
    if (!id) continue;
    if (matchIdsNeeded.has(id) || match.isLive || match.matchState === 'in') {
      try {
        await recordMatchOverSnapshots(match);
        await recordMatchDismissalSnapshots(match);
      } catch (err) {
        console.error('[overSnapshot]', id, err.message);
      }
    }
  }

  let settled = 0;
  let skipped = 0;
  let errors = 0;
  const details = [];

  for (const bet of betsRes.rows) {
    const inLiveList = lookupMatch(liveById, bet.match_id);
    const hydrated = lookupMatch(byId, bet.match_id);
    let match = inLiveList || hydrated;
    const market = String(bet.market_id || '');
    const nextOver = market.match(/^(?:i\d+_)?next_over_(\d+)_total$/i);

    // Over markets: settle once that over is done — even if the fixture dropped off live feeds.
    if (nextOver) {
      const overNum = Number(nextOver[1]);
      const hasOvers = !!(match && getBattingOversAndScore(match).oversStr);
      if (!match || !hasOvers || !isTargetOverComplete(match, overNum)) {
        if (!match || !hasOvers) {
          match = {
            id: bet.match_id,
            matchId: bet.match_id,
            liveDetails: { overs: '99.0', firstOvers: '99.0', inningsId: 1 },
            overHistory: match?.overHistory || [],
          };
        }
      }
    }

    const betRow = { ...bet, selection_name: bet.selection_name };
    let evaluated = null;

    if (match && (/^(?:i\d+_)?next_over_\d+_total$/i.test(market) || /^(?:i\d+_)?overs_0_\d+_total$/i.test(market))) {
      evaluated = await evaluateOverMarketBet(betRow, match);
    } else if (match && /next_delivery_/i.test(market)) {
      evaluated = evaluateDeliveryMarketBet(betRow, match);
    } else if (match && /^(?:i\d+_)?team_score_at_\d+_dismissal$/i.test(market)) {
      evaluated = await evaluateDismissalMarketBet(betRow, match);
    } else if (match && (/^team_total/i.test(market) || /^match_total/i.test(market))) {
      evaluated = evaluateTotalsMarketBet(betRow, match);
    }

    const finalSource = (inLiveList && isMatchFinal(inLiveList))
      ? inLiveList
      : (!inLiveList && hydrated && isMatchFinal(hydrated) ? hydrated : null);

    if (!evaluated && finalSource) {
      const matchState = buildSettlementMatchState(finalSource);
      evaluated = evaluateOpenBetOutcome(betRow, matchState) || evaluateBetAfterMatchOver(betRow);
    }

    // Not on the live board (UI "match not found") — never leave OPEN
    // Only when we actually have a live book; empty cache must not void in-play bets.
    if (!evaluated && !inLiveList && liveBookReady) {
      evaluated = evaluateBetAfterMatchOver(betRow);
    }

    if (!evaluated) {
      skipped++;
      continue;
    }

    try {
      const matchState = buildSettlementMatchState(inLiveList || hydrated || match || { id: bet.match_id });
      const res = await betSettlementEngine.settleSingleBet({
        betId: bet.bet_id,
        matchState: {
          ...matchState,
          matchId: matchState.matchId || bet.match_id,
          status: 'COMPLETED',
          __forcedOutcome: evaluated.outcome,
        },
      });
      if (res?.status === 'SETTLED' || res?.success) {
        settled++;
        details.push({
          betId: bet.bet_id,
          outcome: evaluated.outcome,
          reason: evaluated.reason,
          payout: res.payout,
        });
      } else {
        skipped++;
      }
    } catch (err) {
      errors++;
      details.push({ betId: bet.bet_id, error: err.message });
      console.error('[liveMatchSettlement]', bet.bet_id, err.message);
    }
  }

  return {
    success: true,
    checked: betsRes.rows.length,
    settled,
    skipped,
    errors,
    details,
  };
}
