/**
 * OddsEngineV4 — late-chase & phase house protection.
 */

import { V4_MARGIN_CONFIG } from './v4HouseProtect.mjs';
import { maxChaseTeamScore } from './chaseTotalCaps.mjs';

const CORE_IDS = new Set(['match_winner', 'match_winner_super_over', 'team_total', 'match_total']);

function suspend(market, reason) {
  return {
    ...market,
    status: 'SUSPENDED',
    selections: [],
    suspensionReason: reason,
  };
}

/**
 * Widen margins in death overs / late chase; drop soft high lines.
 * V4.8: death / micro-chase → core-only lock (suspend exotic props).
 */
export function applyLateChaseProtect(markets = [], state, marginConfig = V4_MARGIN_CONFIG, momentum = null) {
  if (!state || state.status !== 'LIVE') return markets;

  const need = Number(state.runsRequired);
  const lateChase = Number(state.currentInnings) >= 2 && Number.isFinite(need) && need > 0 && need <= 10;
  const veryLate = lateChase && need <= 5;
  const death = momentum?.phase === 'death';
  const coreOnly = death || veryLate;
  if (!lateChase && !death) return markets;

  const target = Number(state.target);
  const maxTeam = Number.isFinite(target) ? maxChaseTeamScore(target) : null;
  const bump = (marginConfig.liveMatchWinnerOverround ?? 0.12)
    + (momentum?.marginBump || 0)
    + (lateChase ? 0.025 : 0)
    + (veryLate ? 0.03 : 0)
    + (death ? 0.015 : 0);

  return (markets || []).flatMap((market) => {
    if (!market || market.status !== 'OPEN') return [market];
    const id = String(market.marketId || '');

    if (coreOnly && !CORE_IDS.has(id) && !/^(?:i\d+_)?(?:team_total|match_total)$/i.test(id)) {
      return [suspend(market, 'v48_core_only_lock')];
    }

    if (lateChase && maxTeam != null) {
      const line = Number(market.line);
      if (/team_total_ladder|match_total_ladder/i.test(id) && Number.isFinite(line)) {
        const teamLine = /match_total/i.test(id)
          ? line - (Number(state.firstInningsRuns)
            || Number(state.battingTeamId === state.team1?.id ? state.team2?.runs : state.team1?.runs)
            || 0)
          : line;
        if (teamLine >= target + 1.5) return [];
      }
    }

    if (id === 'match_winner' || id === 'match_winner_super_over') {
      const sels = (market.selections || []).map((sel) => {
        const odds = Number(sel.odds);
        if (!Number.isFinite(odds) || odds <= 1.05) return sel;
        const implied = 1 / odds;
        const nextImplied = Math.min(0.97, implied * (1 + Math.min(0.07, bump * 0.4)));
        return {
          ...sel,
          odds: Number(Math.max(1.01, 1 / nextImplied).toFixed(4)),
          finalProbability: Number(nextImplied.toFixed(8)),
        };
      });
      return [{ ...market, selections: sels, lateChaseProtect: true }];
    }

    return [market];
  });
}
