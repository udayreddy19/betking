/**
 * OddsEngineV4 — chase innings total ceilings.
 *
 * Once the first innings is done, the chasing side almost always finishes
 * near the target (win and stop). Soft Overs above ~target are a house leak.
 */

import { priceSelection } from '../odds-v3/pricing/OddsCalculator.mjs';
import { applyLiveTotalOverOddsCap } from '../odds-v3/markets/TeamTotalMarket.mjs';
import { lineScopedSelectionId } from '../odds-v3/lineIdentity.mjs';
import { V4_MARGIN_CONFIG } from './v4HouseProtect.mjs';

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/** Max chase score if they win: need 1, hit 6 → target + 5. */
export function maxChaseTeamScore(target) {
  const t = Number(target);
  if (!(t > 0)) return null;
  return t + 5;
}

/**
 * Realistic expected chase finish (not target+2 always).
 * Near the end this hugs the target, not a soft Over mean.
 */
export function expectedChaseTeamTotal({
  currentScore,
  runsRequired,
  target,
}) {
  const cur = Number(currentScore) || 0;
  const tgt = Number(target);
  if (!(tgt > 0)) return cur;
  const need = Math.max(0, Number.isFinite(runsRequired) ? Number(runsRequired) : tgt - cur);
  if (need <= 0) return cur;

  // Typical winning overshoot shrinks as need grows (harder to "accidentally" overshoot a lot).
  let overshootExp = 0.35;
  if (need <= 1) overshootExp = 1.1;
  else if (need <= 2) overshootExp = 0.75;
  else if (need <= 4) overshootExp = 0.55;
  else if (need <= 8) overshootExp = 0.4;
  else overshootExp = 0.25;

  return clamp(cur + need + overshootExp, cur, maxChaseTeamScore(tgt));
}

/**
 * Fair P(team total > line) in a chase, respecting win-and-stop.
 */
export function pOverChaseTeamTotal({
  line,
  currentScore,
  runsRequired,
  target,
}) {
  const L = Number(line);
  const cur = Number(currentScore) || 0;
  const tgt = Number(target);
  if (!(L > 0) || !(tgt > 0)) return 0.5;

  if (cur > L) return 0.97;

  const need = Math.max(0, Number.isFinite(runsRequired) ? Number(runsRequired) : tgt - cur);
  const maxScore = maxChaseTeamScore(tgt);
  if (L >= maxScore) return 0.02;

  // Already cannot clear the line even with max overshoot on the winning sequence.
  if (cur + need + 5 <= L) return 0.02;

  // Over means finish >= floor(L)+1 for .5 lines (standard cricket totals).
  const minFinish = Math.floor(L) + 1;

  // If they win, finish is in [tgt, tgt+5]. All-out finish is < tgt.
  if (minFinish > maxScore) return 0.02;

  if (need <= 0) return cur > L ? 0.97 : 0.02;

  // Line below target: winning almost always clears it.
  if (minFinish <= tgt) {
    // Small chance they collapse below line before reaching target.
    const collapseRisk = clamp(0.04 + need / 120, 0.04, 0.22);
    return clamp(1 - collapseRisk, 0.55, 0.95);
  }

  // Need finish strictly above target — only via overshoot on the closing sequence.
  const pastTarget = minFinish - tgt; // 1..5
  // Rough P(winning ball / sequence overshoots enough). Dominated by 4/6 when need is small.
  const table = {
    1: 0.22, // finish >= target+1 (e.g. need 1 → 4 or 6; need 2 → 4 or 6)
    2: 0.14, // finish >= target+2
    3: 0.08, // finish >= target+3 (mostly six when need≤3)
    4: 0.05,
    5: 0.03,
  };
  let p = table[pastTarget] ?? 0.02;

  // Extra crush when already sitting just below target (little room for multi-ball overshoot).
  if (need <= 2 && pastTarget >= 2) p *= 0.85;
  if (need <= 2 && pastTarget >= 3) p *= 0.75;

  return clamp(p, 0.02, 0.35);
}

function firstInningsRuns(state) {
  const battingIsTeam1 = state.battingTeamId === state.team1?.id;
  const fielding = battingIsTeam1 ? state.team2 : state.team1;
  const fromField = Number(fielding?.runs);
  if (Number.isFinite(fromField) && fromField > 0) return fromField;
  const first = Number(state.firstInningsRuns);
  return Number.isFinite(first) ? first : null;
}

