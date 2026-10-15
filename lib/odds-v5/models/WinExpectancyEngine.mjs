/**
 * OddsEngineV5 — WinExpectancyEngine
 * Resource-table chase / innings-1 win probs + late-chase Monte Carlo blend.
 * Fully format-aware: T20, T10, ODI, The Hundred, Test.
 */

import { expectedRemainingRuns, remainingResourcePct, formatFullInningsExpectation } from './resourceTables.mjs';

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function logistic(x, k = 2.2) {
  return 1 / (1 + Math.exp(-k * x));
}

function formatRates(format = 'T20') {
  const f = String(format || 'T20').toUpperCase();
  if (f.includes('T10')) return { rpb: 1.75, wicketPerBall: 0.045 };
  if (f.includes('HUNDRED')) return { rpb: 1.48, wicketPerBall: 0.038 };
  if (f.includes('ODI') || f.includes('LIST_A')) return { rpb: 0.95, wicketPerBall: 0.028 };
  if (f.includes('TEST') || f.includes('FIRST_CLASS')) return { rpb: 0.55, wicketPerBall: 0.022 };
  return { rpb: 1.35, wicketPerBall: 0.035 };
}

/**
 * Deterministic PRNG (mulberry32) so pricing stays stable for a given state fingerprint.
 */
