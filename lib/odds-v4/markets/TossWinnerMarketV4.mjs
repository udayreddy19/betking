/**
 * OddsEngineV4 — Toss family markets (pre-match).
 * - toss_winner: which team wins the toss
 * - toss_and_bat / toss_and_bowl: Yes/No on toss winner's election
 * - team_bat_first: which side opens the batting
 */

import { priceExclusiveSelections } from '../../odds-v3/pricing/OddsCalculator.mjs';
import { createMarketDefinition } from '../../odds-v3/models/MarketDefinition.mjs';
import { teamNameMatches } from '../../../src/utils/cricketScores.js';

/** Resolve toss winner label from canonical or raw match shapes. */
export function resolveTossWinnerLabel(stateOrMatch) {
  if (!stateOrMatch) return null;
  const ld = stateOrMatch.liveDetails || {};
  const toss = stateOrMatch.toss || ld.toss || {};
  const raw = toss.wonToss
    || toss.winner
    || toss.tossWinnerName
    || toss.winnerName
    || ld.tossWinner
    || ld.tossWinnerName
    || null;
  const label = raw != null ? String(raw).trim() : '';
  return label || null;
}

/** Normalize toss election to 'bat' | 'bowl' | null. */
export function resolveTossDecision(stateOrMatch) {
  if (!stateOrMatch) return null;
  const ld = stateOrMatch.liveDetails || {};
  const toss = stateOrMatch.toss || ld.toss || {};
  const raw = String(toss.decision || toss.choice || ld.tossDecision || '').toLowerCase();
  if (!raw) return null;
  if (/\bbowl|field|chase/.test(raw)) return 'bowl';
  if (/\bbat/.test(raw)) return 'bat';
  return null;
}

export function teamMatchesLabel(team, label) {
  if (!team || !label) return false;
  if (teamNameMatches(team.name, label) || teamNameMatches(label, team.name)) return true;
  const short = String(team.shortName || team.id || '').trim();
  if (short && (teamNameMatches(short, label) || teamNameMatches(label, short))) return true;
  return String(team.id || '').toLowerCase() === String(label).toLowerCase();
}

/** Which team bats first once toss + decision are known. */
export function resolveBatFirstTeam(stateOrMatch) {
  const winnerLabel = resolveTossWinnerLabel(stateOrMatch);
  const decision = resolveTossDecision(stateOrMatch);
  if (!winnerLabel || !decision || !stateOrMatch?.team1 || !stateOrMatch?.team2) return null;
  const t1Wins = teamMatchesLabel(stateOrMatch.team1, winnerLabel);
  const t2Wins = teamMatchesLabel(stateOrMatch.team2, winnerLabel);
  if (!t1Wins && !t2Wins) return null;
  if (decision === 'bat') return t1Wins ? stateOrMatch.team1 : stateOrMatch.team2;
  return t1Wins ? stateOrMatch.team2 : stateOrMatch.team1;
}

function settledTeamSel(team, status) {
  return {
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
  };
}

function settledYesNo(marketId, yesWon) {
  return [
    {
      selectionId: `${marketId}_yes`,
      name: 'Yes',
      status: yesWon ? 'WON' : 'LOST',
      bettable: false,
      odds: null,
      won: !!yesWon,
    },
    {
      selectionId: `${marketId}_no`,
      name: 'No',
      status: yesWon ? 'LOST' : 'WON',
      bettable: false,
      odds: null,
      won: !yesWon,
    },
  ];
}

function isPreMatch(state) {
  return !(state.status === 'LIVE' || state.status === 'COMPLETED' || state.isLive);
}

function overroundFor(marginConfig) {
  return marginConfig.tossWinnerOverround
    ?? marginConfig.liveMatchWinnerOverround
    ?? 0.08;
}

function fairTeamSplit(state) {
  const r1 = Number(state.team1.rating || state.liveDetails?.team1Rating || 80);
  const r2 = Number(state.team2.rating || state.liveDetails?.team2Rating || 80);
  const tilt = ((r1 - r2) / Math.max(1, r1 + r2)) * 0.04;
  let p1 = Math.max(0.42, Math.min(0.58, 0.5 + tilt));
  return { p1, p2: 1 - p1 };
}

function suspendedTeamMarket(marketId, marketType, name) {
  return createMarketDefinition({
    marketId,
    marketType,
    category: 'match',
    name,
    status: 'SUSPENDED',
    selections: [],
  });
}

export function generateTossWinnerMarketV4(state, _validation = {}, marginConfig = {}) {
  if (!state?.team1?.id || !state?.team2?.id) return null;

  const winnerLabel = resolveTossWinnerLabel(state);
  if (winnerLabel) {
    const t1Wins = teamMatchesLabel(state.team1, winnerLabel);
    const t2Wins = teamMatchesLabel(state.team2, winnerLabel);
    if (!t1Wins && !t2Wins) {
      return suspendedTeamMarket('toss_winner', 'TOSS_WINNER', 'Toss Winner');
    }
    const winner = t1Wins ? state.team1 : state.team2;
    const loser = t1Wins ? state.team2 : state.team1;
    return createMarketDefinition({
      marketId: 'toss_winner',
      marketType: 'TOSS_WINNER',
      category: 'match',
      name: 'Toss Winner',
      status: 'SETTLED',
      selections: [
        settledTeamSel(winner, 'WON'),
        settledTeamSel(loser, 'LOST'),
      ],
    });
  }

  if (!isPreMatch(state)) {
    return suspendedTeamMarket('toss_winner', 'TOSS_WINNER', 'Toss Winner');
  }

  const overround = overroundFor(marginConfig);
  const { p1, p2 } = fairTeamSplit(state);
  const priced = priceExclusiveSelections([
    { selectionId: `sel_${state.team1.id}`, name: state.team1.name, probability: p1 },
    { selectionId: `sel_${state.team2.id}`, name: state.team2.name, probability: p2 },
  ], overround);
  if (priced.suspended) return suspendedTeamMarket('toss_winner', 'TOSS_WINNER', 'Toss Winner');

  return createMarketDefinition({
    marketId: 'toss_winner',
    marketType: 'TOSS_WINNER',
    category: 'match',
    name: 'Toss Winner',
    status: 'OPEN',
    selections: priced.selections,
    overround,
  });
}

