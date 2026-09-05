/**
 * OddsEngineV4 — expanded extras beyond V3 generators.
 * All marketIds must match settlement contract patterns.
 */

import { getFormatRules, nextBallSlot } from '../../odds-v3/format/CricketFormatRules.mjs';
import { priceSelection, priceExclusiveSelections } from '../../odds-v3/pricing/OddsCalculator.mjs';
import { createMarketDefinition } from '../../odds-v3/models/MarketDefinition.mjs';
import { calculateOverUnderProbability } from '../../odds-v3/models/distributionModel.mjs';
import { isPlaceholderPlayerName } from '../../../src/utils/cricketPlayers.js';
import { expectedRemainingRuns } from '../models/resourceTables.mjs';
import { applySideHouseBias } from '../v4HouseProtect.mjs';
import {
  capChaseProjection,
  expectedChaseTeamTotal,
  maxChaseTeamScore,
  pOverChaseTeamTotal,
} from '../chaseTotalCaps.mjs';

function slug(name = '') {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function phaseBallDist(state) {
  const rules = getFormatRules(state.format) || getFormatRules('T20');
  const ballsCompleted = state.ballsCompleted || 0;
  const ballsPerOver = rules.ballsPerOver || 6;
  const overNum = Math.floor(ballsCompleted / ballsPerOver) + 1;
  const totalOvers = rules.ballsPerInnings / ballsPerOver;
  const ppOvers = (rules.powerplayBalls || 36) / ballsPerOver;
  let base;
  if (overNum <= ppOvers) {
    base = { dot: 0.30, single: 0.34, double: 0.07, four: 0.16, six: 0.07, wicket: 0.06 };
  } else if (overNum > totalOvers * 0.75) {
    base = { dot: 0.28, single: 0.30, double: 0.06, four: 0.14, six: 0.12, wicket: 0.10 };
  } else {
    base = { dot: 0.38, single: 0.36, double: 0.08, four: 0.10, six: 0.04, wicket: 0.04 };
  }
  const sum = base.dot + base.single + base.double + base.four + base.six + base.wicket;
  return {
    dot: base.dot / sum,
    single: base.single / sum,
    double: base.double / sum,
    four: base.four / sum,
    six: base.six / sum,
    wicket: base.wicket / sum,
  };
}

function ouMarket({ marketId, marketType, name, line, pOver, overround, maxOverOdds, sideBias, category = 'totals' }) {
  const p = clamp(applySideHouseBias(Number(pOver), sideBias), 0.02, 0.98);
  return createMarketDefinition({
    marketId,
    marketType,
    category,
    name,
    status: 'OPEN',
    line,
    selections: [
      priceSelection({
        selectionId: `${marketId}_over`,
        name: 'Over',
        probability: p,
        overround,
        maxOdds: maxOverOdds,
      }),
      priceSelection({ selectionId: `${marketId}_under`, name: 'Under', probability: 1 - p, overround }),
    ],
    overround,
  });
}

function yesNoMarket({ marketId, marketType, name, pYes, overround, sideBias, category = 'props' }) {
  const p = clamp(applySideHouseBias(Number(pYes), sideBias), 0.02, 0.98);
  const priced = priceExclusiveSelections([
    { selectionId: `${marketId}_yes`, name: 'Yes', probability: p },
    { selectionId: `${marketId}_no`, name: 'No', probability: 1 - p },
  ], overround);
  if (priced.suspended) return null;
  return createMarketDefinition({
    marketId,
    marketType,
    category,
    name,
    status: 'OPEN',
    selections: priced.selections,
    overround,
  });
}

export function generateV4ExtraMarkets(state, _validation = {}, marginConfig = {}) {
  if (!state || state.status !== 'LIVE') return [];
  const overround = marginConfig.liveTeamTotalOverround
    ?? 0.16;
  const maxOverOdds = marginConfig.maxLiveTotalOverOdds ?? 1.48;
  const sideBias = marginConfig.sideHouseBias ?? 0.90;
  const markets = [];
  const rules = getFormatRules(state.format) || getFormatRules('T20');
  const ballsPerOver = rules.ballsPerOver || 6;
  const currentBalls = state.ballsCompleted || 0;
  if (currentBalls >= rules.ballsPerInnings) return markets;

  const battingTeam = state.battingTeamId === state.team1.id ? state.team1 : state.team2;
  const wicketsRemaining = Math.max(1, (rules.maxWickets || 10) - (battingTeam.wickets || 0));
  const inn = (Number(state.currentInnings) || 1) >= 2 ? 2 : 1;
  const slot = nextBallSlot(currentBalls, ballsPerOver);
  const overNum = slot.overNum;
  const nextOverNum = Math.floor(currentBalls / ballsPerOver) + 1
    + (currentBalls % ballsPerOver === 0 && currentBalls > 0 ? 0 : 0);
  // Next full over number for "wicket in next over"
  const wicketOverNum = Math.floor(currentBalls / ballsPerOver) + 1;
  const dist = phaseBallDist(state);
  const rpb = expectedRemainingRuns({
    format: state.format,
    wicketsInHand: wicketsRemaining,
    ballsRemaining: state.ballsRemaining,
    ballsPerInnings: state.ballsPerInnings,
  }) * (marginConfig.resourceRunsHaircut ?? 0.93) / Math.max(1, Number(state.ballsRemaining) || 1);

  const ouOpts = { overround, maxOverOdds, sideBias };
  const ynOpts = { overround, sideBias };

  // Delivery extras
  if (state.hasBallFeed !== false) {
    const pGe1 = clamp(1 - dist.dot - dist.wicket, 0.02, 0.98);
    const pGe2 = clamp(dist.double + dist.four + dist.six, 0.02, 0.95);
    const pGe4 = clamp(dist.four + dist.six, 0.02, 0.7);
    const pFour = clamp(dist.four, 0.02, 0.55);
    const pSix = clamp(dist.six, 0.02, 0.45);
    const pDot = clamp(dist.dot, 0.05, 0.7);
    const pWicket = clamp(dist.wicket, 0.02, 0.35);

    for (const [line, pOver] of [[0.5, pGe1], [1.5, pGe2], [2.5, clamp(pGe2 * 0.72, 0.05, 0.85)], [3.5, pGe4]]) {
      markets.push(ouMarket({
        marketId: `i${inn}_next_delivery_runs_ou_${String(line).replace('.', '_')}`,
        marketType: 'NEXT_DELIVERY_OU',
        category: 'deliveries',
        name: `Over ${slot.overNum}.${slot.ballNum} Runs O/U ${line}`,
        line,
        pOver,
        ...ouOpts,
      }));
    }

    const pOdd = clamp((dist.single + dist.four) / Math.max(0.2, pGe1), 0.35, 0.65);
    markets.push(createMarketDefinition({
      marketId: `i${inn}_next_delivery_odd_even_${overNum}_${slot.ballNum}`,
      marketType: 'NEXT_DELIVERY_OE',
      category: 'deliveries',
      name: `Over ${slot.overNum}.${slot.ballNum} Runs Odd/Even`,
      status: 'OPEN',
      selections: [
        priceSelection({ selectionId: 'sel_del_odd', name: 'Odd', probability: pOdd, overround }),
        priceSelection({ selectionId: 'sel_del_even', name: 'Even', probability: 1 - pOdd, overround }),
      ],
      overround,
    }));

    for (const [key, label, pYes] of [
      ['four', 'Four', pFour],
      ['six', 'Six', pSix],
      ['dot', 'Dot Ball', pDot],
      ['wicket_fallen', 'Wicket', pWicket],
    ]) {
      const m = yesNoMarket({
        marketId: `i${inn}_next_delivery_${key}_${overNum}_${slot.ballNum}`,
        marketType: 'NEXT_DELIVERY_YN',
        category: 'deliveries',
        name: `Over ${slot.overNum}.${slot.ballNum} - ${label}`,
        pYes,
        ...ynOpts,
      });
      if (m) markets.push(m);
    }
  }

  // Extra overs milestone window
  if (Number(state.ballsRemaining) >= 18) {
    const targetOvers = Math.min(
      Math.ceil((currentBalls + 30) / ballsPerOver),
      Math.floor(Number(state.ballsPerInnings) / ballsPerOver) - 1,
    );
    if (targetOvers > overNum + 1) {
      const remBalls = targetOvers * ballsPerOver - currentBalls;
      const mean = Number(battingTeam.runs || 0) + rpb * Math.max(6, remBalls);
      const line = Math.floor(mean) + 0.5;
      const fair = calculateOverUnderProbability(mean, Math.max(8, Math.sqrt(remBalls) * 1.4), line);
      markets.push(ouMarket({
        marketId: `i${inn}_overs_0_${targetOvers}_total`,
        marketType: 'OVER_TOTAL',
        category: 'overs',
        name: `Innings Overs 0-${targetOvers} Total`,
        line,
        pOver: fair.pOver,
        ...ouOpts,
      }));
    }
  }

  // Team total ladder
  {
    const rem = rpb * Math.max(1, Number(state.ballsRemaining) || 1);
    let proj = Number(battingTeam.runs || 0) + rem;
    if (Number(state.currentInnings) >= 2 && state.target != null) {
      proj = expectedChaseTeamTotal({
        currentScore: Number(battingTeam.runs || 0),
        runsRequired: state.runsRequired,
        target: state.target,
      });
    }
    const sd = Math.max(10, Math.sqrt(Math.max(12, state.ballsRemaining)) * 1.3);
    const chaseMax = Number(state.currentInnings) >= 2 && state.target != null
      ? maxChaseTeamScore(state.target)
      : null;
    for (const delta of [-15, -10, -5, 5, 10, 15, 25, 35]) {
      const line = Math.floor(proj + delta) + 0.5;
      if (line <= (battingTeam.runs || 0) + 0.5) continue;
      if (chaseMax != null && line >= chaseMax) continue;
      let pOver = calculateOverUnderProbability(proj, sd, line).pOver;
      if (Number(state.currentInnings) >= 2 && state.target != null) {
        pOver = pOverChaseTeamTotal({
          line,
          currentScore: Number(battingTeam.runs || 0),
          runsRequired: state.runsRequired,
          target: state.target,
        });
      }
      const tag = delta < 0 ? `low_${Math.abs(delta)}` : `high_${delta}`;
      markets.push(ouMarket({
        marketId: `i${inn}_team_total_ladder_${tag}`,
        marketType: 'TEAM_TOTAL',
        category: 'totals',
        name: `${battingTeam.name} Total ${line}`,
        line,
        pOver,
        ...ouOpts,
      }));
    }
  }

  // Match total ladder
  {
    const first = Number(state.firstInningsRuns ?? (
      inn >= 2
        ? (state.battingTeamId === state.team1.id ? state.team2.runs : state.team1.runs)
        : null
    ));
    const rem = rpb * Math.max(1, Number(state.ballsRemaining) || 1);
    let battingProj = Number(battingTeam.runs || 0) + rem;
    if (inn >= 2 && state.target != null) {
      battingProj = capChaseProjection(battingProj, state);
    }
    let matchMean;
    if (inn >= 2 && Number.isFinite(first)) {
      matchMean = first + battingProj;
    } else {
      const chasePar = expectedRemainingRuns({
        format: state.format,
        wicketsInHand: 10,
        ballsRemaining: state.ballsPerInnings,
        ballsPerInnings: state.ballsPerInnings,
      }) * 0.9 * (marginConfig.resourceRunsHaircut ?? 0.93);
      matchMean = battingProj + chasePar;
    }
    const sd = Math.max(14, matchMean * 0.08);
    const chaseTeamMax = inn >= 2 && state.target != null ? maxChaseTeamScore(state.target) : null;
    const matchMax = Number.isFinite(first) && chaseTeamMax != null ? first + chaseTeamMax : null;
    for (const delta of [-30, -20, -10, 10, 20, 30, 50]) {
      const line = Math.floor(matchMean + delta) + 0.5;
      if (line < 40) continue;
      if (matchMax != null && line >= matchMax) continue;
      let pOver = calculateOverUnderProbability(matchMean, sd, line).pOver;
      if (inn >= 2 && state.target != null && Number.isFinite(first)) {
        pOver = pOverChaseTeamTotal({
          line: line - first,
          currentScore: Number(battingTeam.runs || 0),
          runsRequired: state.runsRequired,
          target: state.target,
        });
      }
      markets.push(ouMarket({
        marketId: `match_total_ladder_${delta < 0 ? 'm' : 'p'}${Math.abs(delta)}`,
        marketType: 'MATCH_TOTAL',
        category: 'totals',
        name: `Match Total ${line}`,
        line,
        pOver,
        ...ouOpts,
      }));
    }
  }

  // Player milestones + alt ladders
  for (const batter of [state.batter1, state.batter2]) {
    const name = typeof batter === 'string' ? batter : batter?.name;
    if (!name || isPlaceholderPlayerName(String(name))) continue;
    const runs = Number(batter?.runs) || 0;
    const balls = Number(batter?.balls) || 0;
    const idBase = slug(String(name));
    const batterRpb = Math.max(0.55, (runs + 10) / Math.max(1, balls + 8));
    const expectMore = batterRpb * Math.min(Number(state.ballsRemaining) || 0, 40) * (marginConfig.resourceRunsHaircut ?? 0.93);

    for (const ms of [25, 50, 75, 100]) {
      if (runs >= ms) continue;
      const need = ms - runs;
      const pYes = clamp(1 / (1 + Math.exp(-2.1 * ((expectMore / Math.max(1, need)) - 1))), 0.04, 0.94);
      const m = yesNoMarket({
        marketId: `player_${ms}_${idBase}`,
        marketType: 'PLAYER',
        category: 'props',
        name: `${name} to Reach ${ms}`,
        pYes,
        ...ynOpts,
      });
      if (m) markets.push(m);
    }

    for (const [tag, add] of [['near', 5], ['mid', 12], ['far', 20], ['long', 30]]) {
      const line = Math.floor(runs + add) + 0.5;
      if (line <= runs) continue;
      const need = line - runs;
      const pOver = clamp(1 / (1 + Math.exp(-2.0 * ((expectMore / Math.max(1, need)) - 1))), 0.05, 0.93);
      markets.push(ouMarket({
        marketId: `player_alt_${idBase}_${tag}`,
        marketType: 'PLAYER',
        category: 'props',
        name: `${name} Runs ${line}`,
        line,
        pOver,
        ...ouOpts,
      }));
    }
  }

  // Wicket in over
  if (Number(state.ballsRemaining) >= 6 && wicketsRemaining > 0) {
    const pWicketOver = clamp(0.12 + 0.035 * (10 - wicketsRemaining), 0.08, 0.55);
    const m = yesNoMarket({
      marketId: `i${inn}_wicket_in_next_over_${wicketOverNum}`,
      marketType: 'WICKET',
      category: 'wickets',
      name: `Wicket In Over ${wicketOverNum}`,
      pYes: pWicketOver,
      ...ynOpts,
    });
    if (m) markets.push(m);
  }

  return markets.filter(Boolean);
}
