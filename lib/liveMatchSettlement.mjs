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
  parseOversParts,
} from './matchOverSnapshotStore.mjs';
import { parseOuLine as parseLineFromText } from './odds-v3/lineIdentity.mjs';
import { getFormatRules, nextBallSlot, resolveCricketFormat } from './odds-v3/format/CricketFormatRules.mjs';
import { isInPlayMatch } from './matchState.mjs';
import { matchIdAliases } from './matchIdPublic.mjs';
import { lookupMatchForSettlement } from './settlement/resolveCanonicalMatchIdForSettlement.mjs';
import { formatBallOutcome, isNonLegalDelivery, parseDeliveryBallOutcome } from './cricketBallOutcome.mjs';
import { resolveSettlementLine } from './settlement/placementContext.mjs';
import {
  ingestBallEventsFromMatch,
  getConfirmedBallEvent,
  confirmOverBallEvents,
} from './settlement/canonicalBallEvents.mjs';
import {
  enrichMatchWithCanonicalState,
  hasFinalResultWithoutBallFeed,
  isAuthoritativeMatchFinal,
} from './settlement/settlementCanonicalState.mjs';
import { resolveSettlementGrader } from './settlement/marketSettlementRegistry.mjs';
import { combineParlayLegOutcomes } from './settlement/parlaySettlement.mjs';
import { evaluateMilestoneOverMarketBet } from './settlement/milestoneOverEvaluator.mjs';

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

    const line = resolveSettlementLine(bet, selectionId, selectionName)
      ?? parseOuLine(selectionName, selectionId);
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
    return evaluateMilestoneOverMarketBet(bet, match);
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

function getOverHistoryRows(match) {
  return match?.overHistory || match?.liveDetails?.overHistory || [];
}

/** @returns {string|null} formatted ball label for the Nth legal delivery in an over (1-based) */
function getLegalBallAtSlot(balls, ballNum) {
  if (!Array.isArray(balls) || ballNum < 1) return null;
  let legal = 0;
  for (const raw of balls) {
    const label = formatBallOutcome(raw);
    if (isNonLegalDelivery(label)) continue;
    legal += 1;
    if (legal === ballNum) return label;
  }
  return null;
}

export { parseDeliveryBallOutcome } from './cricketBallOutcome.mjs';

/** Resolve the actual outcome of a specific delivery from live over history / current-over balls. */
export function resolveDeliveryBallFromMatch(match, overNum, ballNum) {
  const targetOver = Number(overNum);
  const targetBall = Number(ballNum);
  if (!match || !Number.isFinite(targetOver) || !Number.isFinite(targetBall)) return null;

  const rows = getOverHistoryRows(match);
  for (const row of rows) {
    if (Number(row.overNum || row.over) !== targetOver) continue;
    const ball = getLegalBallAtSlot(row.balls, targetBall);
    if (ball) return parseDeliveryBallOutcome(ball);
  }

  const bat = getBattingOversAndScore(match);
  const parts = parseOversParts(bat.oversStr);
  if (parts) {
    const currentOverNum = parts.balls === 0 ? parts.completed : parts.completed + 1;
    if (currentOverNum === targetOver) {
      const currentBalls = match.liveDetails?.currentOverBalls || [];
      const ball = getLegalBallAtSlot(currentBalls, targetBall);
      if (ball) return parseDeliveryBallOutcome(ball);
    }
  }

  return null;
}