function generateTossElectionYesNo(state, marketId, name, expectDecision, marginConfig) {
  const decision = resolveTossDecision(state);
  if (decision) {
    const yesWon = decision === expectDecision;
    return createMarketDefinition({
      marketId,
      marketType: expectDecision === 'bat' ? 'TOSS_AND_BAT' : 'TOSS_AND_BOWL',
      category: 'match',
      name,
      status: 'SETTLED',
      selections: settledYesNo(marketId, yesWon),
    });
  }

  if (!isPreMatch(state)) {
    return createMarketDefinition({
      marketId,
      marketType: expectDecision === 'bat' ? 'TOSS_AND_BAT' : 'TOSS_AND_BOWL',
      category: 'match',
      name,
      status: 'SUSPENDED',
      selections: [],
    });
  }

  const overround = overroundFor(marginConfig);
  // Slight bat bias in T20 (~52%)
  const pYes = expectDecision === 'bat' ? 0.52 : 0.48;
  const priced = priceExclusiveSelections([
    { selectionId: `${marketId}_yes`, name: 'Yes', probability: pYes },
    { selectionId: `${marketId}_no`, name: 'No', probability: 1 - pYes },
  ], overround);
  if (priced.suspended) {
    return createMarketDefinition({
      marketId,
      marketType: expectDecision === 'bat' ? 'TOSS_AND_BAT' : 'TOSS_AND_BOWL',
      category: 'match',
      name,
      status: 'SUSPENDED',
      selections: [],
    });
  }
  return createMarketDefinition({
    marketId,
    marketType: expectDecision === 'bat' ? 'TOSS_AND_BAT' : 'TOSS_AND_BOWL',
    category: 'match',
    name,
    status: 'OPEN',
    selections: priced.selections,
    overround,
  });
}

export function generateTossAndBatMarketV4(state, _validation = {}, marginConfig = {}) {
  if (!state?.team1?.id || !state?.team2?.id) return null;
  return generateTossElectionYesNo(state, 'toss_and_bat', 'Toss Winner Bats', 'bat', marginConfig);
}

export function generateTossAndBowlMarketV4(state, _validation = {}, marginConfig = {}) {
  if (!state?.team1?.id || !state?.team2?.id) return null;
  return generateTossElectionYesNo(state, 'toss_and_bowl', 'Toss Winner Bowls', 'bowl', marginConfig);
}

export function generateTeamBatFirstMarketV4(state, _validation = {}, marginConfig = {}) {
  if (!state?.team1?.id || !state?.team2?.id) return null;

  const batFirst = resolveBatFirstTeam(state);
  if (batFirst) {
    const t1Wins = batFirst.id === state.team1.id || teamMatchesLabel(state.team1, batFirst.name);
    return createMarketDefinition({
      marketId: 'team_bat_first',
      marketType: 'TEAM_BAT_FIRST',
      category: 'match',
      name: 'Team to Bat First',
      status: 'SETTLED',
      selections: [
        settledTeamSel(state.team1, t1Wins ? 'WON' : 'LOST'),
        settledTeamSel(state.team2, t1Wins ? 'LOST' : 'WON'),
      ],
    });
  }

  if (!isPreMatch(state)) {
    return suspendedTeamMarket('team_bat_first', 'TEAM_BAT_FIRST', 'Team to Bat First');
  }

  const overround = overroundFor(marginConfig);
  const { p1, p2 } = fairTeamSplit(state);
  const priced = priceExclusiveSelections([
    { selectionId: `sel_${state.team1.id}`, name: state.team1.name, probability: p1 },
    { selectionId: `sel_${state.team2.id}`, name: state.team2.name, probability: p2 },
  ], overround);
  if (priced.suspended) {
    return suspendedTeamMarket('team_bat_first', 'TEAM_BAT_FIRST', 'Team to Bat First');
  }
  return createMarketDefinition({
    marketId: 'team_bat_first',
    marketType: 'TEAM_BAT_FIRST',
    category: 'match',
    name: 'Team to Bat First',
    status: 'OPEN',
    selections: priced.selections,
    overround,
  });
}

/** All open/settled toss-family markets for the V4 book. */
export function generateTossFamilyMarketsV4(state, validation = {}, marginConfig = {}) {
  const markets = [
    generateTossWinnerMarketV4(state, validation, marginConfig),
    generateTossAndBatMarketV4(state, validation, marginConfig),
    generateTossAndBowlMarketV4(state, validation, marginConfig),
    generateTeamBatFirstMarketV4(state, validation, marginConfig),
  ].filter(Boolean);
  return markets.filter((m) => m.status === 'OPEN' || m.status === 'SETTLED');
}
