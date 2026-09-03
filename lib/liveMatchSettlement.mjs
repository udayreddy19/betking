/**
 * Settle open bets from live-score completion (not only the empty matches table).
 */

let _query = null;
async function dbQuery(...args) {
  if (!_query) {
    const pg = await import('../db/pg.js');
    _query = pg.query;
  }
  return _query(...args);
}
import { betSettlementEngine } from './betSettlementEngine.mjs';
import { getCachedAggregatedLiveScores, aggregateLiveScores } from './aggregator.mjs';
import { isCricketMatchCompleted } from '../src/utils/cricketMatchComplete.js';
import { getMatchMaxOvers, oversToBallsForMatch } from '../src/utils/cricketFormat.js';
import { teamNameMatches } from '../src/utils/cricketScores.js';
import {
  recordMatchOverSnapshots,
  recordMatchDismissalSnapshots,
  getRunsInOver,
  getWicketsInOver,
  getScoreAtOverEnd,
  getScoreAtDismissal,
  isTargetOverComplete,
  getBattingOversAndScore,
  parseOversParts,
  resolveOverHistoryRow,
  runsFromOverRow,
} from './matchOverSnapshotStore.mjs';
import { parseOuLine as parseLineFromText } from './odds-v3/lineIdentity.mjs';
import { getFormatRules, nextBallSlot, resolveCricketFormat } from './odds-v3/format/CricketFormatRules.mjs';
import { isInPlayMatch } from './matchState.mjs';
import { matchIdAliases } from './matchIdPublic.mjs';
import { lookupMatchForSettlement } from './settlement/resolveCanonicalMatchIdForSettlement.mjs';
import { formatBallOutcome, isNonLegalDelivery, parseDeliveryBallOutcome } from './cricketBallOutcome.mjs';
import { resolveSettlementLine, getPrimaryLegContext, parsePlacementSnapshot } from './settlement/placementContext.mjs';
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
import { evaluatePlayerPropMarketBet } from './settlement/playerMilestoneEvaluator.mjs';
import { evaluateSettlementConfidence } from './settlement/settlementConfidenceEngine.mjs';
import { authorizeSettlement } from './settlement/settlementAuthorizationEngine.mjs';
import {
  isInningsComplete,
  isOverNeverCompleted,
  resolveInningsWickets,
  resolveInningsRuns,
} from './settlement/inningsCompletion.mjs';

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
  if (state === 'post' || state === 'completed' || match.isCompleted) return true;
  if (['COMPLETED', 'FINAL', 'FINISHED', 'CLOSED', 'ABANDONED', 'CANCELLED', 'HISTORICAL', 'SETTLED'].includes(status)) return true;
  if (/^(COMPLETED|FINAL|FINISHED|CLOSED|HISTORICAL|SETTLED)$/i.test(String(match.time || ''))) return true;
  if (isCricketMatchCompleted(match)) return true;

  const ld = match.liveDetails || {};
  const s1 = parseRuns(match.team1?.runs ?? match.score1 ?? ld.score1 ?? ld.firstRuns ?? ld.runs ?? match.live_score1);
  const s2 = parseRuns(match.team2?.runs ?? match.score2 ?? ld.score2 ?? ld.chaseRuns ?? match.live_score2);
  const hasBothScores = s1 > 0 && s2 > 0;
  const startTime = match.startTime || match.start_time || match.startDate ? new Date(match.startTime || match.start_time || match.startDate).getTime() : 0;
  const updatedAt = match.updatedAt || match.updated_at ? new Date(match.updatedAt || match.updated_at).getTime() : 0;
  const cachedAt = match.cachedAt ? new Date(match.cachedAt).getTime() : 0;
  const now = Date.now();

  if ((startTime > 0 && now - startTime > 3.5 * 3600 * 1000) || (hasBothScores && updatedAt > 0 && now - updatedAt > 15 * 60 * 1000)) {
    return true;
  }

  const hasBothInnings = (Number(ld.firstRuns) > 0 || Number(match.team1?.runs) > 0 || Number(match.score1) > 0 || parseRuns(match.live_score1) > 0)
    && (Number(ld.chaseRuns) > 0 || Number(match.team2?.runs) > 0 || Number(match.score2) > 0 || parseRuns(match.live_score2) > 0);
  if (hasBothInnings) {
    if ((cachedAt > 0 && now - cachedAt > 15 * 60 * 1000) || (startTime > 0 && now - startTime > 3.5 * 3600 * 1000)) {
      return true;
    }
  }

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

  const t1 = match.team1?.name || match.team1?.shortName || match.homeTeam?.name || match.homeTeam?.shortName || '';
  const t2 = match.team2?.name || match.team2?.shortName || match.awayTeam?.name || match.awayTeam?.shortName || '';

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

  const s1 = parseRuns(match.team1?.runs ?? match.score1 ?? ld.score1 ?? ld.runs ?? ld.firstRuns ?? match.live_score1);
  const s2 = parseRuns(match.team2?.runs ?? match.score2 ?? ld.score2 ?? ld.chaseRuns ?? match.live_score2);
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
  const tokens = [selectionId, selectionName].filter(Boolean).map((v) => String(v));
  for (const c of tokens) {
    if (teamNameMatches(c, team.name) || teamNameMatches(c, team.shortName)) return true;
    const a = String(c).toLowerCase().replace(/^sel[_-]?/i, '');
    const short = String(team.shortName || team.code || '').toLowerCase();
    const name = String(team.name || '').toLowerCase();
    if (short && (a === short || a.includes(short) || (a.length >= 3 && short.includes(a)))) return true;
    if (name && a.length >= 3 && name.split(/\s+/).some((w) => w.startsWith(a) || (a.length >= 3 && a.startsWith(w.slice(0, 3))))) return true;
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
  return (/(?:^|[^a-z])over(?:[^a-z]|$)/.test(s) || s.includes('sel_over') || s.includes('over')) && !s.includes('under');
}