/** Grade next-delivery markets once the ball has been bowled. */
export function gradeDeliveryMarketBet(bet, ballOutcome) {
  if (!ballOutcome || ballOutcome.kind === 'unknown') return null;

  const marketId = String(bet.market_id || '');
  const selId = String(bet.selection_id || '').toLowerCase();
  const selName = String(bet.selection_name || '').toLowerCase();

  if (/next_delivery_runs_/i.test(marketId)) {
    if (ballOutcome.kind === 'wicket') {
      const pickedWicket = selId.includes('del_w') || /wicket/.test(selName);
      return { outcome: pickedWicket ? 'WON' : 'LOST', reason: 'delivery_runs_wicket' };
    }
    const runs = ballOutcome.runs ?? 0;
    const picked = (runs === 0 && (selId.includes('del_0') || /0 run|dot/.test(selName)))
      || (runs === 1 && (selId.includes('del_1') || /^1 run/.test(selName)))
      || (runs === 2 && (selId.includes('del_2') || /^2 run/.test(selName)))
      || (runs === 4 && (selId.includes('del_4') || /four/.test(selName)))
      || (runs === 6 && (selId.includes('del_6') || /six/.test(selName)));
    return { outcome: picked ? 'WON' : 'LOST', reason: `delivery_runs=${runs}` };
  }

  if (/next_delivery_wicket_/i.test(marketId)) {
    const yes = selId.includes('wkt_yes') || /^yes/.test(selName);
    const isWkt = ballOutcome.kind === 'wicket';
    if (yes) return { outcome: isWkt ? 'WON' : 'LOST', reason: `delivery_wicket=${isWkt}` };
    return { outcome: isWkt ? 'LOST' : 'WON', reason: `delivery_wicket=${isWkt}` };
  }

  if (/next_delivery_boundary_/i.test(marketId)) {
    const yes = selId.includes('bnd_yes') || /^yes/.test(selName);
    const isBnd = ballOutcome.isBoundary;
    if (yes) return { outcome: isBnd ? 'WON' : 'LOST', reason: `delivery_boundary=${isBnd}` };
    return { outcome: isBnd ? 'LOST' : 'WON', reason: `delivery_boundary=${isBnd}` };
  }

  if (/next_delivery_ou_/i.test(marketId)) {
    const runs = ballOutcome.kind === 'wicket' ? 0 : (ballOutcome.runs ?? 0);
    const tookOver = selId.includes('over') || /\bover\b/.test(selName);
    const tookUnder = selId.includes('under') || /\bunder\b/.test(selName);
    if (tookOver) return { outcome: runs > 0.5 ? 'WON' : 'LOST', reason: `delivery_ou_runs=${runs}` };
    if (tookUnder) return { outcome: runs < 0.5 ? 'WON' : 'LOST', reason: `delivery_ou_runs=${runs}` };
  }

  return null;
}

/** Per-settlement-run cache so we don't hammer detail APIs for every leg on the same fixture. */
const deliveryDetailCache = new Map();

export function clearDeliverySettlementCache() {
  deliveryDetailCache.clear();
}

function normalizeBetLegs(bet) {
  let sels = bet?.selections;
  if (typeof sels === 'string') {
    try { sels = JSON.parse(sels); } catch { sels = []; }
  }
  if (!Array.isArray(sels)) sels = [];
  if (sels.length === 0) {
    return [{
      match_id: bet.match_id,
      market_id: bet.market_id,
      selection_id: bet.selection_id,
      selection_name: bet.selection_name,
    }];
  }
  return sels;
}

export function betHasDeliveryMarket(bet) {
  const legs = normalizeBetLegs(bet);
  return legs.some((leg) => /next_delivery_/i.test(String(leg.market_id || '')));
}

/** Fetch ball-by-ball over history (live list API omits this). */
export async function enrichMatchForDeliverySettlement(match, matchId) {
  const id = String(matchId || match?.id || match?.matchId || '').trim();
  if (!id) return match;
  if (deliveryDetailCache.has(id)) return deliveryDetailCache.get(id);

  let enriched = match || { id, matchId: id, sport: 'cricket' };
  try {
    const { fetchMatchDetail } = await import('./matchDetailFetcher.mjs');
    const detail = await fetchMatchDetail(
      { ...enriched, id, matchId: id, sport: enriched.sport || 'cricket' },
      { fast: false },
    );
    if (detail) {
      enriched = {
        ...enriched,
        ...detail,
        id: detail.id || id,
        matchId: detail.matchId || id,
        liveDetails: { ...(enriched.liveDetails || {}), ...(detail.liveDetails || {}) },
        overHistory: detail.overHistory?.length
          ? detail.overHistory
          : (enriched.overHistory || enriched.liveDetails?.overHistory || []),
      };
    }
  } catch (err) {
    console.error('[deliverySettlement] enrich', id, err.message);
  }

  deliveryDetailCache.set(id, enriched);
  return enriched;
}