function mulberry32(seed) {
  let t = seed >>> 0;
  return function next() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromChase({ runsRequired, ballsRemaining, wicketsRemaining, format }) {
  const s = `${format}|${runsRequired}|${ballsRemaining}|${wicketsRemaining}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Ball-by-ball Monte Carlo for late chase (≤ 36 balls).
 * Returns empirical P(chase wins).
 */
export function monteCarloChaseWinProbability({
  runsRequired,
  ballsRemaining,
  wicketsRemaining,
  format,
  momentumFactor = 1,
  simulations = 400,
}) {
  const need0 = Math.max(0, Number(runsRequired) || 0);
  const balls0 = Math.max(0, Math.floor(Number(ballsRemaining) || 0));
  let wickets0 = Math.max(0, Math.floor(Number(wicketsRemaining) || 0));
  if (need0 === 0) return { pChase: 0.98, method: 'mc_already_home', simulations: 0 };
  if (wickets0 <= 0 || balls0 <= 0) return { pChase: 0.02, method: 'mc_impossible', simulations: 0 };

  const rates = formatRates(format);
  const mom = clamp(Number(momentumFactor) || 1, 0.82, 1.18);
  const rpb = rates.rpb * mom;
  // Map mean RPB onto a simple outcome distribution: 0,1,2,4,6 + wicket
  const wicketP = clamp(rates.wicketPerBall * (1.05 - 0.05 * mom), 0.015, 0.08);
  const runMass = 1 - wicketP;
  // Approximate discrete run probs proportional to cricket scoring
  const p0 = runMass * 0.32;
  const p1 = runMass * 0.38;
  const p2 = runMass * 0.14;
  const p4 = runMass * 0.10;
  const p6 = runMass * 0.06;
  // Renormalize lightly toward target rpb via scale on boundaries if needed
  const meanRun = (0 * p0 + 1 * p1 + 2 * p2 + 4 * p4 + 6 * p6) / runMass;
  const scale = meanRun > 0 ? clamp(rpb / meanRun, 0.7, 1.35) : 1;
  const b4 = p4 * scale;
  const b6 = p6 * scale;
  const b2 = p2 * scale;
  let b0 = p0;
  let b1 = p1;
  const excess = (b4 + b6 + b2 + b0 + b1) - runMass;
  b0 = Math.max(0.05 * runMass, b0 - excess * 0.5);
  b1 = Math.max(0.05 * runMass, runMass - (b0 + b2 + b4 + b6));

  const rand = mulberry32(seedFromChase({
    runsRequired: need0,
    ballsRemaining: balls0,
    wicketsRemaining: wickets0,
    format,
  }));

  const sims = Math.max(50, Math.min(2000, Number(simulations) || 400));
  let wins = 0;
  for (let s = 0; s < sims; s++) {
    let need = need0;
    let balls = balls0;
    let wickets = wickets0;
    while (balls > 0 && wickets > 0 && need > 0) {
      const u = rand();
      if (u < wicketP) {
        wickets -= 1;
      } else {
        const r = u - wicketP;
        let scored = 0;
        if (r < b0) scored = 0;
        else if (r < b0 + b1) scored = 1;
        else if (r < b0 + b1 + b2) scored = 2;
        else if (r < b0 + b1 + b2 + b4) scored = 4;
        else scored = 6;
        need -= scored;
      }
      balls -= 1;
    }
    if (need <= 0) wins += 1;
  }

  const pChase = clamp(wins / sims, 0.02, 0.98);
  return { pChase, pField: 1 - pChase, method: 'monte_carlo_late_chase', simulations: sims };
}

/**
 * P(chasing team wins) from remaining resources vs runs required.
 */
export function chaseWinProbability({
  runsRequired,
  ballsRemaining,
  wicketsRemaining,
  ballsPerInnings,
  format,
  resourceRunsHaircut = 0.93,
  momentumFactor = 1,
}) {
  const need = Number(runsRequired);
  const wickets = Number(wicketsRemaining) || 0;
  const isTest = String(format || '').toUpperCase().includes('TEST');

  if (need === 0) {
    return { pChase: 0.98, pField: 0.02, method: 'chase_already_home' };
  }

  if (wickets <= 0) {
    return { pChase: 0.02, pField: 0.98, method: 'chase_impossible_all_out' };
  }

  const haircut = Number.isFinite(resourceRunsHaircut) && resourceRunsHaircut > 0
    ? resourceRunsHaircut
    : 0.93;
  const mom = Number.isFinite(momentumFactor) ? clamp(momentumFactor, 0.82, 1.18) : 1;

  // Test match 4th innings: when ballsRemaining is null, use Test wicket expectancy
  if (isTest && (ballsRemaining == null || !Number.isFinite(Number(ballsRemaining)))) {
    const expectedTestRuns = wickets * 32.5 * haircut * mom;
    const surplusRatio = (expectedTestRuns - need) / Math.max(10, need);
    let pChase = logistic(1.8 * surplusRatio);
    pChase = clamp(pChase, 0.05, 0.95);
    return {
      pChase,
      pField: 1 - pChase,
      method: 'test_wicket_expectancy',
      debug: { expectedTestRuns, need, wickets, surplusRatio },
    };
  }

  const ballsLeft = Number(ballsRemaining) || 0;
  if (!(need >= 0) || ballsLeft <= 0) {
    return { pChase: 0.02, pField: 0.98, method: 'chase_impossible' };
  }

  const remainingExpected = expectedRemainingRuns({
    format,
    wicketsInHand: wickets,
    ballsRemaining: ballsLeft,
    ballsPerInnings,
  });

  if (remainingExpected == null) {
    return { pChase: 0.50, pField: 0.50, method: 'indeterminate_resource' };
  }

  const expected = remainingExpected * haircut * mom;
  const surplusRatio = (expected - need) / Math.max(8, need);
  const resource = remainingResourcePct({
    wicketsInHand: wickets,
    ballsRemaining: ballsLeft,
    ballsPerInnings,
    format,
  }) || 0;
  const rrr = (need / ballsLeft) * 6;
  const paceTerm = clamp(1.2 - (rrr / 12), -1.5, 1.5);

  let pResource = logistic(1.15 * surplusRatio + 0.35 * paceTerm + 0.01 * (resource - 40));
  pResource = clamp(pResource, 0.02, 0.98);

  // Late chase: blend resource logistic with Monte Carlo
  let pChase = pResource;
  let method = 'resource_table';
  let mc = null;
  if (ballsLeft <= 36) {
    mc = monteCarloChaseWinProbability({
      runsRequired: need,
      ballsRemaining: ballsLeft,
      wicketsRemaining: wickets,
      format,
      momentumFactor: mom,
      simulations: ballsLeft <= 18 ? 600 : 400,
    });
    const wMc = ballsLeft <= 18 ? 0.65 : 0.45;
    pChase = clamp((1 - wMc) * pResource + wMc * mc.pChase, 0.02, 0.98);
    method = 'resource_mc_blend';
  }

  return {
    pChase,
    pField: 1 - pChase,
    method,
    debug: {
      expected,
      surplusRatio,
      resource,
      rrr,
      haircut,
      momentumFactor: mom,
      pResource,
      mc: mc ? { pChase: mc.pChase, simulations: mc.simulations } : null,
    },
  };
}

/**
 * Innings-1: projected total vs format par → P(batting side wins match).
 */
export function inningsOneWinProbability({
  battingRuns,
  ballsRemaining,
  wicketsRemaining,
  ballsPerInnings,
  format,
  resourceRunsHaircut = 0.93,
  momentumFactor = 1,
}) {
  const haircut = Number.isFinite(resourceRunsHaircut) && resourceRunsHaircut > 0
    ? resourceRunsHaircut
    : 0.93;
  const mom = Number.isFinite(momentumFactor) ? clamp(momentumFactor, 0.82, 1.18) : 1;
  const isTest = String(format || '').toUpperCase().includes('TEST');

  if (isTest && (ballsRemaining == null || !Number.isFinite(Number(ballsRemaining)))) {
    const par = formatFullInningsExpectation(format);
    const expectedRunsRemaining = (wicketsRemaining ?? 10) * 33 * haircut * mom;
    const projected = Number(battingRuns) + expectedRunsRemaining;
    const ratio = projected / Math.max(60, par);
    let pBatFirst = logistic((ratio - 1) * 1.8);
    pBatFirst = clamp(pBatFirst, 0.20, 0.80);
    return {
      pBatFirst,
      pBowlFirst: 1 - pBatFirst,
      method: 'test_innings1_model',
      debug: { projected, par, ratio, haircut, momentumFactor: mom },
    };
  }

  const remaining = expectedRemainingRuns({
    format,
    wicketsInHand: wicketsRemaining,
    ballsRemaining,
    ballsPerInnings,
  });

  const expectedRemaining = (remaining ?? 0) * haircut * mom;
  const projected = Number(battingRuns) + expectedRemaining;
  const par = formatFullInningsExpectation(format);
  const ratio = projected / Math.max(60, par);
  let pBatFirst = logistic((ratio - 1) * 2.4);
  pBatFirst = clamp(pBatFirst, 0.18, 0.82);
  return {
    pBatFirst,
    pBowlFirst: 1 - pBatFirst,
    method: 'innings1_resource',
    debug: { projected, par, ratio, haircut, momentumFactor: mom },
  };
}
