/**
 * Module F: IPLSRL Match Engine
 * Match state machine, Toss, Playing XI, Substitutes, Impact Players, Batting Order, and Bowling Rotations.
 */

import { getIPLSRLTeamById } from './iplSrlTeamEngine.mjs';
import { getIPLSRLPlayersByTeam } from './iplSrlPlayerEngine.mjs';

export const MATCH_STATES = {
  SCHEDULED: 'SCHEDULED',
  TOSS: 'TOSS',
  LINEUP: 'LINEUP',
  IN_PROGRESS: 'IN_PROGRESS',
  INNINGS_BREAK: 'INNINGS_BREAK',
  COMPLETED: 'COMPLETED',
  ABANDONED: 'ABANDONED',
  NO_RESULT: 'NO_RESULT',
};

export function initializeIPLSRLMatch(fixtureData) {
  const homeTeam = getIPLSRLTeamById(fixtureData.homeTeamId) || { teamId: fixtureData.homeTeamId, teamName: fixtureData.homeTeamName };
  const awayTeam = getIPLSRLTeamById(fixtureData.awayTeamId) || { teamId: fixtureData.awayTeamId, teamName: fixtureData.awayTeamName };

  const homeSquad = getIPLSRLPlayersByTeam(homeTeam.teamId);
  const awaySquad = getIPLSRLPlayersByTeam(awayTeam.teamId);

  const homeXI = homeSquad.slice(0, 11);
  const awayXI = awaySquad.slice(0, 11);

  const homeSub = homeSquad[11] || null;
  const awaySub = awaySquad[11] || null;

  return {
    matchId: fixtureData.fixtureId || `match_${Date.now()}`,
    seasonId: fixtureData.seasonId || 'IPLSRL_2026',
    status: MATCH_STATES.SCHEDULED,
    homeTeam: {
      teamId: homeTeam.teamId,
      name: homeTeam.teamName,
      shortName: homeTeam.shortName || 'HT',
      playingXI: homeXI,
      impactPlayer: homeSub,
    },
    awayTeam: {
      teamId: awayTeam.teamId,
      name: awayTeam.teamName,
      shortName: awayTeam.shortName || 'AT',
      playingXI: awayXI,
      impactPlayer: awaySub,
    },
    venue: fixtureData.venue || 'Neutral Ground',
    toss: null,
    currentInnings: 1,
    targetScore: null,
    innings1: {
      battingTeamId: null,
      bowlingTeamId: null,
      runs: 0,
      wickets: 0,
      overs: 0,
      balls: 0,
      completed: false,
      battingCard: [],
      bowlingCard: [],
    },
    innings2: {
      battingTeamId: null,
      bowlingTeamId: null,
      runs: 0,
      wickets: 0,
      overs: 0,
      balls: 0,
      completed: false,
      battingCard: [],
      bowlingCard: [],
    },
    winnerId: null,
    winMargin: null,
    resultSummary: null,
    createdAt: new Date().toISOString(),
  };
}

export function performIPLSRLToss(matchState, seed = Date.now()) {
  const tossWinner = (seed % 2 === 0) ? matchState.homeTeam : matchState.awayTeam;
  const tossDecision = (seed % 3 === 0) ? 'BAT' : 'BOWLE';

  let batFirstTeam = tossWinner;
  let bowlFirstTeam = (tossWinner.teamId === matchState.homeTeam.teamId) ? matchState.awayTeam : matchState.homeTeam;

  if (tossDecision === 'BOWLE') {
    const temp = batFirstTeam;
    batFirstTeam = bowlFirstTeam;
    bowlFirstTeam = temp;
  }

  matchState.toss = {
    winnerId: tossWinner.teamId,
    winnerName: tossWinner.name,
    decision: tossDecision,
  };

  matchState.status = MATCH_STATES.TOSS;
  matchState.innings1.battingTeamId = batFirstTeam.teamId;
  matchState.innings1.bowlingTeamId = bowlFirstTeam.teamId;
  matchState.innings2.battingTeamId = bowlFirstTeam.teamId;
  matchState.innings2.bowlingTeamId = batFirstTeam.teamId;

  return matchState;
}
