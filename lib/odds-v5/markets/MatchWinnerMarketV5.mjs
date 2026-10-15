/**
 * OddsEngineV5 — Match Winner
 * Same marketId / settlement shape as V3; chase + innings-1 use resource win expectancy.
 * Prematch / missing-chase still follow V3 provider / suspend rules (no silent 1.90/1.90).
 */

import { priceExclusiveSelections } from '../../odds-shared/pricing/OddsCalculator.mjs';
import { createMarketDefinition } from '../../odds-shared/models/MarketDefinition.mjs';
import { formatRulesOrDefault } from '../../odds-shared/format/CricketFormatRules.mjs';
import { calculateWinProbability } from '../../odds-shared/models/winProbabilityModel.mjs';
import { chaseWinProbability, inningsOneWinProbability } from '../models/WinExpectancyEngine.mjs';
import { V5_MARGIN_CONFIG, shortenFavoritePair } from '../v5HouseProtect.mjs';
import { computeMomentum } from '../models/MomentumEngine.mjs';
import { blendModelWithProvider } from '../models/providerBlend.mjs';
import { evaluateStateQuality } from '../state/StateQualityGate.mjs';

function priceTwoWay({ team1, team2, p1, p2, overround, shortenFactor }) {
  const [sp1, sp2] = shortenFavoritePair(p1, p2, shortenFactor);
  const priced = priceExclusiveSelections([
    { selectionId: `sel_${team1.id}`, name: team1.name, probability: sp1 },
    { selectionId: `sel_${team2.id}`, name: team2.name, probability: sp2 },
  ], overround);
  if (priced.suspended) {
    return { suspended: true, selections: [] };
  }
  return { suspended: false, selections: priced.selections };
}