function trySettlePassedDeliveryBet(bet, match, overNum, ballNum, slot, confirmedEvent = null) {
  const ballOutcome = confirmedEvent?.parsed
    ?? resolveDeliveryBallFromMatch(match, overNum, ballNum);
  if (confirmedEvent && !confirmedEvent.isConfirmed) return null;
  const graded = gradeDeliveryMarketBet(bet, ballOutcome);
  if (graded) return graded;
  // No authoritative ball outcome — stay PENDING until provider supplies data or match ends.
  if (isMatchFinal(match)) {
    return { outcome: 'VOID', reason: `delivery_match_over_ungradeable bet=${overNum}.${ballNum}` };
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

  if (!match) return null;

  const marketInn = hit[1] != null ? Number(hit[1]) : null;
  const overNum = Number(hit[2]);
  const ballNum = Number(hit[3]);

  if (isMatchFinal(match)) {
    const slot = { overNum, ballNum: ballNum + 1 };
    const settled = trySettlePassedDeliveryBet(bet, match, overNum, ballNum, slot);
    if (settled) return settled;
    return { outcome: 'VOID', reason: 'delivery_match_over' };
  }

  if (!isInPlayMatch(match)) {
    const ld = match.liveDetails || {};
    const hasLiveProgress = Boolean(
      ld.overs || ld.firstOvers || ld.chaseOvers
      || Number(ld.firstRuns) > 0 || Number(ld.chaseRuns) > 0,
    );
    if (hasLiveProgress) {
      const bat = getBattingOversAndScore(match);
      const inningsPassed = marketInn != null && bat.innings > marketInn;
      if (inningsPassed) {
        return trySettlePassedDeliveryBet(bet, match, overNum, ballNum, { overNum: overNum + 1, ballNum: 1 });
      }
      return null;
    }
    return { outcome: 'VOID', reason: 'delivery_not_in_play' };
  }

  const maxOvers = getMatchMaxOvers(match);
  if (maxOvers && overNum > maxOvers) {
    return { outcome: 'VOID', reason: 'delivery_over_past_format' };
  }

  const bat = getBattingOversAndScore(match);
  const inningsPassed = marketInn != null && bat.innings > marketInn;

  const oversStr = bat.oversStr || match.liveDetails?.overs;
  if (oversStr == null || String(oversStr).trim() === '') return null;

  const format = resolveCricketFormat(match);
  const rules = getFormatRules(format) || getFormatRules('T20');
  const ballsCompleted = oversToBallsForMatch(oversStr, match);
  const slot = nextBallSlot(ballsCompleted, rules.ballsPerOver || 6);
  const ballPassed = slot.overNum > overNum || (slot.overNum === overNum && slot.ballNum > ballNum);

  if (ballPassed || inningsPassed) {
    return trySettlePassedDeliveryBet(bet, match, overNum, ballNum, slot);
  }
  return null;
}

/** Re-evaluate after hydrating commentary when live feed lacks overHistory. */
export async function evaluateDeliveryMarketBetAsync(bet, match, matchId) {
  const first = evaluateDeliveryMarketBet(bet, match);
  if (first) return first;

  const hit = String(bet.market_id || '').match(/^(?:i(\d+)_)?next_delivery_[a-z]+_(\d+)_(\d+)$/i);
  if (!hit || !match) return null;

  const marketInn = hit[1] != null ? Number(hit[1]) : 1;
  const overNum = Number(hit[2]);
  const ballNum = Number(hit[3]);
  const bat = getBattingOversAndScore(match);
  const oversStr = bat.oversStr || match.liveDetails?.overs;
  if (oversStr == null || String(oversStr).trim() === '') return null;

  const format = resolveCricketFormat(match);
  const rules = getFormatRules(format) || getFormatRules('T20');
  const ballsCompleted = oversToBallsForMatch(oversStr, match);
  const slot = nextBallSlot(ballsCompleted, rules.ballsPerOver || 6);
  const ballPassed = slot.overNum > overNum || (slot.overNum === overNum && slot.ballNum > ballNum);
  if (!ballPassed) return null;

  const id = String(matchId || match.id || match.matchId || '');
  const confirmed = await getConfirmedBallEvent(id, marketInn, overNum, ballNum);
  if (confirmed?.isConfirmed) {
    const settled = trySettlePassedDeliveryBet(bet, match, overNum, ballNum, slot, confirmed);
    if (settled) return settled;
  }

  const enriched = await enrichMatchForDeliverySettlement(match, matchId);
  return evaluateDeliveryMarketBet(bet, enriched);
}

/** Settle accumulator legs — uses per-leg match lookup; early LOST when any leg loses. */
export async function evaluateAccumulatorBet(bet, matchOrLookup) {
  const legs = normalizeBetLegs(bet);
  if (legs.length <= 1) return null;

  const lookup = typeof matchOrLookup === 'function'
    ? matchOrLookup
    : (id) => matchOrLookup;

  const legOutcomes = [];
  for (const leg of legs) {
    const legMatchId = leg.match_id || bet.match_id;
    const legMatch = lookup(legMatchId);
    const legRow = {
      ...bet,
      match_id: legMatchId,
      market_id: leg.market_id,
      selection_id: leg.selection_id,
      selection_name: leg.selection_name,
    };
    const legEval = await evaluateLegForSettlement(legRow, legMatch, legMatchId);
    if (!legEval) {
      legOutcomes.push({ outcome: null, marketId: leg.market_id });
      continue;
    }
    legOutcomes.push({ ...legEval, marketId: leg.market_id, selectionId: leg.selection_id });
    if (legEval.outcome === 'LOST') {
      return { outcome: 'LOST', reason: 'acca_leg_lost', legOutcomes };
    }
  }

  return combineParlayLegOutcomes(legOutcomes);
}

async function evaluateLegForSettlement(betRow, match, matchId) {
  if (!match) return null;
  const market = String(betRow.market_id || '');
  const grader = resolveSettlementGrader(market);

  if (grader === 'overMarket') {
    return evaluateOverMarketBet(betRow, match);
  }
  if (grader === 'deliveryMarket') {
    return evaluateDeliveryMarketBetAsync(betRow, match, matchId || betRow.match_id);
  }
  if (grader === 'dismissalMarket') {
    return evaluateDismissalMarketBet(betRow, match);
  }
  if (grader === 'totalsMarket') {
    return evaluateTotalsMarketBet(betRow, match);
  }
  if (grader === 'openBetOutcome') {
    const state = buildSettlementMatchState(match);
    return evaluateOpenBetOutcome(betRow, state);
  }
  return null;
}

export async function evaluateBetForSettlement(betRow, matchLookup) {
  const legs = normalizeBetLegs(betRow);
  const isAcca = String(betRow.bet_type || '').toUpperCase() === 'ACCUMULATOR' && legs.length > 1;

  if (isAcca) {
    return evaluateAccumulatorBet(betRow, matchLookup);
  }

  const leg = legs[0] || betRow;
  const matchId = leg.match_id || betRow.match_id;
  const match = typeof matchLookup === 'function' ? matchLookup(matchId) : matchLookup;
  return evaluateLegForSettlement({
    ...betRow,
    match_id: matchId,
    market_id: leg.market_id || betRow.market_id,
    selection_id: leg.selection_id || betRow.selection_id,
    selection_name: leg.selection_name || betRow.selection_name,
  }, match, matchId);
}

function indexMatch(byId, match) {
  if (!match) return;
  const enriched = enrichMatchWithCanonicalState(match);
  const ids = [
    enriched.id,
    enriched.matchId,
    enriched.legacyId,
    ...matchIdAliases(enriched.id || enriched.matchId),
  ];
  if (enriched.tencricEventId) {
    ids.push(`oy_${enriched.tencricEventId}`, `10cric_${enriched.tencricEventId}`);
  }
  for (const id of ids) {
    const key = String(id || '').trim();
    if (key) byId.set(key, enriched);
  }
}

function lookupMatch(byId, matchId) {
  return lookupMatchForSettlement(byId, byId, matchId);
}

export async function settleOpenBetsFromLiveScores({ limit = 200, matchId = null } = {}) {
  clearDeliverySettlementCache();

  const betsRes = await query(
    matchId
      ? `SELECT b.bet_id, b.match_id, b.market_id, b.selection_id, b.status, b.stake, b.bet_type,
                b.placement_snapshot,
                (
                  SELECT bs.selection_name FROM bet_selections bs
                  WHERE bs.bet_id = b.bet_id ORDER BY bs.created_at ASC LIMIT 1
                ) AS selection_name,
                COALESCE(
                  json_agg(
                    json_build_object(
                      'match_id', bs.match_id,
                      'market_id', bs.market_id,
                      'selection_id', bs.selection_id,
                      'selection_name', bs.selection_name
                    ) ORDER BY bs.created_at ASC
                  ) FILTER (WHERE bs.id IS NOT NULL),
                  '[]'::json
                ) AS selections
         FROM bets b
         LEFT JOIN bet_selections bs ON bs.bet_id = b.bet_id
         WHERE UPPER(b.status) IN ('ACCEPTED', 'PENDING', 'OPEN')
           AND b.match_id = $2
         GROUP BY b.bet_id, b.match_id, b.market_id, b.selection_id, b.status, b.stake, b.bet_type, b.placement_snapshot
         ORDER BY b.created_at ASC
         LIMIT $1`
      : `SELECT b.bet_id, b.match_id, b.market_id, b.selection_id, b.status, b.stake, b.bet_type,
                b.placement_snapshot,
                (
                  SELECT bs.selection_name FROM bet_selections bs
                  WHERE bs.bet_id = b.bet_id ORDER BY bs.created_at ASC LIMIT 1
                ) AS selection_name,
                COALESCE(
                  json_agg(
                    json_build_object(
                      'match_id', bs.match_id,
                      'market_id', bs.market_id,
                      'selection_id', bs.selection_id,
                      'selection_name', bs.selection_name
                    ) ORDER BY bs.created_at ASC
                  ) FILTER (WHERE bs.id IS NOT NULL),
                  '[]'::json
                ) AS selections
         FROM bets b
         LEFT JOIN bet_selections bs ON bs.bet_id = b.bet_id
         WHERE UPPER(b.status) IN ('ACCEPTED', 'PENDING', 'OPEN')
         GROUP BY b.bet_id, b.match_id, b.market_id, b.selection_id, b.status, b.stake, b.bet_type, b.placement_snapshot
         ORDER BY b.created_at ASC
         LIMIT $1`,
    matchId ? [limit, matchId] : [limit],
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

  // Hydrate every match referenced by open bets (primary + acca legs)
  const matchIdsNeeded = new Set();
  for (const bet of betsRes.rows) {
    matchIdsNeeded.add(String(bet.match_id));
    for (const leg of normalizeBetLegs(bet)) {
      if (leg.match_id) matchIdsNeeded.add(String(leg.match_id));
    }
  }

  for (const match of matches) {
    const id = String(match.id || match.matchId || '');
    if (!id) continue;
    if (matchIdsNeeded.has(id) || match.isLive || match.matchState === 'in') {
      try {
        await recordMatchOverSnapshots(match);
        await recordMatchDismissalSnapshots(match);
        const ballIngest = await ingestBallEventsFromMatch(match);
        if (ballIngest.corrections > 0) {
          console.log(JSON.stringify({
            event: 'SETTLEMENT_CORRECTION',
            matchId: id,
            corrections: ballIngest.corrections,
          }));
        }
        const bat = getBattingOversAndScore(match);
        const parts = parseOversParts(bat.oversStr);
        if (parts?.balls === 0 && parts.completed > 0) {
          await confirmOverBallEvents(id, bat.innings, parts.completed);
          const { enqueueBetsForMarketInstance } = await import('./settlement/settlementQueue.mjs');
          await enqueueBetsForMarketInstance({
            matchId: id,
            marketInstanceKey: `OVER_TOTAL:I${bat.innings}:O${parts.completed}`,
            triggerEventId: `over_complete_${id}_i${bat.innings}_o${parts.completed}`,
            marketIdPattern: `%next_over_${parts.completed}_total%`,
          });
        }
      } catch (err) {
        console.error('[overSnapshot]', id, err.message);
      }
    }
  }

  // Hydrate matches that need ball-by-ball history for delivery settlement
  for (const bet of betsRes.rows) {
    if (!betHasDeliveryMarket(bet)) continue;
    for (const leg of normalizeBetLegs(bet)) {
      const id = String(leg.match_id || bet.match_id || '');
      if (!id) continue;
      const existing = lookupMatch(byId, id);
      if (existing?.overHistory?.length) continue;
      try {
        const enriched = await enrichMatchForDeliverySettlement(existing || { id, sport: 'cricket' }, id);
        if (enriched) indexMatch(byId, enriched);
      } catch (err) {
        console.error('[liveMatchSettlement] delivery hydrate', id, err.message);
      }
    }
  }

  const matchLookup = (matchId) => lookupMatch(byId, matchId) || lookupMatch(liveById, matchId);

  let settled = 0;
  let skipped = 0;
  let errors = 0;
  const details = [];

  for (const bet of betsRes.rows) {
    const inLiveList = lookupMatch(liveById, bet.match_id);
    const hydrated = lookupMatch(byId, bet.match_id);
    const match = inLiveList || hydrated;

    const betRow = { ...bet, selection_name: bet.selection_name };
    let evaluated = null;

    if (matchLookup(bet.match_id)) {
      evaluated = await evaluateBetForSettlement(betRow, matchLookup);
    }

    const market = String(bet.market_id || '');

    const finalSource = (inLiveList && isMatchFinal(inLiveList))
      ? inLiveList
      : (!inLiveList && hydrated && isMatchFinal(hydrated) ? hydrated : null);

    if (!evaluated && finalSource) {
      const canonicalFinal = enrichMatchWithCanonicalState(finalSource);
      const matchState = buildSettlementMatchState(canonicalFinal);
      evaluated = evaluateOpenBetOutcome(betRow, matchState);
      if (!evaluated && hasFinalResultWithoutBallFeed(canonicalFinal)) {
        evaluated = evaluateOpenBetOutcome(betRow, matchState)
          || evaluateBetAfterMatchOver(betRow);
      } else if (!evaluated) {
        evaluated = evaluateBetAfterMatchOver(betRow);
      }
    }

    // Do not void merely because a fixture dropped off the live ticker.
    // In-play micro markets void only when we have reliable live/final state above.
    // Ungradeable open bets stay ACCEPTED until the match is confirmed final or hydrated.

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
          __settlementReason: evaluated.reason,
          __legOutcomes: evaluated.legOutcomes,
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
