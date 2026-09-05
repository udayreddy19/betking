/**
 * OddsEngineV4 — late-chase & phase house protection.
 */

import { V4_MARGIN_CONFIG } from './v4HouseProtect.mjs';
import { maxChaseTeamScore } from './chaseTotalCaps.mjs';

/**
 * Widen margins in death overs / late chase; drop soft high lines.
 */
export function applyLateChaseProtect(markets = [], state, marginConfig = V4_MARGIN_CONFIG, momentum = null) {
  if (!state || state.status !== 'LIVE') return markets;

  const need = Number(state.runsRequired);
  const lateChase = Number(state.currentInnings) >= 2 && Number.isFinite(need) && need > 0 && need <= 10;
  const death = momentum?.phase === 'death';
  if (!lateChase && !death) return markets;

  const target = Number(state.target);
  const maxTeam = Number.isFinite(target) ? maxChaseTeamScore(target) : null;
  const bump = (marginConfig.liveMatchWinnerOverround ?? 0.12)
    + (momentum?.marginBump || 0)
    + (lateChase ? 0.02 : 0);

  return (markets || []).flatMap((market) => {
    if (!market || market.status !== 'OPEN') return [market];
    const id = String(market.marketId || '');

    // Drop team/match ladder lines that sit in pure overshoot territory during late chase.
    if (lateChase && maxTeam != null) {
      const line = Number(market.line);
      if (/team_total_ladder|match_total_ladder/i.test(id) && Number.isFinite(line)) {
        const teamLine = /match_total/i.test(id)
          ? line - (Number(state.firstInningsRuns) || (target - 1) || 0)
          : line;
        if (teamLine >= target + 1.5) return [];
      }
    }

    // Extra shorten on MW in late chase / death.
    if (id === 'match_winner' || id === 'match_winner_super_over') {
      const sels = (market.selections || []).map((sel) => {
        const odds = Number(sel.odds);
        if (!Number.isFinite(odds) || odds <= 1.05) return sel;
        // Pull both sides slightly shorter via implied bump (~marginBump).
        const implied = 1 / odds;
        const nextImplied = Math.min(0.97, implied * (1 + Math.min(0.06, bump * 0.35)));
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