export function generateMatchWinnerMarketV5(state, validation = {}, marginConfig = V5_MARGIN_CONFIG) {
  const momentum = marginConfig.v4Momentum
    || (state.status === 'LIVE' ? computeMomentum(state) : null);
  const overround = marginConfig.liveMatchWinnerOverround ?? V5_MARGIN_CONFIG.liveMatchWinnerOverround;
  const shortenFactor = marginConfig.favoriteShortenFactor ?? V5_MARGIN_CONFIG.favoriteShortenFactor;
  const momentumFactor = momentum?.factor ?? 1;
  const blendW = marginConfig.providerBlendWeight ?? V5_MARGIN_CONFIG.providerBlendWeight;

  if (validation.determined) {
    const settledSel = (team, status) => ({
      selectionId: `sel_${team.id}`,
      name: team.name,
      status,
      bettable: false,
      probability: null,
      fairOdds: null,
      margin: null,
      finalProbability: null,
      odds: null,
      won: status === 'WON',
    });

    if (validation.tied || !validation.winnerId) {
      return createMarketDefinition({
        marketId: 'match_winner',
        marketType: 'MATCH_WINNER',
        name: 'Match Winner',
        status: 'SETTLED',
        selections: [
          settledSel(state.team1, 'PUSH'),
          settledSel(state.team2, 'PUSH'),
        ],
      });
    }

    const winnerTeam = state.team1.id === validation.winnerId ? state.team1 : state.team2;
    const loserTeam = state.team1.id === validation.winnerId ? state.team2 : state.team1;
    return createMarketDefinition({
      marketId: 'match_winner',
      marketType: 'MATCH_WINNER',
      name: 'Match Winner',
      status: 'SETTLED',
      selections: [
        settledSel(winnerTeam, 'WON'),
        settledSel(loserTeam, 'LOST'),
      ],
    });
  }

  // Live quality gate — only hard-stop on unusable state.
  // Incomplete chase/balls still fall through to existing suspend/provider paths
  // (avoids silent flat books without blocking provider-backed pricing).
  if (state.status === 'LIVE' || state.isLive) {
    const gate = evaluateStateQuality(state);
    const hardStop = new Set([
      'format_uncertain',
      'teams_incomplete',
      'scores_inconsistent',
      'chase_target_incomplete',
      'balls_remaining_missing',
      'innings_unknown',
      'batting_side_unknown',
    ]);
    const hard = gate.reasons.filter((r) => hardStop.has(r));
    const staleHard = gate.reasons.includes('feed_stale') && (gate.feedAgeMs || 0) > 120000;
    if (hard.length || staleHard) {
      return createMarketDefinition({
        marketId: 'match_winner',
        marketType: 'MATCH_WINNER',
        name: 'Match Winner',
        status: 'SUSPENDED',
        selections: [],
        suspensionReason: `v5_quality_gate:${(hard.length ? hard : gate.reasons).join(',')}`,
      });
    }
  }

  const rules = formatRulesOrDefault(state.format);
  const providerOdds = state.odds || state.liveDetails?.odds || null;
  const providerHome = Number(providerOdds?.home ?? providerOdds?.team1);
  const providerAway = Number(providerOdds?.away ?? providerOdds?.team2);
  const hasProviderOdds = providerHome > 1 && providerAway > 1;

  // Prematch: same as V3 — require provider; never invent flat 1.90/1.90.
  if (state.status === 'SCHEDULED' || state.status === 'UPCOMING') {
    if (!hasProviderOdds) {
      return createMarketDefinition({
        marketId: 'match_winner',
        marketType: 'MATCH_WINNER',
        name: 'Match Winner',
        status: 'SUSPENDED',
        selections: [],
      });
    }
    const raw1 = 1 / providerHome;
    const raw2 = 1 / providerAway;
    const sumP = raw1 + raw2;
    const priced = priceTwoWay({
      team1: state.team1,
      team2: state.team2,
      p1: raw1 / sumP,
      p2: raw2 / sumP,
      overround,
      shortenFactor,
    });
    if (priced.suspended) {
      return createMarketDefinition({
        marketId: 'match_winner',
        marketType: 'MATCH_WINNER',
        name: 'Match Winner',
        status: 'SUSPENDED',
        selections: [],
      });
    }
    return createMarketDefinition({
      marketId: 'match_winner',
      marketType: 'MATCH_WINNER',
      name: 'Match Winner',
      status: 'OPEN',
      selections: priced.selections,
    });
  }

  // Innings 1 LIVE — resource projection vs format par
  // Test has no fixed ball budget (ballsRemaining=null) — do not invent resource MW.
  if (
    state.status === 'LIVE'
    && Number(state.currentInnings) === 1
    && state.ballsRemaining != null
  ) {
    const battingIsTeam1 = state.battingTeamId === state.team1.id;
    const battingTeam = battingIsTeam1 ? state.team1 : state.team2;
    const wicketsRemaining = Math.max(0, rules.maxWickets - (battingTeam.wickets || 0));
    const inn1 = inningsOneWinProbability({
      battingRuns: battingTeam.runs || 0,
      ballsRemaining: state.ballsRemaining,
      wicketsRemaining,
      ballsPerInnings: state.ballsPerInnings,
      format: state.format,
      resourceRunsHaircut: marginConfig.resourceRunsHaircut,
      momentumFactor,
    });
    if (inn1?.indeterminate || inn1?.method === 'indeterminate') {
      if (!hasProviderOdds) {
        return createMarketDefinition({
          marketId: 'match_winner',
          marketType: 'MATCH_WINNER',
          name: 'Match Winner',
          status: 'SUSPENDED',
          selections: [],
          suspensionReason: 'v5_innings1_resource_indeterminate',
        });
      }
      const raw1 = 1 / providerHome;
      const raw2 = 1 / providerAway;
      const sumP = raw1 + raw2;
      const pricedProv = priceTwoWay({
        team1: state.team1,
        team2: state.team2,
        p1: raw1 / sumP,
        p2: raw2 / sumP,
        overround,
        shortenFactor,
      });
      if (pricedProv.suspended) {
        return createMarketDefinition({
          marketId: 'match_winner',
          marketType: 'MATCH_WINNER',
          name: 'Match Winner',
          status: 'SUSPENDED',
          selections: [],
        });
      }
      return createMarketDefinition({
        marketId: 'match_winner',
        marketType: 'MATCH_WINNER',
        name: 'Match Winner',
        status: 'OPEN',
        selections: pricedProv.selections,
      });
    }
    const pBat = inn1.pBatFirst;
    const pField = inn1.pBowlFirst;
    const [bp1, bp2] = blendModelWithProvider(
      battingIsTeam1 ? pBat : pField,
      battingIsTeam1 ? pField : pBat,
      providerHome,
      providerAway,
      blendW,
    );
    const priced = priceTwoWay({
      team1: state.team1,
      team2: state.team2,
      p1: bp1,
      p2: bp2,
      overround,
      shortenFactor,
    });
    if (priced.suspended) {
      return createMarketDefinition({
        marketId: 'match_winner',
        marketType: 'MATCH_WINNER',
        name: 'Match Winner',
        status: 'SUSPENDED',
        selections: [],
      });
    }
    return createMarketDefinition({
      marketId: 'match_winner',
      marketType: 'MATCH_WINNER',
      name: 'Match Winner',
      status: 'OPEN',
      selections: priced.selections,
    });
  }

  const battingTeam = state.battingTeamId === state.team1.id ? state.team1 : state.team2;
  const fieldingTeam = state.bowlingTeamId === state.team1.id ? state.team1 : state.team2;

  // Chase without target — V3 fallbacks (provider / TEST / suspend)
  if (state.target == null || state.target <= 0 || state.runsRequired == null) {
    if (hasProviderOdds) {
      const raw1 = 1 / providerHome;
      const raw2 = 1 / providerAway;
      const sumP = raw1 + raw2;
      const priced = priceTwoWay({
        team1: state.team1,
        team2: state.team2,
        p1: raw1 / sumP,
        p2: raw2 / sumP,
        overround,
        shortenFactor,
      });
      if (!priced.suspended) {
        return createMarketDefinition({
          marketId: 'match_winner',
          marketType: 'MATCH_WINNER',
          name: 'Match Winner',
          status: 'OPEN',
          selections: priced.selections,
        });
      }
    }
    if (state.status === 'LIVE' && state.format === 'TEST') {
      const { pTeam1, pTeam2 } = calculateWinProbability(state);
      const priced = priceTwoWay({
        team1: state.team1,
        team2: state.team2,
        p1: pTeam1,
        p2: pTeam2,
        overround,
        shortenFactor,
      });
      if (!priced.suspended) {
        return createMarketDefinition({
          marketId: 'match_winner',
          marketType: 'MATCH_WINNER',
          name: 'Match Winner',
          status: 'OPEN',
          selections: priced.selections,
        });
      }
    }
    return createMarketDefinition({
      marketId: 'match_winner',
      marketType: 'MATCH_WINNER',
      name: 'Match Winner',
      status: 'SUSPENDED',
      selections: [],
    });
  }

  const wicketsRemaining = Math.max(0, rules.maxWickets - battingTeam.wickets);
  const { pChase, pField } = chaseWinProbability({
    runsRequired: Math.max(0, state.runsRequired),
    ballsRemaining: state.ballsRemaining,
    wicketsRemaining,
    ballsPerInnings: state.ballsPerInnings,
    format: state.format,
    resourceRunsHaircut: marginConfig.resourceRunsHaircut,
    momentumFactor,
  });

  const battingIsTeam1 = battingTeam.id === state.team1.id;
  const [bp1, bp2] = blendModelWithProvider(
    battingIsTeam1 ? pChase : pField,
    battingIsTeam1 ? pField : pChase,
    providerHome,
    providerAway,
    blendW,
  );

  const chasePriced = priceTwoWay({
    team1: state.team1,
    team2: state.team2,
    p1: bp1,
    p2: bp2,
    overround,
    shortenFactor,
  });
  if (chasePriced.suspended) {
    return createMarketDefinition({
      marketId: 'match_winner',
      marketType: 'MATCH_WINNER',
      name: 'Match Winner',
      status: 'SUSPENDED',
      selections: [],
    });
  }

  // priceTwoWay already emits [team1, team2] — never swap (SRL cards index by order).
  return createMarketDefinition({
    marketId: 'match_winner',
    marketType: 'MATCH_WINNER',
    name: 'Match Winner',
    status: 'OPEN',
    selections: chasePriced.selections,
  });
}

export { generateMatchWinnerMarketV5 as generateMatchWinnerMarketV4 };