function repriceOuMarket(market, pOver, marginConfig, line) {
  const overround = marginConfig.liveTeamTotalOverround ?? V4_MARGIN_CONFIG.liveTeamTotalOverround;
  const overExtra = marginConfig.liveTotalsOverExtraOverround ?? V4_MARGIN_CONFIG.liveTotalsOverExtraOverround;
  const maxOverOdds = marginConfig.maxLiveTotalOverOdds ?? V4_MARGIN_CONFIG.maxLiveTotalOverOdds;
  const p = clamp(Number(pOver), 0.02, 0.98);
  const L = line ?? market.line;

  // When Over is the underdog (chase ceiling), do not force a soft-Over cap —
  // that was turning 190.5 Overs into 1.48 favorites.
  const overIsUnderdog = p < 0.42;

  let overSelection = priceSelection({
    selectionId: lineScopedSelectionId('over', L),
    name: `Over ${L}`,
    probability: p,
    overround: overround + overExtra,
    maxOdds: overIsUnderdog ? undefined : maxOverOdds,
  });
  let underSelection = priceSelection({
    selectionId: lineScopedSelectionId('under', L),
    name: `Under ${L}`,
    probability: 1 - p,
    overround,
  });

  if (!overIsUnderdog) {
    const capped = applyLiveTotalOverOddsCap(
      overSelection,
      underSelection,
      overround + overExtra,
      maxOverOdds,
    );
    overSelection = capped.overSel;
    underSelection = capped.underSel;
  }

  return {
    ...market,
    line: L,
    status: 'OPEN',
    overround: overround + overExtra,
    selections: [overSelection, underSelection],
  };
}

/**
 * Reprice / drop chase team & match totals that ignore win-and-stop.
 */
export function applyV4ChaseTotalSanity(markets = [], state, marginConfig = V4_MARGIN_CONFIG) {
  if (!state || Number(state.currentInnings) < 2 || state.target == null) {
    return markets;
  }

  const target = Number(state.target);
  const batting = state.battingTeamId === state.team1?.id ? state.team1 : state.team2;
  const currentScore = Number(batting?.runs) || 0;
  const runsRequired = Number.isFinite(state.runsRequired)
    ? Number(state.runsRequired)
    : Math.max(0, target - currentScore);
  const first = firstInningsRuns(state);
  const maxTeam = maxChaseTeamScore(target);
  const maxMatch = first != null && maxTeam != null ? first + maxTeam : null;

  return (markets || []).map((market) => {
    if (!market || market.status !== 'OPEN') return market;
    const id = String(market.marketId || '');
    const line = Number(market.line);

    const isTeamTotal =
      id === 'team_total'
      || /^i\d+_team_total(?:_ladder_|_alt_|$)/i.test(id)
      || (/team_total/i.test(id) && !/fours|sixes|wickets/i.test(id));
    const isMatchTotal =
      id === 'match_total'
      || /^match_total(?:_ladder_|_alt_|$)/i.test(id);

    if (!isTeamTotal && !isMatchTotal) return market;
    if (!Number.isFinite(line)) return market;

    if (isTeamTotal) {
      if (maxTeam != null && line >= maxTeam) {
        return { ...market, status: 'SUSPENDED', selections: [], suspensionReason: 'chase_ceiling' };
      }
      // Prefer not to sell Overs that sit above a realistic chase finish.
      const pOver = pOverChaseTeamTotal({ line, currentScore, runsRequired, target });
      return repriceOuMarket(market, pOver, marginConfig, line);
    }

    if (isMatchTotal && first != null) {
      if (maxMatch != null && line >= maxMatch) {
        return { ...market, status: 'SUSPENDED', selections: [], suspensionReason: 'chase_ceiling' };
      }
      // Match Over L ↔ chase team Over (L - first)
      const teamLine = line - first;
      const pOver = pOverChaseTeamTotal({
        line: teamLine,
        currentScore,
        runsRequired,
        target,
      });
      return repriceOuMarket(market, pOver, marginConfig, line);
    }

    return market;
  }).filter((m) => m && m.status !== 'SUSPENDED');
}

/**
 * Cap projected means used by V4 extras ladders in chase.
 */
export function capChaseProjection(proj, state) {
  if (!state || Number(state.currentInnings) < 2 || state.target == null) return proj;
  const batting = state.battingTeamId === state.team1?.id ? state.team1 : state.team2;
  return expectedChaseTeamTotal({
    currentScore: Number(batting?.runs) || 0,
    runsRequired: state.runsRequired,
    target: state.target,
  });
}