function isUnderSelection(selectionId, selectionName) {
  const s = `${selectionId} ${selectionName}`.toLowerCase();
  return /(?:^|[^a-z])under(?:[^a-z]|$)/.test(s) || s.includes('sel_under') || s.includes('under');
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
    const namedInn = String(bet.market_name || bet.market || '').match(/(\d+)(?:st|nd|rd|th)?\s*innings/i);
    const settleInnings = marketInnings
      ?? (namedInn ? Number(namedInn[1]) : null)
      ?? (bat.innings >= 2 ? 1 : bat.innings);

    // Do not settle 1st-innings overs against chase data
    if (marketInnings != null && bat.innings !== marketInnings && bat.innings < marketInnings) {
      return null;
    }
    if (settleInnings === bat.innings && !isTargetOverComplete(match, overNum)) {
      // Innings ended before this over completed → VOID (event never occurred)
      if (isOverNeverCompleted(match, settleInnings, overNum)) {
        return {
          outcome: 'VOID',
          reason: `over_${overNum}_i${settleInnings}_never_bowled`,
        };
      }
      return null;
    }
    if (settleInnings !== bat.innings && bat.innings < 2) return null;
    // When chase has started, 1st-innings next-over is complete if we have snapshot or first overs past
    if (settleInnings !== bat.innings) {
      const firstOvers = match.liveDetails?.firstOvers;
      const parts = String(firstOvers || '').match(/^(\d+)/);
      if (parts && Number(parts[1]) < overNum && bat.innings < 2) return null;
      if (isOverNeverCompleted(match, settleInnings, overNum)) {
        return {
          outcome: 'VOID',
          reason: `over_${overNum}_i${settleInnings}_never_bowled`,
        };
      }
    }

    let runs = null;
    const hist = match.overHistory || match.liveDetails?.overHistory || [];
    const histRow = resolveOverHistoryRow(
      hist,
      overNum,
      settleInnings,
      bat.innings,
      parseOversParts(bat.oversStr)?.completed,
    );
    const histRuns = runsFromOverRow(histRow);
    if (histRuns != null) runs = histRuns;
    if (runs == null) {
      runs = await getRunsInOver(match.id || match.matchId, overNum, settleInnings);
    }

    if (runs == null || !Number.isFinite(runs)) {
      if (isOverNeverCompleted(match, settleInnings, overNum)) {
        return {
          outcome: 'VOID',
          reason: `over_${overNum}_i${settleInnings}_never_bowled`,
        };
      }
      return null;
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

/**
 * Grade "Wicket In Next Over N" / "Wicket In Current Over N" once over N completes.
 * Uses match_over_snapshots wickets_at_end (same source that settles next_over totals).
 */
export async function evaluateWicketInOverMarketBet(bet, match) {
  const market = String(bet.market_id || '');
  const hit = market.match(/^(?:i(\d+)_)?wicket_in_(?:next_)?over_(\d+)$/i);
  if (!hit) return null;

  const marketInnings = hit[1] != null ? Number(hit[1]) : null;
  const overNum = Number(hit[2]);
  const bat = getBattingOversAndScore(match);
  const settleInnings = marketInnings ?? bat.innings;

  // Prefer durable over snapshots — settle as soon as over N is recorded,
  // even if the live ticker has moved on or the match dropped off live lists.
  let wicketsInOver = await getWicketsInOver(
    match?.id || match?.matchId,
    overNum,
    settleInnings,
  );

  if (wicketsInOver == null) {
    if (marketInnings != null && bat.innings < marketInnings) return null;
    if (settleInnings === bat.innings && !isTargetOverComplete(match, overNum)) {
      if (isOverNeverCompleted(match, settleInnings, overNum)) {
        return {
          outcome: 'VOID',
          reason: `wicket_in_over_${overNum}_i${settleInnings}_never_bowled`,
        };
      }
      return null;
    }
    const hist = match?.overHistory || match?.liveDetails?.overHistory || [];
    const row = hist.find((h) => Number(h.overNum || h.over) === overNum && !h.isCurrent);
    if (row && Array.isArray(row.balls)) {
      wicketsInOver = row.balls.filter((b) => {
        const s = String(b);
        return /^W$/i.test(s) || s.toLowerCase() === 'w' || /wkt|out/i.test(s);
      }).length;
    }
  }

  if (wicketsInOver == null || !Number.isFinite(wicketsInOver)) {
    if (isOverNeverCompleted(match, settleInnings, overNum)) {
      return {
        outcome: 'VOID',
        reason: `wicket_in_over_${overNum}_i${settleInnings}_never_bowled`,
      };
    }
    return null;
  }

  const hadWicket = wicketsInOver > 0;
  const selectionId = String(bet.selection_id || '').toLowerCase();
  const selectionName = String(bet.selection_name || '').toLowerCase();
  const pickedYes = selectionId.includes('yes') || /^yes/.test(selectionName);
  const pickedNo = selectionId.includes('no') || /^no/.test(selectionName);

  if (pickedYes) {
    return {
      outcome: hadWicket ? 'WON' : 'LOST',
      reason: `wicket_in_over_${overNum}_i${settleInnings}_wkts=${wicketsInOver}`,
    };
  }
  if (pickedNo) {
    return {
      outcome: hadWicket ? 'LOST' : 'WON',
      reason: `wicket_in_over_${overNum}_i${settleInnings}_wkts=${wicketsInOver}`,
    };
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
  const ld = match?.liveDetails || {};
  const settleInnings = marketInnings ?? (bat.innings >= 2 ? 1 : bat.innings);

  if (marketInnings != null && bat.innings < marketInnings) return null;

  // Need the wicket to have fallen in that innings
  const wicketsForSettle = resolveInningsWickets(match, settleInnings);

  // Innings finished without this dismissal → VOID (event never occurred).
  // Example: bet on score at 5th wicket, innings ends 212/4.
  if (wicketsForSettle < wicketNum) {
    if (isDismissalInningsComplete(match, settleInnings, bat, ld)) {
      return {
        outcome: 'VOID',
        reason: `dismissal_${wicketNum}_i${settleInnings}_never_occurred_wkts=${wicketsForSettle}`,
      };
    }
    return null;
  }

  let score = await getScoreAtDismissal(match.id || match.matchId, wicketNum, settleInnings);
  if (score == null && settleInnings === bat.innings && (Number(bat.wickets) || 0) === wicketNum) {
    score = Number(bat.score) || 0;
  }
  if (score == null && (wicketNum >= 10 || wicketsForSettle === wicketNum || isDismissalInningsComplete(match, settleInnings, bat, ld))) {
    if (wicketNum >= 10 || wicketsForSettle === wicketNum) {
      score = resolveInningsRuns(match, settleInnings);
    }
  }
  if (score == null && settleInnings === 1 && bat.innings >= 2) {
    // Innings advanced but FOW snapshot missing — do not invent a score.
    return null;
  }
  if (score == null || !Number.isFinite(score)) {
    return null;
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

/**
 * True when the batting innings for a dismissal-score market is finished
 * (chase started, all out, overs exhausted, or match final).
 */
export function isDismissalInningsComplete(match, settleInnings, bat = null, ld = null) {
  return isInningsComplete(match, settleInnings, bat, ld);
}

/** Resolve which team's score grades a team_total / iN_team_total market (AUD-015). */
function resolveTeamTotalScore(bet, match) {
  const market = String(bet.market_id || '').toLowerCase();
  const ld = match?.liveDetails || {};
  const leg = getPrimaryLegContext(bet);
  const snap = parsePlacementSnapshot(bet);
  const scoped = market.match(/^i([12])_/);
  if (scoped) {
    const inn = Number(scoped[1]);
    const resolved = resolveInningsRuns(match, inn);
    if (Number.isFinite(resolved) && resolved > 0) return resolved;
    if (inn === 1) return Number(ld.firstRuns ?? match.team1?.runs ?? NaN);
    if (inn === 2) return Number(match.team2?.runs ?? ld.chaseRuns ?? NaN);
  }
  if (leg?.teamId && match?.team1?.id && String(leg.teamId) === String(match.team1.id)) {
    return resolveInningsRuns(match, 1);
  }
  if (leg?.teamId && match?.team2?.id && String(leg.teamId) === String(match.team2.id)) {
    return resolveInningsRuns(match, 2);
  }
  const placedInn = Number(leg?.innings ?? snap?.inningsAtPlacement);
  if (placedInn === 1 || market.includes('team1')) {
    return resolveInningsRuns(match, 1);
  }
  if (placedInn === 2 || market.includes('team2')) {
    return resolveInningsRuns(match, 2);
  }
  if (market === 'team_total' || market.startsWith('team_total_alt')) {
    // Unscoped team_total without placement innings defaults to 1st innings — never live chase.
    return resolveInningsRuns(match, 1);
  }
  return NaN;
}

/** Settle team_total / match_total when innings or match is decided. */
export function evaluateTotalsMarketBet(bet, match) {
  const market = String(bet.market_id || '').toLowerCase();
  // Defense-in-depth: boundary total markets MUST route to evaluateTeamBoundaryMarketBet
  if (market.includes('fours') || market.includes('sixes') || market.includes('wickets')) return null;

  const selectionId = String(bet.selection_id || '');
  const selectionName = String(bet.selection_name || '');
  const line = parseOuLine(selectionName, selectionId);
  if (line == null) return null;

  const ld = match?.liveDetails || {};
  const bat = getBattingOversAndScore(match);
  const leg = getPrimaryLegContext(bet);
  const snap = parsePlacementSnapshot(bet);

  const isTeamTotal = market === 'team_total' || market.startsWith('team_total_alt_') || market.includes('_team_total');
  if (isTeamTotal) {
    const inningsScoped = market.match(/^i([12])_/);
    let inn = 1;
    if (inningsScoped) {
      inn = Number(inningsScoped[1]);
    } else if (leg?.innings) {
      inn = Number(leg.innings);
    } else if (snap?.inningsAtPlacement != null && Number.isFinite(Number(snap.inningsAtPlacement))) {
      inn = Number(snap.inningsAtPlacement);
    } else if (leg?.teamId && match?.team2?.id && String(leg.teamId) === String(match.team2.id)) {
      inn = 2;
    } else if (selectionLooksLikeTeam(selectionId, selectionName, match?.team2)) {
      inn = 2;
    }
    // Do NOT bind unscoped team_total to live bat.innings — that regrades 1st-innings
    // Over bets as chase totals mid-match (e.g. Over 169.5 LOST on stale chaseRuns=142).

    const firstInningsComplete = isInningsComplete(match, 1, bat, ld);
    // Authoritative only: never finalize Over LOST / Under WON from stale-cache heuristics.
    const chaseInningsComplete = isInningsComplete(match, 2, bat, ld, { requireAuthoritative: true });

    if (inn === 1) {
      if (!firstInningsComplete && bat.innings === 1) {
        const liveScore = resolveInningsRuns(match, 1);
        if (isUnderSelection(selectionId, selectionName) && liveScore > line) {
          return { outcome: 'LOST', reason: `team_total_i1_under_crossed score=${liveScore}_line=${line}`, hasImmutableSnapshotEvidence: true };
        }
        if (isOverSelection(selectionId, selectionName) && liveScore > line) {
          return { outcome: 'WON', reason: `team_total_i1_over_hit score=${liveScore}_line=${line}`, hasImmutableSnapshotEvidence: true };
        }
        return null; // Under CANNOT settle as WON while 1st innings is active
      }

      if (!firstInningsComplete && bat.innings < 2) return null;

      const final1 = resolveInningsRuns(match, 1);
      if (!Number.isFinite(final1)) return null;

      if (isOverSelection(selectionId, selectionName)) {
        return { outcome: final1 > line ? 'WON' : 'LOST', reason: `team_total_i1_final=${final1}_line=${line}`, hasImmutableSnapshotEvidence: true };
      }
      if (isUnderSelection(selectionId, selectionName)) {
        return { outcome: final1 < line ? 'WON' : 'LOST', reason: `team_total_i1_final=${final1}_line=${line}`, hasImmutableSnapshotEvidence: true };
      }
      return null;
    }

    if (inn === 2) {
      const live2 = resolveInningsRuns(match, 2);
      if (!chaseInningsComplete) {
        if (isOverSelection(selectionId, selectionName) && live2 > line) {
          return { outcome: 'WON', reason: `team_total_i2_live_over score=${live2}_line=${line}`, hasImmutableSnapshotEvidence: true };
        }
        if (isUnderSelection(selectionId, selectionName) && live2 > line) {
          return { outcome: 'LOST', reason: `team_total_i2_live_under_crossed score=${live2}_line=${line}`, hasImmutableSnapshotEvidence: true };
        }
        return null; // Under CANNOT settle as WON while 2nd innings is active
      }

      const final2 = resolveInningsRuns(match, 2);
      if (!Number.isFinite(final2)) return null;

      if (isOverSelection(selectionId, selectionName)) {
        return { outcome: final2 > line ? 'WON' : 'LOST', reason: `team_total_i2_final=${final2}_line=${line}`, hasImmutableSnapshotEvidence: true };
      }
      if (isUnderSelection(selectionId, selectionName)) {
        return { outcome: final2 < line ? 'WON' : 'LOST', reason: `team_total_i2_final=${final2}_line=${line}`, hasImmutableSnapshotEvidence: true };
      }
      return null;
    }

    return null;
  }

  if (market === 'match_total' || market.startsWith('match_total_alt')) {
    const sport = String(match?.sport || '').toLowerCase();
    const cricket = !sport || sport.includes('cricket');
    if (!cricket) {
      return evaluateScoreTotalBet(bet, match);
    }
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

/** P0 FIX: Settle team_total_fours and team_total_sixes using boundary counts, NEVER runs */
export function evaluateTeamBoundaryMarketBet(bet, match) {
  const market = String(bet.market_id || '').toLowerCase();
  const selectionId = String(bet.selection_id || '');
  const selectionName = String(bet.selection_name || '');
  const line = parseOuLine(selectionName, selectionId);
  if (line == null) return null;

  const isSixes = market.includes('sixes');
  const isFours = market.includes('fours');
  if (!isSixes && !isFours) return null;

  const ld = match?.liveDetails || {};
  const bat = getBattingOversAndScore(match);
  const leg = getPrimaryLegContext(bet);
  const inningsScoped = market.match(/^i([12])_/);
  let inn = 1;
  if (inningsScoped) {
    inn = Number(inningsScoped[1]);
  } else if (leg?.innings) {
    inn = Number(leg.innings);
  } else if (leg?.teamId && match?.team2?.id && String(leg.teamId) === String(match.team2.id)) {
    inn = 2;
  } else if (selectionLooksLikeTeam(selectionId, selectionName, match?.team2)) {
    inn = 2;
  }

  const teamKey = inn === 1 ? 'team1' : 'team2';
  const teamObj = match?.[teamKey] || {};
  const ldTeam = ld?.[teamKey] || {};

  const boundaryCount = Number(
    isSixes
      ? (teamObj.sixes ?? ldTeam.sixes ?? teamObj.totalSixes ?? ld.sixes)
      : (teamObj.fours ?? ldTeam.fours ?? teamObj.totalFours ?? ld.fours)
  );

  const isFinal = isMatchFinal(match);
  const firstInningsComplete = isFinal || isInningsComplete(match, 1, bat, ld);
  const chaseInningsComplete = isFinal || isInningsComplete(match, 2, bat, ld);
  const isComplete = inn === 1 ? firstInningsComplete : chaseInningsComplete;

  if (!isComplete) {
    if (Number.isFinite(boundaryCount)) {
      if (isUnderSelection(selectionId, selectionName) && boundaryCount > line) {
        return { outcome: 'LOST', reason: `team_boundary_under_crossed count=${boundaryCount}_line=${line}` };
      }
      if (isOverSelection(selectionId, selectionName) && boundaryCount > line) {
        return { outcome: 'WON', reason: `team_boundary_over_hit count=${boundaryCount}_line=${line}` };
      }
    }
    return null; // Under CANNOT settle as WON while innings is active
  }

  if (!Number.isFinite(boundaryCount)) return null;

  if (isOverSelection(selectionId, selectionName)) {
    return { outcome: boundaryCount > line ? 'WON' : 'LOST', reason: `team_boundary_final=${boundaryCount}_line=${line}` };
  }
  if (isUnderSelection(selectionId, selectionName)) {
    return { outcome: boundaryCount < line ? 'WON' : 'LOST', reason: `team_boundary_final=${boundaryCount}_line=${line}` };
  }
  return null;
}

/** Settle Team Most Fours / Team Most Sixes */
export function evaluateMostBoundariesBet(bet, match) {
  if (!isMatchFinal(match)) return null;
  const market = String(bet.market_id || '').toLowerCase();
  const selectionId = String(bet.selection_id || '').toLowerCase();
  const selectionName = String(bet.selection_name || '').toLowerCase();
  const isSixes = market.includes('sixes');

  const t1 = match?.team1 || {};
  const t2 = match?.team2 || {};
  const ld = match?.liveDetails || {};

  const c1 = Number(isSixes ? (t1.sixes ?? ld.team1?.sixes ?? 0) : (t1.fours ?? ld.team1?.fours ?? 0));
  const c2 = Number(isSixes ? (t2.sixes ?? ld.team2?.sixes ?? 0) : (t2.fours ?? ld.team2?.fours ?? 0));

  const t1Name = String(t1.name || t1.shortName || 'team1').toLowerCase();
  const t2Name = String(t2.name || t2.shortName || 'team2').toLowerCase();

  const isT1Selected = selectionId.includes('t1') || selectionName.includes(t1Name) || selectionId === '1';
  const isT2Selected = selectionId.includes('t2') || selectionName.includes(t2Name) || selectionId === '2';
  const isTieSelected = selectionId.includes('tie') || selectionName.includes('tie') || selectionId.includes('draw');

  if (c1 > c2) {
    return { outcome: isT1Selected ? 'WON' : 'LOST', reason: `most_boundaries_t1=${c1}_t2=${c2}` };
  }
  if (c2 > c1) {
    return { outcome: isT2Selected ? 'WON' : 'LOST', reason: `most_boundaries_t1=${c1}_t2=${c2}` };
  }
  // c1 === c2: if Tie selection was placed -> WON; if 2-way market with no tie option -> VOID (Push)
  if (isTieSelected) {
    return { outcome: 'WON', reason: `most_boundaries_tie=${c1}` };
  }
  return { outcome: 'VOID', reason: `most_boundaries_push_tie=${c1}` };
}

/** Settle Total Match Sixes, Fours, Wickets, and Run Range */
export function evaluateMatchAggregateBet(bet, match) {
  const market = String(bet.market_id || '').toLowerCase();
  const selectionId = String(bet.selection_id || '');
  const selectionName = String(bet.selection_name || '');

  const t1 = match?.team1 || {};
  const t2 = match?.team2 || {};
  const ld = match?.liveDetails || {};

  if (market.startsWith('total_match_sixes') || market.startsWith('total_match_fours') || market.startsWith('total_match_wickets')) {
    const line = parseOuLine(selectionName, selectionId);
    if (line == null) return null;

    let aggregate = 0;
    if (market.startsWith('total_match_sixes')) {
      aggregate = Number(t1.sixes ?? ld.team1?.sixes ?? 0) + Number(t2.sixes ?? ld.team2?.sixes ?? 0);
    } else if (market.startsWith('total_match_fours')) {
      aggregate = Number(t1.fours ?? ld.team1?.fours ?? 0) + Number(t2.fours ?? ld.team2?.fours ?? 0);
    } else if (market.startsWith('total_match_wickets')) {
      aggregate = Number(t1.wickets ?? ld.team1?.wickets ?? 0) + Number(t2.wickets ?? ld.team2?.wickets ?? 0);
    }

    if (!isMatchFinal(match)) {
      if (isUnderSelection(selectionId, selectionName) && aggregate > line) {
        return { outcome: 'LOST', reason: `match_agg_under_crossed agg=${aggregate}_line=${line}` };
      }
      if (isOverSelection(selectionId, selectionName) && aggregate > line) {
        return { outcome: 'WON', reason: `match_agg_over_hit agg=${aggregate}_line=${line}` };
      }
      return null;
    }

    if (isOverSelection(selectionId, selectionName)) {
      return { outcome: aggregate > line ? 'WON' : 'LOST', reason: `match_agg_final=${aggregate}_line=${line}` };
    }
    if (isUnderSelection(selectionId, selectionName)) {
      return { outcome: aggregate < line ? 'WON' : 'LOST', reason: `match_agg_final=${aggregate}_line=${line}` };
    }
    return null;
  }

  if (market.startsWith('match_run_range')) {
    if (!isMatchFinal(match)) return null;
    const totalRuns = (Number(t1.runs) || 0) + (Number(t2.runs) || 0) || (Number(ld.firstRuns) || 0) + (Number(ld.chaseRuns) || 0);
    const rangeMatch = selectionName.match(/(\d+)\s*[-–]\s*(\d+)/) || selectionId.match(/(\d+)_(\d+)/);
    const plusMatch = selectionName.match(/(\d+)\+/) || selectionId.match(/(\d+)_plus/);

    if (rangeMatch) {
      const min = parseInt(rangeMatch[1], 10);
      const max = parseInt(rangeMatch[2], 10);
      const inRange = totalRuns >= min && totalRuns <= max;
      return { outcome: inRange ? 'WON' : 'LOST', reason: `run_range_${min}_${max}_actual=${totalRuns}` };
    }
    if (plusMatch) {
      const min = parseInt(plusMatch[1], 10);
      return { outcome: totalRuns >= min ? 'WON' : 'LOST', reason: `run_range_${min}plus_actual=${totalRuns}` };
    }
  }

  return null;
}

/** Settle Tie, Double Chance, and BTTS Score X */
export function evaluateSpecialMatchBet(bet, match) {
  if (!isMatchFinal(match)) return null;
  const market = String(bet.market_id || '').toLowerCase();
  const selectionId = String(bet.selection_id || '').toLowerCase();
  const selectionName = String(bet.selection_name || '').toLowerCase();
  const sport = String(match?.sport || '').toLowerCase();
  if (
    market.includes('double_chance')
    && (sport === 'soccer' || sport === 'football' || sport === 'esoccer')
  ) {
    return evaluateSoccerResultBet(bet, match);
  }

  const t1 = match?.team1 || {};
  const t2 = match?.team2 || {};
  const ld = match?.liveDetails || {};
  const r1 = Number(t1.runs ?? ld.firstRuns ?? 0);
  const r2 = Number(t2.runs ?? ld.chaseRuns ?? 0);

  const t1Name = String(t1.name || 'team1').toLowerCase();
  const t2Name = String(t2.name || 'team2').toLowerCase();
  const isTie = r1 === r2 || String(match.winner || match.winnerSide || '').toUpperCase() === 'TIE';
  const winnerSide = String(match.winnerSide || (r1 > r2 ? 'home' : (r2 > r1 ? 'away' : 'tie'))).toLowerCase();

  if (market.includes('will_there_be_a_tie')) {
    const isYes = selectionId.includes('yes') || selectionName.includes('yes');
    return { outcome: (isYes && isTie) || (!isYes && !isTie) ? 'WON' : 'LOST', reason: `tie_result_isTie=${isTie}` };
  }

  if (market.includes('double_chance')) {
    const is1X = selectionId.includes('1x') || selectionName.includes(`${t1Name} or tie`) || selectionName.includes('draw');
    const is2X = selectionId.includes('2x') || selectionId.includes('x2') || selectionName.includes(`${t2Name} or tie`);
    const is12 = selectionId.includes('12') || selectionName.includes(`${t1Name} or ${t2Name}`);

    if (is1X) return { outcome: winnerSide === 'home' || isTie ? 'WON' : 'LOST', reason: `dc_1x_winner=${winnerSide}` };
    if (is2X) return { outcome: winnerSide === 'away' || isTie ? 'WON' : 'LOST', reason: `dc_2x_winner=${winnerSide}` };
    if (is12) return { outcome: winnerSide === 'home' || winnerSide === 'away' ? 'WON' : 'LOST', reason: `dc_12_winner=${winnerSide}` };
  }

  if (market.includes('btts_score_')) {
    const threshold = market.match(/btts_score_(\d+)/) ? parseInt(market.match(/btts_score_(\d+)/)[1], 10) : 150;
    const bothReached = r1 >= threshold && r2 >= threshold;
    const isYes = selectionId.includes('yes') || selectionName.includes('yes');
    return { outcome: (isYes && bothReached) || (!isYes && !bothReached) ? 'WON' : 'LOST', reason: `btts_${threshold}_r1=${r1}_r2=${r2}` };
  }

  return null;
}

/** Settle Over Odd / Even Total Runs */
export async function evaluateOverOddEvenBet(bet, match) {
  const market = String(bet.market_id || '').toLowerCase();
  const selectionId = String(bet.selection_id || '').toLowerCase();
  const selectionName = String(bet.selection_name || '').toLowerCase();

  const overMatch = market.match(/(?:current|next)_over_(\d+)_odd_even/);
  if (!overMatch) return null;
  const targetOver = parseInt(overMatch[1], 10);

  let runsInOver = null;
  if (Array.isArray(match?.overs)) {
    const oObj = match.overs.find((o) => Number(o.over || o.overNumber) === targetOver);
    if (oObj != null) runsInOver = Number(oObj.runs ?? oObj.score);
  } else if (Array.isArray(match?.liveDetails?.overs)) {
    const oObj = match.liveDetails.overs.find((o) => Number(o.over || o.overNumber) === targetOver);
    if (oObj != null) runsInOver = Number(oObj.runs ?? oObj.score);
  }

  if (runsInOver == null && (match?.matchId || match?.id)) {
    try {
      runsInOver = await getRunsInOver(match.matchId || match.id, targetOver);
    } catch {
      // fallback
    }
  }

  if (runsInOver == null) {
    if (isMatchFinal(match)) {
      return { outcome: 'VOID', reason: `over_${targetOver}_never_bowled_match_over` };
    }
    return null;
  }

  const isOdd = runsInOver % 2 !== 0;
  const isSelectedOdd = selectionId.includes('odd') || selectionName.includes('odd');

  return {
    outcome: (isSelectedOdd && isOdd) || (!isSelectedOdd && !isOdd) ? 'WON' : 'LOST',
    reason: `over_${targetOver}_odd_even_runs=${runsInOver}_isOdd=${isOdd}`,
  };
}

/** Settle Method of Next Wicket (Caught, Bowled, LBW, Run Out, Stumped/Other) */
export function evaluateMethodOfDismissalBet(bet, match) {
  const market = String(bet.market_id || '').toLowerCase();
  const selectionId = String(bet.selection_id || '').toLowerCase();
  const selectionName = String(bet.selection_name || '').toLowerCase();

  const wktMatch = market.match(/method_of_next_wicket_(\d+)/);
  if (!wktMatch) return null;
  const targetWkt = parseInt(wktMatch[1], 10);

  const bat = getBattingOversAndScore(match);
  const currentWickets = Number(bat.wickets || 0);

  if (currentWickets < targetWkt) {
    if (isMatchFinal(match)) {
      return { outcome: 'VOID', reason: `wicket_${targetWkt}_never_fell_match_over` };
    }
    return null;
  }

  const scoreAtDismissal = getScoreAtDismissal(match, targetWkt);
  const wicketType = String(scoreAtDismissal?.wicketType || scoreAtDismissal?.type || 'caught').toLowerCase();

  const isCaught = selectionId.includes('caught') || selectionName.includes('caught');
  const isBowled = selectionId.includes('bowled') || selectionName.includes('bowled');
  const isLBW = selectionId.includes('lbw') || selectionName.includes('lbw');
  const isRunOut = selectionId.includes('runout') || selectionName.includes('run out');
  const isOther = selectionId.includes('other') || selectionName.includes('other') || selectionName.includes('stumped');

  let won = false;
  if (isCaught && wicketType.includes('caught')) won = true;
  else if (isBowled && wicketType.includes('bowled')) won = true;
  else if (isLBW && wicketType.includes('lbw')) won = true;
  else if (isRunOut && wicketType.includes('run')) won = true;
  else if (isOther && !wicketType.includes('caught') && !wicketType.includes('bowled') && !wicketType.includes('lbw') && !wicketType.includes('run')) won = true;

  return {
    outcome: won ? 'WON' : 'LOST',
    reason: `dismissal_${targetWkt}_method=${wicketType}`,
  };
}

/** Settle Team Top Batter (with Dead Heat / Tied High Score support) */
export function evaluateTopBatterBet(bet, match) {
  const bat = getBattingOversAndScore(match);
  const ld = match?.liveDetails || {};
  const isFirstInnComplete = isInningsComplete(match, 1, bat, ld);
  const isSecondInnComplete = isInningsComplete(match, 2, bat, ld) || isMatchFinal(match);

  const market = String(bet.market_id || '').toLowerCase();
  const inningsScoped = market.match(/^i([12])_/);
  const inn = inningsScoped ? Number(inningsScoped[1]) : 1;

  if (inn === 1 && !isFirstInnComplete) return null;
  if (inn === 2 && !isSecondInnComplete) return null;

  const teamKey = inn === 1 ? 'team1' : 'team2';
  const batters = match?.[teamKey]?.batters || ld?.[teamKey]?.batters || [];
  if (!Array.isArray(batters) || batters.length === 0) {
    if (isMatchFinal(match)) return { outcome: 'VOID', reason: 'top_batter_scorecard_unavailable' };
    return null;
  }

  const maxRuns = Math.max(...batters.map((b) => Number(b.runs || 0)));
  if (!Number.isFinite(maxRuns) || maxRuns < 0) {
    if (isMatchFinal(match)) return { outcome: 'VOID', reason: 'top_batter_scorecard_invalid' };
    return null;
  }

  const topBatters = batters.filter((b) => Number(b.runs || 0) === maxRuns);
  const selectionName = String(bet.selection_name || bet.selection_id || '').toLowerCase();
  const won = topBatters.some((b) => {
    const name = String(b.name || b.player || '').toLowerCase();
    return name && (selectionName.includes(name) || name.includes(selectionName));
  });

  const deadHeatCount = topBatters.length;
  const winnerNames = topBatters.map((b) => b.name || b.player).join('/');

  return {
    outcome: won ? 'WON' : 'LOST',
    reason: `top_batter_${winnerNames}_runs=${maxRuns}${deadHeatCount > 1 ? `_deadHeat=${deadHeatCount}` : ''}`,
    deadHeatCount,
  };
}

/** Settle Batter Head-To-Head Runs and Sixes (with 3-way Tie and 2-way Push semantics) */
export function evaluateBatterH2HBet(bet, match) {
  if (!isMatchFinal(match)) return null;
  const market = String(bet.market_id || '').toLowerCase();
  const selectionId = String(bet.selection_id || '').toLowerCase();
  const selectionName = String(bet.selection_name || '').toLowerCase();

  const isSixes = market.includes('sixes');
  const b1 = match?.batter1 || match?.liveDetails?.batter1 || {};
  const b2 = match?.batter2 || match?.liveDetails?.batter2 || {};

  const b1Metric = Number(isSixes ? (b1.sixes ?? 0) : (b1.runs ?? 0));
  const b2Metric = Number(isSixes ? (b2.sixes ?? 0) : (b2.runs ?? 0));

  const b1Name = String(b1.name || 'batter1').toLowerCase();
  const b2Name = String(b2.name || 'batter2').toLowerCase();

  const isB1Selected = selectionId.includes('b1') || selectionName.includes(b1Name);
  const isB2Selected = selectionId.includes('b2') || selectionName.includes(b2Name);
  const isTieSelected = selectionId.includes('tie') || selectionName.includes('tie');

  if (b1Metric > b2Metric) {
    return { outcome: isB1Selected ? 'WON' : 'LOST', reason: `batter_h2h_b1=${b1Metric}_b2=${b2Metric}` };
  }
  if (b2Metric > b1Metric) {
    return { outcome: isB2Selected ? 'WON' : 'LOST', reason: `batter_h2h_b1=${b1Metric}_b2=${b2Metric}` };
  }
  // Metric is tied (b1Metric === b2Metric)
  if (isTieSelected) {
    return { outcome: 'WON', reason: `batter_h2h_tie=${b1Metric}` };
  }
  // If 2-way market with no tie option was offered, standard rule is PUSH / VOID
  return { outcome: 'VOID', reason: `batter_h2h_push_tie=${b1Metric}` };
}

function readFtScores(match) {
  const ld = match?.liveDetails || {};
  const score1 = Number(match?.score1 ?? ld.score1 ?? match?.team1?.score ?? match?.team1?.runs ?? 0);
  const score2 = Number(match?.score2 ?? ld.score2 ?? match?.team2?.score ?? match?.team2?.runs ?? 0);
  return { score1, score2, ld };
}

function asSetList(value) {
  if (Array.isArray(value) && value.length > 0) {
    return value.map((v) => Number(v?.value ?? v)).filter((n) => Number.isFinite(n));
  }
  const n = Number(value);
  return Number.isFinite(n) ? [n] : [];
}

function soccerFtResult(score1, score2) {
  if (score1 > score2) return '1';
  if (score2 > score1) return '2';
  return 'X';
}

/** Soccer double chance and draw-no-bet from full-time scores. */
export function evaluateSoccerResultBet(bet, match) {
  if (!isMatchFinal(match)) return null;
  const market = String(bet.market_id || '').toLowerCase();
  const selectionId = String(bet.selection_id || '');
  const { score1, score2 } = readFtScores(match);
  const result = soccerFtResult(score1, score2);

  if (market === 'double_chance' || market.includes('double_chance')) {
    const id = selectionId.toUpperCase();
    if (id.includes('1X') || /dc:1x/i.test(selectionId)) {
      return { outcome: result === '1' || result === 'X' ? 'WON' : 'LOST', reason: `soccer_dc_1x_${score1}-${score2}` };
    }
    if (id.includes('X2') || id.includes('2X') || /dc:x2|dc:2x/i.test(selectionId)) {
      return { outcome: result === '2' || result === 'X' ? 'WON' : 'LOST', reason: `soccer_dc_x2_${score1}-${score2}` };
    }
    if (id.includes('12') || /dc:12/i.test(selectionId)) {
      return { outcome: result !== 'X' ? 'WON' : 'LOST', reason: `soccer_dc_12_${score1}-${score2}` };
    }
    return null;
  }

  if (market === 'dnb') {
    if (result === 'X') {
      return { outcome: 'VOID', reason: `soccer_dnb_draw_${score1}-${score2}` };
    }
    const wantHome = /DNB:1/i.test(selectionId) || selectionId === '1';
    const wantAway = /DNB:2/i.test(selectionId) || selectionId === '2';
    if (wantHome && !wantAway) {
      return { outcome: result === '1' ? 'WON' : 'LOST', reason: `soccer_dnb_1_${score1}-${score2}` };
    }
    if (wantAway) {
      return { outcome: result === '2' ? 'WON' : 'LOST', reason: `soccer_dnb_2_${score1}-${score2}` };
    }
  }

  return null;
}

export function evaluateScoreSpreadBet(bet, match) {
  if (!isMatchFinal(match)) return null;
  const { score1, score2 } = readFtScores(match);
  const text = `${bet.selection_id || ''} ${bet.selection_name || ''}`;
  const parsed = text.match(/Spread:([12])\s*([+-]\d+(?:\.\d+)?)/i);
  if (!parsed) return null;
  const side = parsed[1];
  const handicap = Number(parsed[2]);
  if (!Number.isFinite(handicap)) return null;
  const covered = side === '1'
    ? (score1 + handicap) - score2
    : (score2 + handicap) - score1;
  if (covered === 0) {
    return { outcome: 'VOID', reason: `spread_push_${score1}-${score2}_h=${handicap}` };
  }
  return { outcome: covered > 0 ? 'WON' : 'LOST', reason: `spread_${score1}-${score2}_h=${handicap}` };
}

export function evaluateScoreTotalBet(bet, match) {
  if (!isMatchFinal(match)) return null;
  const selectionId = String(bet.selection_id || '');
  const selectionName = String(bet.selection_name || '');
  const line = parseOuLine(selectionName, selectionId);
  if (line == null) return null;
  const market = String(bet.market_id || '').toLowerCase();
  const { score1, score2, ld } = readFtScores(match);
  let total = score1 + score2;

  if (market === 'total_games' || market === 'total_points') {
    const a = asSetList(ld.sets1);
    const b = asSetList(ld.sets2);
    if (a.length && b.length) {
      total = a.reduce((acc, v) => acc + v, 0) + b.reduce((acc, v) => acc + v, 0);
    }
  }
  if (market === 'total_sets') {
    const a = asSetList(ld.sets1);
    const b = asSetList(ld.sets2);
    if (a.length && b.length) {
      let w1 = 0;
      let w2 = 0;
      const n = Math.min(a.length, b.length);
      for (let i = 0; i < n; i += 1) {
        if (a[i] === b[i]) continue;
        if (a[i] > b[i]) w1 += 1;
        else w2 += 1;
      }
      total = w1 + w2;
    }
  }

  if (isOverSelection(selectionId, selectionName)) {
    return { outcome: total > line ? 'WON' : 'LOST', reason: `score_total=${total}_line=${line}` };
  }
  if (isUnderSelection(selectionId, selectionName)) {
    return { outcome: total < line ? 'WON' : 'LOST', reason: `score_total=${total}_line=${line}` };
  }
  return null;
}

export function evaluateSetWinnerBet(bet, match) {
  if (!isMatchFinal(match)) return null;
  const { ld } = readFtScores(match);
  const a = asSetList(ld.sets1);
  const b = asSetList(ld.sets2);
  if (!a.length || !b.length) {
    return { outcome: 'VOID', reason: 'set_scores_missing' };
  }
  const g1 = a[0];
  const g2 = b[0];
  if (g1 === g2) {
    return { outcome: 'VOID', reason: 'set1_tie' };
  }
  const winner = g1 > g2 ? '1' : '2';
  const selectionId = String(bet.selection_id || '');
  const wantHome = /Set1:1|:1$|^1$/i.test(selectionId);
  const wantAway = /Set1:2|:2$|^2$/i.test(selectionId);
  if (wantHome && !wantAway) {
    return { outcome: winner === '1' ? 'WON' : 'LOST', reason: `set1_${g1}-${g2}` };
  }
  if (wantAway) {
    return { outcome: winner === '2' ? 'WON' : 'LOST', reason: `set1_${g1}-${g2}` };
  }
  return null;
}

/** Settle Soccer BTTS & Total Goals Line */
export function evaluateSoccerGoalsBet(bet, match) {
  if (!isMatchFinal(match)) return null;
  const market = String(bet.market_id || '').toLowerCase();
  const selectionId = String(bet.selection_id || '');
  const selectionName = String(bet.selection_name || '');

  const score1 = Number(match.score1 ?? match.liveDetails?.score1 ?? match.team1?.runs ?? 0);
  const score2 = Number(match.score2 ?? match.liveDetails?.score2 ?? match.team2?.runs ?? 0);

  if (market === 'btts') {
    const bothScored = score1 > 0 && score2 > 0;
    const isYes = selectionId.toLowerCase().includes('yes') || selectionName.toLowerCase().includes('yes');
    return { outcome: (isYes && bothScored) || (!isYes && !bothScored) ? 'WON' : 'LOST', reason: `soccer_btts_s1=${score1}_s2=${score2}` };
  }

  if (market === 'goals_line') {
    const line = parseOuLine(selectionName, selectionId);
    if (line == null) return null;
    const totalGoals = score1 + score2;
    if (isOverSelection(selectionId, selectionName)) {
      return { outcome: totalGoals > line ? 'WON' : 'LOST', reason: `soccer_goals_final=${totalGoals}_line=${line}` };
    }
    if (isUnderSelection(selectionId, selectionName)) {
      return { outcome: totalGoals < line ? 'WON' : 'LOST', reason: `soccer_goals_final=${totalGoals}_line=${line}` };
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

  const snap = parsePlacementSnapshot(bet);
  const snapLeg = snap?.legs?.[0];
  const market = String(bet.market_id || snapLeg?.marketId || snapLeg?.marketType || 'match_winner').toLowerCase();
  const selectionId = String(bet.selection_id || snapLeg?.selectionId || '');
  const selectionName = String(bet.selection_name || snapLeg?.selectionName || '');

  // Match winner (+ super over variants)
  if (market.includes('match_winner') || market === 'winner' || market === '1x2' || !market) {
    const winnerSide = matchState.winnerSide;
    if (!winnerSide) {
      // Insufficient evidence — do NOT VOID/refund. Keep open / AWAITING_EVIDENCE.
      return null;
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

    return null;
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
  const snap = parsePlacementSnapshot(bet);
  const snapLeg = snap?.legs?.[0];
  if (sels.length === 0) {
    return [{
      match_id: bet.match_id || snapLeg?.matchId,
      market_id: bet.market_id || snapLeg?.marketId || snapLeg?.marketType || 'match_winner',
      selection_id: bet.selection_id || snapLeg?.selectionId,
      selection_name: bet.selection_name || snapLeg?.selectionName,
    }];
  }
  return sels.map((s) => ({
    match_id: s.match_id || bet.match_id || snapLeg?.matchId,
    market_id: s.market_id || bet.market_id || snapLeg?.marketId || snapLeg?.marketType || 'match_winner',
    selection_id: s.selection_id || bet.selection_id || snapLeg?.selectionId,
    selection_name: s.selection_name || bet.selection_name || snapLeg?.selectionName,
  }));
}

export function betHasDeliveryMarket(bet) {
  const legs = normalizeBetLegs(bet);
  return legs.some((leg) => /next_delivery_/i.test(String(leg.market_id || '')));
}

export function betHasPlayerPropMarket(bet) {
  const legs = normalizeBetLegs(bet);
  return legs.some((leg) => /^player_(25|50|75|100|alt)_/i.test(String(leg.market_id || '')));
}

function matchHasPlayerScorecard(match) {
  if (!match) return false;
  const ld = match.liveDetails || {};
  if (ld.batter1?.name || ld.batter2?.name) return true;
  if ((ld.scorecardBatters || []).length > 0) return true;
  if ((match.scorecardBatters || []).length > 0) return true;
  if ((match.scorecardInnings || []).some((inn) => (inn?.batters || []).length > 0)) return true;
  return false;
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
        cricbuzzMatchId: detail.cricbuzzMatchId || enriched.cricbuzzMatchId,
      };
    }
  } catch (err) {
    console.error('[deliverySettlement] enrich', id, err.message);
  }

  try {
    // Any format / any public id (oy_, cb_, …) — lookup Cricbuzz when needed.
    const { enrichMatchWithBallFeed, matchHasBallFeed } = await import('./cricbuzzBallFeed.mjs');
    if (!matchHasBallFeed(enriched)) {
      enriched = await enrichMatchWithBallFeed(enriched);
    }
  } catch (err) {
    console.error('[deliverySettlement] ball feed', id, err.message);
  }

  deliveryDetailCache.set(id, enriched);
  return enriched;
}

/** True when the match object carries score/overs/live signals (not an empty hydration stub). */
function hasMatchLiveEvidence(match) {
  if (!match) return false;
  const ld = match.liveDetails || {};
  return Boolean(
    ld.overs || ld.firstOvers || ld.chaseOvers || ld.overs2
    || Number(ld.firstRuns) > 0 || Number(ld.chaseRuns) > 0
    || Number(ld.runs) > 0 || Number(ld.wickets) > 0
    || Number(ld.chaseWickets) > 0
    || Number(match.team1?.runs) > 0 || Number(match.team2?.runs) > 0
    || Number(match.score1) > 0 || Number(match.score2) > 0
    || match.isLive === true
    || String(match.matchState || '').toLowerCase() === 'in',
  );
}

/** Void in-play delivery markets only on explicit not-in-play signals — not missing feed data. */
function isDeliveryMarketExplicitlyVoidable(match) {
  if (!match) return false;

  const status = String(match.status || match.liveStatus || '').toUpperCase();
  if (['CANCELLED', 'ABANDONED', 'POSTPONED', 'NO_RESULT'].includes(status)) return true;
  if (/abandon|cancel|no result|washed out/i.test(String(match.result || ''))) return true;

  const state = String(match.matchState || '').toLowerCase();
  if (state === 'post' || state === 'completed') return isMatchFinal(match);

  const time = String(match.time || '').toLowerCase();
  const commentary = String(match.liveDetails?.commentary || '').toLowerCase();
  const combined = `${time} ${commentary} ${status.toLowerCase()}`;
  if (
    /scheduled|upcoming|not started|starts at|preview|kickoff tonight/.test(combined)
    || /today \d{1,2}:\d{2}/.test(time)
    || /\d{1,2} \w{3} - \d{1,2}:\d{2}/.test(time)
  ) {
    return !hasMatchLiveEvidence(match);
  }

  return false;
}

function trySettlePassedDeliveryBet(bet, match, overNum, ballNum, slot, confirmedEvent = null) {
  const ballOutcome = confirmedEvent?.parsed
    ?? resolveDeliveryBallFromMatch(match, overNum, ballNum);
  if (confirmedEvent && !confirmedEvent.isConfirmed) return null;
  const graded = gradeDeliveryMarketBet(bet, ballOutcome);
  if (graded) return graded;
  // No authoritative ball outcome — stay PENDING (even if match is final).
  return null;
}

/** In-play / ungradeable markets once the fixture is over or gone from the book. */
export function evaluateBetAfterMatchOver(bet) {
  const market = String(bet.market_id || '');
  if (/next_delivery_|method_of_next_wicket|odd_even|current_over_/i.test(market)) {
    return { outcome: 'VOID', reason: 'in_play_market_match_over' };
  }
  // Wicket-in-over: only void when the over itself never completed (grader handles never_bowled).
  if (/wicket_in_(?:next_)?over_/i.test(market)) {
    return { outcome: 'VOID', reason: 'wicket_in_over_never_bowled_match_over' };
  }
  // Score-at-Nth-wicket: if match is over and grader never saw that dismissal, void.
  if (/team_score_at_\d+_dismissal/i.test(market)) {
    return { outcome: 'VOID', reason: 'dismissal_never_occurred_match_over' };
  }
  // next_over totals: never invent runs; void if over could not have been bowled.
  if (/next_over_\d+_total/i.test(market)) {
    return { outcome: 'VOID', reason: 'over_never_bowled_match_over' };
  }
  if (/match_winner|winner|1x2/i.test(market)) {
    // Winner unknown / missing evidence — await recovery, do not auto-VOID.
    return null;
  }
  if (/team_total|match_total|overs_0_/i.test(market)) {
    return null;
  }
  // Player props: grader handles WON/LOST/DNB VOID; never auto-void here
  // (scorecard may still hydrate via recovery).
  if (/^player_(25|50|75|100|alt)_/i.test(market)) {
    return null;
  }
  return null;
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
    return null;
  }

  if (!isInPlayMatch(match)) {
    if (hasMatchLiveEvidence(match)) {
      const bat = getBattingOversAndScore(match);
      const inningsPassed = marketInn != null && bat.innings > marketInn;
      if (inningsPassed) {
        return trySettlePassedDeliveryBet(bet, match, overNum, ballNum, { overNum: overNum + 1, ballNum: 1 });
      }
      return null;
    }
    if (isDeliveryMarketExplicitlyVoidable(match)) {
      return { outcome: 'VOID', reason: 'delivery_not_in_play' };
    }
    return null;
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
    const settled = trySettlePassedDeliveryBet(bet, match, overNum, ballNum, slot);
    if (settled) return settled;
    // Innings finished without this delivery ever being bowled → VOID
    const settleInn = marketInn ?? bat.innings;
    if (inningsPassed || isInningsComplete(match, settleInn, bat)) {
      return {
        outcome: 'VOID',
        reason: `delivery_${overNum}_${ballNum}_i${settleInn}_never_bowled`,
      };
    }
    return null;
  }
  return null;
}

/** Re-evaluate after hydrating commentary when live feed lacks overHistory. */
export async function evaluateDeliveryMarketBetAsync(bet, match, matchId) {
  const first = evaluateDeliveryMarketBet(bet, match);
  if (first) return first;

  const hit = String(bet.market_id || '').match(/^(?:i(\d+)_)?next_delivery_[a-z]+_(\d+)_(\d+)$/i);
  if (!hit || !match) return null;

  const marketInn = hit[1] != null ? Number(hit[1]) : null;
  const overNum = Number(hit[2]);
  const ballNum = Number(hit[3]);
  const id = String(matchId || match.id || match.matchId || '');
  const queryInn = marketInn ?? getBattingOversAndScore(match).innings ?? 1;

  // Snapshot proves the over finished even when live overs string is missing.
  const overSnapDone = (await getRunsInOver(id, overNum, queryInn)) != null
    || (await getWicketsInOver(id, overNum, queryInn)) != null;

  const bat = getBattingOversAndScore(match);
  const oversStr = bat.oversStr || match.liveDetails?.overs;
  let ballPassed = overSnapDone;
  let slot = { overNum: overNum + 1, ballNum: 1 };

  if (oversStr != null && String(oversStr).trim() !== '') {
    const format = resolveCricketFormat(match);
    const rules = getFormatRules(format) || getFormatRules('T20');
    const ballsCompleted = oversToBallsForMatch(oversStr, match);
    slot = nextBallSlot(ballsCompleted, rules.ballsPerOver || 6);
    ballPassed = ballPassed
      || slot.overNum > overNum
      || (slot.overNum === overNum && slot.ballNum > ballNum);
  }

  if (!ballPassed) return null;

  const confirmed = await getConfirmedBallEvent(id, queryInn, overNum, ballNum);
  if (confirmed?.isConfirmed) {
    const settled = trySettlePassedDeliveryBet(bet, match, overNum, ballNum, slot, confirmed);
    if (settled) return settled;
  }

  const enriched = await enrichMatchForDeliverySettlement(match, matchId);
  const second = evaluateDeliveryMarketBet(bet, enriched);
  if (second) return second;

  // Provider confirmed scorecard-only — refund once the over is done.
  // Do NOT void on hasBallFeed===false alone (transient fetch failures).
  if (
    (enriched?.scorecardOnly || match?.scorecardOnly)
    && (overSnapDone || isTargetOverComplete(enriched || match, overNum))
  ) {
    return {
      outcome: 'VOID',
      reason: 'delivery_scorecard_only_no_ball_feed',
    };
  }

  // Over containing this ball is done, but provider never gave ball-by-ball —
  // cannot invent a result; VOID so the stake is not stuck forever.
  if (overSnapDone || isTargetOverComplete(enriched || match, overNum)) {
    return {
      outcome: 'VOID',
      reason: 'delivery_no_ball_evidence_after_over_complete',
    };
  }
  return null;
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

  if (grader === 'teamBoundaryMarket') {
    return evaluateTeamBoundaryMarketBet(betRow, match);
  }
  if (grader === 'mostBoundariesMarket') {
    return evaluateMostBoundariesBet(betRow, match);
  }
  if (grader === 'matchAggregateMarket') {
    return evaluateMatchAggregateBet(betRow, match);
  }
  if (grader === 'specialMatchMarket') {
    return evaluateSpecialMatchBet(betRow, match);
  }
  if (grader === 'overOddEvenMarket') {
    return evaluateOverOddEvenBet(betRow, match);
  }
  if (grader === 'methodOfDismissalMarket') {
    return evaluateMethodOfDismissalBet(betRow, match, matchId);
  }
  if (grader === 'topBatterMarket') {
    return evaluateTopBatterBet(betRow, match);
  }
  if (grader === 'batterH2HMarket') {
    return evaluateBatterH2HBet(betRow, match);
  }
  if (grader === 'soccerGoalsMarket') {
    return evaluateSoccerGoalsBet(betRow, match);
  }
  if (grader === 'soccerChanceMarket') {
    return evaluateSoccerResultBet(betRow, match);
  }
  if (grader === 'scoreSpreadMarket') {
    return evaluateScoreSpreadBet(betRow, match);
  }
  if (grader === 'scoreTotalMarket') {
    return evaluateScoreTotalBet(betRow, match);
  }
  if (grader === 'setWinnerMarket') {
    return evaluateSetWinnerBet(betRow, match);
  }
  if (grader === 'overMarket') {
    return evaluateOverMarketBet(betRow, match);
  }
  if (grader === 'deliveryMarket') {
    return evaluateDeliveryMarketBetAsync(betRow, match, matchId || betRow.match_id);
  }
  if (grader === 'dismissalMarket') {
    return evaluateDismissalMarketBet(betRow, match);
  }
  if (grader === 'wicketInOverMarket') {
    return evaluateWicketInOverMarketBet(betRow, match);
  }
  if (grader === 'totalsMarket') {
    return evaluateTotalsMarketBet(betRow, match);
  }
  if (grader === 'playerPropMarket') {
    return evaluatePlayerPropMarketBet(betRow, match);
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
  const isFinal = isMatchFinal(match);
  const enriched = enrichMatchWithCanonicalState({
    ...match,
    status: isFinal ? 'COMPLETED' : (match.status || 'LIVE'),
    matchState: isFinal ? 'post' : (match.matchState || 'in'),
    isCompleted: isFinal,
    isLive: !isFinal,
  });
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

  const betsRes = await dbQuery(
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
    // Full sweeps refresh the feed; per-match settlement uses cache to avoid OOM on the API server.
    let snap = await aggregateLiveScores({ force: !matchId });
    if (!snap?.matches?.length) {
      snap = await aggregateLiveScores({ force: true });
    }
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

  // Hydrate open-bet matches missing from the live list using multi-tier lookup engine
  const { lookupEventForSettlement, logSettlementEventLookup } = await import('./settlement/settlementEventLookup.mjs');
  for (const bet of betsRes.rows) {
    const id = String(bet.match_id || '');
    if (!id || lookupMatch(liveById, id)) continue;
    try {
      const lookupResult = await lookupEventForSettlement({
        bet,
        liveById,
        byId,
      });

      logSettlementEventLookup({
        betId: bet.bet_id,
        eventId: bet.match_id,
        providerEventId: bet.provider_event_id,
        lookupSource: lookupResult.lookupSource,
        lookupResult: lookupResult.lookupResult,
        eventStatus: lookupResult.eventStatus,
        errorCode: lookupResult.errorCode,
        errorMessage: lookupResult.errorMessage,
      });

      if (lookupResult.success && lookupResult.match) {
        indexMatch(byId, lookupResult.match);
      }
    } catch (err) {
      console.error('[liveMatchSettlement] structured hydrate error', id, err.message);
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
          await enqueueBetsForMarketInstance({
            matchId: id,
            marketInstanceKey: `WICKET_IN_OVER:I${bat.innings}:O${parts.completed}`,
            triggerEventId: `wkt_over_complete_${id}_i${bat.innings}_o${parts.completed}`,
            marketIdPattern: `%wicket_in_%over_${parts.completed}%`,
          });
        }
      } catch (err) {
        console.error('[overSnapshot]', id, err.message);
      }
    }
  }

  // Hydrate matches that need ball-by-ball history for delivery settlement
  const { matchHasBallFeed } = await import('./cricbuzzBallFeed.mjs');
  for (const bet of betsRes.rows) {
    if (!betHasDeliveryMarket(bet)) continue;
    for (const leg of normalizeBetLegs(bet)) {
      const id = String(leg.match_id || bet.match_id || '');
      if (!id) continue;
      const existing = lookupMatch(byId, id);
      // Placeholder "| |" history must not block a real ball-feed pull.
      if (existing && matchHasBallFeed(existing)) continue;
      try {
        const enriched = await enrichMatchForDeliverySettlement(existing || { id, sport: 'cricket' }, id);
        if (enriched) {
          indexMatch(byId, enriched);
          if (matchHasBallFeed(enriched)) {
            await ingestBallEventsFromMatch(enriched);
          }
        }
      } catch (err) {
        console.error('[liveMatchSettlement] delivery hydrate', id, err.message);
      }
    }
  }

  // Hydrate scorecards for player prop settlement (live strip alone misses dismissed batters)
  for (const bet of betsRes.rows) {
    if (!betHasPlayerPropMarket(bet)) continue;
    for (const leg of normalizeBetLegs(bet)) {
      const id = String(leg.match_id || bet.match_id || '');
      if (!id) continue;
      const existing = lookupMatch(byId, id);
      if (existing && matchHasPlayerScorecard(existing)
        && ((existing.scorecardInnings || []).length > 0
          || (existing.liveDetails?.scorecardBatters || []).length > 0
          || (existing.scorecardBatters || []).length > 0)) {
        continue;
      }
      try {
        const enriched = await enrichMatchForDeliverySettlement(existing || { id, sport: 'cricket' }, id);
        if (enriched) indexMatch(byId, enriched);
      } catch (err) {
        console.error('[liveMatchSettlement] player-prop hydrate', id, err.message);
      }
    }
  }

  const matchLookup = (matchId) => lookupMatch(byId, matchId) || lookupMatch(liveById, matchId);

  let settled = 0;
  let skipped = 0;
  let errors = 0;
  const details = [];

  for (const bet of betsRes.rows) {
    try {
      const inLiveList = lookupMatch(liveById, bet.match_id);
      const hydrated = lookupMatch(byId, bet.match_id);
      const match = inLiveList || hydrated;

      const betRow = { ...bet, selection_name: bet.selection_name };
      let evaluated = null;
      const market = String(bet.market_id || '');

      if (matchLookup(bet.match_id)) {
        evaluated = await evaluateBetForSettlement(betRow, matchLookup);
      }

      // Snapshot-backed markets (wicket-in-over / next-over totals / dismissal score) can settle from DB
      // even when the fixture has dropped off the live ticker.
      if (!evaluated && /wicket_in_(?:next_)?over_/i.test(market)) {
        evaluated = await evaluateWicketInOverMarketBet(betRow, match || { id: bet.match_id, matchId: bet.match_id });
      }
      if (!evaluated && /(?:next_over_|overs_0_)/i.test(market)) {
        evaluated = await evaluateOverMarketBet(betRow, match || { id: bet.match_id, matchId: bet.match_id });
      }
      if (!evaluated && /team_score_at_\d+_dismissal/i.test(market)) {
        evaluated = await evaluateDismissalMarketBet(betRow, match || { id: bet.match_id, matchId: bet.match_id });
      }
      if (!evaluated && /^player_(25|50|75|100|alt)_/i.test(market)) {
        evaluated = evaluatePlayerPropMarketBet(betRow, match || { id: bet.match_id, matchId: bet.match_id });
      }

      const finalSource = (inLiveList && isMatchFinal(inLiveList))
        ? inLiveList
        : (!inLiveList && hydrated && isMatchFinal(hydrated) ? hydrated : null);

      if (!evaluated && finalSource) {
        const canonicalFinal = enrichMatchWithCanonicalState(finalSource);
        const matchState = buildSettlementMatchState(canonicalFinal);
        evaluated = evaluateOpenBetOutcome(betRow, matchState);
        if (!evaluated && /next_delivery_/i.test(market)) {
          evaluated = await evaluateDeliveryMarketBetAsync(betRow, canonicalFinal, bet.match_id);
        }
        if (!evaluated && hasFinalResultWithoutBallFeed(canonicalFinal)) {
          evaluated = evaluateOpenBetOutcome(betRow, matchState)
            || evaluateBetAfterMatchOver(betRow);
        } else if (!evaluated && isAuthoritativeMatchFinal(canonicalFinal)) {
          evaluated = evaluateBetAfterMatchOver(betRow);
        }
      }

      // Delivery markets: if over is complete in snapshots but still no live match row,
      // try async delivery grading / VOID ungradeable.
      if (!evaluated && /next_delivery_/i.test(market)) {
        evaluated = await evaluateDeliveryMarketBetAsync(
          betRow,
          match || { id: bet.match_id, matchId: bet.match_id, sport: 'cricket' },
          bet.match_id,
        );
      }

      // Do not void merely because a fixture dropped off the live ticker.
      // In-play micro markets void only when we have reliable live/final state above.
      // Ungradeable open bets stay ACCEPTED until the match is confirmed final or hydrated.

      if (!evaluated) {
        skipped++;
        continue;
      }

      const candidateMatch = inLiveList || hydrated || match || { id: bet.match_id };
      const isSnapshotBacked = Boolean(
        evaluated?.hasImmutableSnapshotEvidence
        || (evaluated?.reason && /^(?:dismissal_|wicket_in_over_|next_over_|delivery_|team_total_|overs_)/.test(evaluated.reason))
      );

      const authResult = authorizeSettlement({
        match: candidateMatch,
        bet,
        marketContext: {
          marketId: bet.market_id,
          boundaryReached: Boolean(evaluated),
          hasImmutableSnapshotEvidence: isSnapshotBacked,
          snapshotReason: evaluated?.reason,
        },
        providerObservations: candidateMatch.providerObservations || [],
        evaluatedOutcome: evaluated.outcome,
        authorizedBy: 'LiveMatchSettlementWorker',
      });

      if (!authResult.success) {
        skipped++;
        details.push({
          betId: bet.bet_id,
          decision: 'BLOCKED',
          confidence: authResult.confidence?.confidenceState,
          reasons: authResult.confidence?.settlementReasonCodes || [authResult.error],
        });
        continue;
      }

      const matchState = buildSettlementMatchState(candidateMatch);
      const res = await betSettlementEngine.settleSingleBet({
        betId: bet.bet_id,
        matchState: {
          ...matchState,
          matchId: matchState.matchId || bet.match_id,
          status: 'COMPLETED',
          __forcedOutcome: evaluated.outcome,
          __settlementReason: evaluated.reason,
          __legOutcomes: evaluated.legOutcomes,
          __settlementConfidence: authResult.confidence?.confidenceState,
          __finality: authResult.confidence?.finalityState,
        },
        authorization: authResult.authorization,
      });

      // Phase 13 Calibration Observation Hook (Non-blocking telemetry)
      try {
        const { recordSettledOutcome } = await import('./odds-v3/calibration/calibrationEngine.mjs');
        recordSettledOutcome({
          eventId: bet.match_id,
          marketId: bet.market_id,
          selectionId: bet.selection_id,
          won: evaluated.outcome === 'WON',
        });
      } catch {
        // Non-fatal telemetry
      }

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
      details.push({
        betId: bet.bet_id,
        eventId: bet.match_id,
        providerEventId: bet.provider_event_id,
        error: err.message,
        errorCode: 'SETTLEMENT_BET_ERROR',
        settlementAttempt: 1,
      });
      console.error('[liveMatchSettlement] bet processing error', bet.bet_id, err.message);
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
