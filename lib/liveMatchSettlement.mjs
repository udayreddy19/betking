/**
 * Settle open bets from live-score completion (not only the empty matches table).
 */

import { query } from '../db/pg.js';
import { betSettlementEngine } from './betSettlementEngine.mjs';
import { getCachedAggregatedLiveScores } from './aggregator.mjs';
import { isCricketMatchCompleted } from '../src/utils/cricketMatchComplete.js';
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
    matchId: match.id || match.matchId,
    status: abandoned ? 'ABANDONED' : (final ? 'COMPLETED' : 'IN_PLAY'),
    winnerSide,
    winnerId: winnerSide === '1' ? 'home' : winnerSide === '2' ? 'away' : winnerSide === 'X' ? 'TIE' : null,
    homeTeam: { teamId: 'home', name: match.team1?.name, shortName: match.team1?.shortName },
    awayTeam: { teamId: 'away', name: match.team2?.name, shortName: match.team2?.shortName },
    match,
  };
}

function parseOuLine(selectionName = '', selectionId = '') {
  const fromName = String(selectionName).match(/(?:over|under)\s+(\d+(?:\.\d+)?)/i);
  if (fromName) return Number(fromName[1]);
  const fromId = String(selectionId).match(/(\d+(?:\.\d+)?)/);
  return fromId ? Number(fromId[1]) : null;
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

  const nextOver = market.match(/^next_over_(\d+)_total$/i);
  if (nextOver) {
    const overNum = Number(nextOver[1]);
    if (!isTargetOverComplete(match, overNum)) return null;

    let runs = await getRunsInOver(match.id || match.matchId, overNum);
    // Fallback: overHistory on match object
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
      // Over finished but we never captured runs — void/refund rather than leave cashout open
      return { outcome: 'VOID', reason: `over_${overNum}_runs_unknown` };
    }

    const line = parseOuLine(selectionName, selectionId) ?? 7.5;
    const tookOver = isOverSelection(selectionId, selectionName);
    const tookUnder = isUnderSelection(selectionId, selectionName);
    if (tookOver) {
      return { outcome: runs > line ? 'WON' : 'LOST', reason: `over_${overNum}_runs=${runs}_line=${line}` };
    }
    if (tookUnder) {
      return { outcome: runs < line ? 'WON' : 'LOST', reason: `over_${overNum}_runs=${runs}_line=${line}` };
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
  const hit = market.match(/^team_score_at_(\d+)_dismissal$/i);
  if (!hit) return null;

  const wicketNum = Number(hit[1]);
  const bat = getBattingOversAndScore(match);
  if ((Number(bat.wickets) || 0) < wicketNum) return null;

  let score = await getScoreAtDismissal(match.id || match.matchId, wicketNum, bat.innings);
  // Fallback: if we first see the wicket this cycle, current score is the best estimate
  if (score == null && (Number(bat.wickets) || 0) === wicketNum) {
    score = Number(bat.score) || 0;
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
      reason: `dismissal_${wicketNum}_score=${score}_line=${line}`,
    };
  }
  if (isUnderSelection(selectionId, selectionName)) {
    return {
      outcome: score < line ? 'WON' : 'LOST',
      reason: `dismissal_${wicketNum}_score=${score}_line=${line}`,
    };
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
    if (!winnerSide) return null;

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

  const matches = getCachedAggregatedLiveScores()?.matches || [];
  const byId = new Map(matches.map((m) => [String(m.id || m.matchId), m]));

  // Hydrate open-bet matches missing from the live list (finished / dropped off feed)
  for (const bet of betsRes.rows) {
    const id = String(bet.match_id || '');
    if (!id || byId.has(id)) continue;
    try {
      let detail = null;
      if (id.startsWith('10cric_')) {
        const { fetch10CricMatchById } = await import('./providers/tencricProvider.mjs');
        detail = await fetch10CricMatchById(id);
      }
      if (!detail) {
        const { fetchMatchDetail } = await import('./matchDetailFetcher.mjs');
        detail = await fetchMatchDetail({ id, matchId: id, sport: 'cricket' }, { fast: true }).catch(() => null);
      }
      if (detail) byId.set(id, detail);
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
    let match = byId.get(String(bet.match_id));
    const market = String(bet.market_id || '');
    const nextOver = market.match(/^next_over_(\d+)_total$/i);

    // Over markets: settle once that over is done — even if the fixture dropped off live feeds.
    if (nextOver) {
      const overNum = Number(nextOver[1]);
      const hasOvers = !!(match && getBattingOversAndScore(match).oversStr);
      if (!match || !hasOvers || !isTargetOverComplete(match, overNum)) {
        // Missing/stale feed after the over finished → force completion path (settle or void)
        if (!match || !hasOvers) {
          match = {
            id: bet.match_id,
            matchId: bet.match_id,
            // Do not invent chaseOvers — that flips innings detection
            liveDetails: { overs: '99.0', firstOvers: '99.0', inningsId: 1 },
            overHistory: match?.overHistory || [],
          };
        }
      }
    }

    if (!match) {
      skipped++;
      continue;
    }

    const betRow = { ...bet, selection_name: bet.selection_name };
    let evaluated = null;

    const market = String(bet.market_id || '');
    if (/^next_over_\d+_total$/i.test(market) || /^(?:i\d+_)?overs_0_\d+_total$/i.test(market)) {
      evaluated = await evaluateOverMarketBet(betRow, match);
    } else if (/^team_score_at_\d+_dismissal$/i.test(market)) {
      evaluated = await evaluateDismissalMarketBet(betRow, match);
    } else if (isMatchFinal(match)) {
      const matchState = buildSettlementMatchState(match);
      evaluated = evaluateOpenBetOutcome(betRow, matchState);
    }

    if (!evaluated) {
      skipped++;
      continue;
    }

    try {
      const matchState = buildSettlementMatchState(match);
      const res = await betSettlementEngine.settleSingleBet({
        betId: bet.bet_id,
        matchState: {
          ...matchState,
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
