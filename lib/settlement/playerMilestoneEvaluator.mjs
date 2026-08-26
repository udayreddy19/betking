/**
 * Grade player milestone / alt-runs markets:
 *   player_25_{slug}, player_50_{slug}, player_100_{slug}
 *   player_alt_{slug}  (Over/Under X.5)
 *
 * Rules:
 * - Yes/Over settles as soon as runs prove the outcome
 * - No/Under settles when the batter is finished below the target/line
 *   (dismissed, or innings/match complete while still not out)
 * - Did not bat when innings/match is done → VOID
 */

import { getBattingOversAndScore } from '../matchOverSnapshotStore.mjs';
import { isInningsComplete, isMatchFinalStatus } from './inningsCompletion.mjs';
import { resolveSettlementLine, getPrimaryLegContext } from './placementContext.mjs';
import { parseOuLine as parseLineFromText } from '../odds-v3/lineIdentity.mjs';
import { logSettlement } from './settlementAudit.mjs';

export function slugifyPlayerName(name = '') {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function parsePlayerPropMarket(marketId = '') {
  const id = String(marketId || '');
  const milestone = id.match(/^player_(25|50|75|100)_(.+)$/i);
  if (milestone) {
    return {
      kind: 'MILESTONE',
      target: Number(milestone[1]),
      playerSlug: milestone[2].toLowerCase(),
      marketType: `PLAYER_SCORE_${milestone[1]}`,
    };
  }
  const alt = id.match(/^player_alt_(.+)$/i);
  if (alt) {
    return {
      kind: 'ALT_RUNS',
      target: null,
      playerSlug: alt[1].toLowerCase(),
      marketType: 'PLAYER_RUNS_ALT',
    };
  }
  return null;
}

function normalizePlayerKey(name = '') {
  return String(name)
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function playerNameMatches(candidate, slugOrName) {
  if (!candidate || !slugOrName) return false;
  const candSlug = slugifyPlayerName(candidate);
  const targetSlug = slugifyPlayerName(slugOrName);
  if (!candSlug || !targetSlug) return false;
  if (candSlug === targetSlug) return true;
  if (candSlug.includes(targetSlug) || targetSlug.includes(candSlug)) return true;

  const candParts = normalizePlayerKey(candidate).split(' ').filter(Boolean);
  const targetParts = normalizePlayerKey(slugOrName.replace(/_/g, ' ')).split(' ').filter(Boolean);
  if (!candParts.length || !targetParts.length) return false;

  // "A Hales" ↔ "Alex Hales" / alex_hales
  const candLast = candParts[candParts.length - 1];
  const targetLast = targetParts[targetParts.length - 1];
  if (candLast && targetLast && candLast === targetLast) {
    if (candParts.length === 1 || targetParts.length === 1) return true;
    const candFirst = candParts[0];
    const targetFirst = targetParts[0];
    if (candFirst[0] === targetFirst[0]) return true;
  }
  return false;
}

function isBatterFinished(row) {
  if (!row) return false;
  if (row.notOut === true) return false;
  if (row.notOut === false) return true;
  const dismissal = String(row.dismissal || row.outDesc || '').trim();
  if (!dismissal) return false;
  if (/^(batting|not out|dnb|did not bat)$/i.test(dismissal)) return false;
  return true;
}

function isExplicitDnb(row) {
  if (!row) return false;
  return /dnb|did not bat/i.test(String(row.dismissal || ''));
}

function pushBatter(list, raw) {
  if (!raw?.name) return;
  const runs = Number(raw.runs);
  list.push({
    name: raw.name,
    id: raw.id ?? null,
    runs: Number.isFinite(runs) ? runs : 0,
    balls: Number.isFinite(Number(raw.balls)) ? Number(raw.balls) : null,
    notOut: raw.notOut,
    dismissal: raw.dismissal || raw.outDesc || null,
    fours: raw.fours ?? null,
    sixes: raw.sixes ?? null,
  });
}

/** Collect known batter rows from live strip + scorecard. */
export function collectMatchBatters(match) {
  const list = [];
  const ld = match?.liveDetails || {};
  pushBatter(list, ld.batter1);
  pushBatter(list, ld.batter2);
  pushBatter(list, match?.batter1);
  pushBatter(list, match?.batter2);

  for (const b of ld.scorecardBatters || []) pushBatter(list, b);
  for (const b of match?.scorecardBatters || []) pushBatter(list, b);

  for (const inn of match?.scorecardInnings || []) {
    for (const b of inn?.batters || []) pushBatter(list, b);
  }

  // Deduplicate by slug, keep highest runs / finished status preferred
  const bySlug = new Map();
  for (const row of list) {
    const key = slugifyPlayerName(row.name);
    const prev = bySlug.get(key);
    if (!prev) {
      bySlug.set(key, row);
      continue;
    }
    const prefer = (Number(row.runs) || 0) > (Number(prev.runs) || 0)
      || (isBatterFinished(row) && !isBatterFinished(prev))
      || (row.balls != null && prev.balls == null);
    if (prefer) bySlug.set(key, { ...prev, ...row });
  }
  return [...bySlug.values()];
}

export function resolvePlayerBatter(match, playerSlug, bet = null) {
  const batters = collectMatchBatters(match);
  const leg = getPrimaryLegContext(bet);
  const hints = [
    playerSlug,
    leg?.playerName,
    leg?.marketName,
    bet?.selection_name,
  ].filter(Boolean);

  for (const hint of hints) {
    // market names like "2nd Innings - Alex Hales To Score 25+ Runs"
    const fromMarket = String(hint).match(/-\s*(.+?)\s+To Score/i)
      || String(hint).match(/-\s*(.+?)\s+Total Runs/i);
    const nameHint = fromMarket ? fromMarket[1] : hint;
    const hit = batters.find((b) => playerNameMatches(b.name, nameHint));
    if (hit) return hit;
  }

  return batters.find((b) => playerNameMatches(b.name, playerSlug)) || null;
}

function isYesSelection(selectionId, selectionName) {
  const s = `${selectionId} ${selectionName}`.toLowerCase();
  return /\byes\b/.test(s) && !/\bno\b/.test(s);
}

function isNoSelection(selectionId, selectionName) {
  const s = `${selectionId} ${selectionName}`.toLowerCase();
  return /\bno\b/.test(s);
}

function isOverSelection(selectionId, selectionName) {
  const s = `${selectionId} ${selectionName}`.toLowerCase();
  return /\bover\b/.test(s) && !/\bunder\b/.test(s);
}

function isUnderSelection(selectionId, selectionName) {
  const s = `${selectionId} ${selectionName}`.toLowerCase();
  return /\bunder\b/.test(s);
}

function battingFinishedForPlayer(match, batter) {
  if (!batter) return false;
  if (isBatterFinished(batter)) return true;
  if (isExplicitDnb(batter)) return true;
  if (isMatchFinalStatus(match)) return true;

  const bat = getBattingOversAndScore(match);
  const ld = match?.liveDetails || {};
  const onCrease = [ld.batter1, ld.batter2, match?.batter1, match?.batter2]
    .some((b) => b?.name && playerNameMatches(b.name, batter.name));

  if (onCrease) {
    // Still batting — finished only if current innings is complete (all out / overs done)
    return isInningsComplete(match, bat.innings);
  }

  // Not on crease: out, or waiting to bat, or finished prior innings
  const facedBall = (Number(batter.balls) || 0) > 0 || (Number(batter.runs) || 0) > 0;
  if (facedBall || isBatterFinished(batter)) return true;

  // Yet to bat — wait until innings/match ends
  return isInningsComplete(match, bat.innings) || isMatchFinalStatus(match);
}

/**
 * @returns {{ outcome: string, reason: string }|null}
 */
export function evaluatePlayerPropMarketBet(bet, match) {
  const market = String(bet?.market_id || '');
  const parsed = parsePlayerPropMarket(market);
  if (!parsed) return null;
  if (!match) return null;

  const selectionId = String(bet.selection_id || '');
  const selectionName = String(bet.selection_name || '');
  const batter = resolvePlayerBatter(match, parsed.playerSlug, bet);
  const bat = getBattingOversAndScore(match);
  const matchDone = isMatchFinalStatus(match);
  const inningsDone = isInningsComplete(match, bat.innings) || matchDone;

  logSettlement('SETTLEMENT_PLAYER_PROP_CHECK', {
    betId: bet.bet_id,
    matchId: match?.id || match?.matchId,
    marketId: market,
    playerSlug: parsed.playerSlug,
    found: Boolean(batter),
    runs: batter?.runs ?? null,
    finished: batter ? battingFinishedForPlayer(match, batter) : null,
  });

  // Player never appeared
  if (!batter) {
    if (matchDone || inningsDone) {
      return {
        outcome: 'VOID',
        reason: `player_${parsed.playerSlug}_dnb`,
      };
    }
    return null;
  }

  // Explicit DNB on scorecard after innings/match complete
  if (isExplicitDnb(batter) && (matchDone || inningsDone)) {
    return {
      outcome: 'VOID',
      reason: `player_${parsed.playerSlug}_dnb`,
    };
  }

  // Listed but never faced a ball and innings/match over → VOID
  if ((Number(batter.balls) || 0) === 0 && (Number(batter.runs) || 0) === 0
    && !isBatterFinished(batter)
    && !/^(batting|not out)$/i.test(String(batter.dismissal || ''))
    && (matchDone || inningsDone)
    && batter.notOut !== true) {
    return {
      outcome: 'VOID',
      reason: `player_${parsed.playerSlug}_dnb`,
    };
  }

  const runs = Number(batter.runs) || 0;
  const finished = battingFinishedForPlayer(match, batter);

  if (parsed.kind === 'MILESTONE') {
    const target = parsed.target;
    const reached = runs >= target;

    if (reached) {
      if (isYesSelection(selectionId, selectionName)) {
        return { outcome: 'WON', reason: `player_${target}_runs=${runs}` };
      }
      if (isNoSelection(selectionId, selectionName)) {
        return { outcome: 'LOST', reason: `player_${target}_runs=${runs}` };
      }
      return null;
    }

    if (!finished) return null;

    if (isYesSelection(selectionId, selectionName)) {
      return { outcome: 'LOST', reason: `player_${target}_final=${runs}` };
    }
    if (isNoSelection(selectionId, selectionName)) {
      return { outcome: 'WON', reason: `player_${target}_final=${runs}` };
    }
    return null;
  }

  // ALT_RUNS Over/Under
  const line = resolveSettlementLine(bet, selectionId, selectionName)
    ?? parseLineFromText(selectionName)
    ?? parseLineFromText(selectionId);
  if (line == null || !Number.isFinite(line)) return null;

  if (isOverSelection(selectionId, selectionName)) {
    if (runs > line) return { outcome: 'WON', reason: `player_alt_runs=${runs}_line=${line}` };
    if (finished) return { outcome: 'LOST', reason: `player_alt_final=${runs}_line=${line}` };
    return null;
  }
  if (isUnderSelection(selectionId, selectionName)) {
    if (runs > line) return { outcome: 'LOST', reason: `player_alt_runs=${runs}_line=${line}` };
    if (finished) return { outcome: 'WON', reason: `player_alt_final=${runs}_line=${line}` };
    return null;
  }
  return null;
}
