/**
 * OddsEngineV4 — over markets (P1). Requires ball/over clock.
 */

import {
  projectOverRuns,
  pickBalancedLine,
  normalOuFair,
} from '../models/ScoreDistributionEngine.mjs';
import { priceExclusive, DEFAULT_V4_MARGIN } from '../pricing/MarginPolicy.mjs';
import { ouMarket } from './helpers.mjs';

function nextOverNumber(state) {
  const balls = Number(state.ballsCompleted) || 0;
  const per = 6;
  return Math.floor(balls / per) + 1;
}

export function generateOverMarkets(state, quality, margins = DEFAULT_V4_MARGIN) {
  if (!quality?.ballFeedOk && !state.hasBallFeed) return [];
  if (state.status !== 'LIVE' && state.phase === 'PREMATCH') return [];
  if (Number(state.ballsRemaining) < 6) return [];

  const overround = margins.overMarketsOverround ?? DEFAULT_V4_MARGIN.overMarketsOverround;
  const overNum = nextOverNumber(state);
  const inn = Number(state.currentInnings) || 1;
  const proj = projectOverRuns(state);
  const line = pickBalancedLine(proj.mean);
  const fair = normalOuFair(proj.mean, proj.sd, line);
  const battingName = String(state.battingTeamId) === String(state.team1.id)
    ? state.team1.name
    : state.team2.name;

  const nextOver = ouMarket({
    marketId: `i${inn}_next_over_${overNum}_total`,
    marketType: 'OVER_TOTAL',
    name: `Next Over (${overNum}) - ${battingName} Total Runs`,
    line,
    pOver: fair.pOver,
    pUnder: fair.pUnder,
    overround,
    priceExclusive,
  });

  const markets = [];
  if (nextOver) markets.push(nextOver);

  // Milestone overs 0-N when chase/innings has room
  const milestone = Math.min(
    Math.ceil((Number(state.ballsCompleted) + 30) / 6),
    Math.floor(Number(state.ballsPerInnings) / 6),
  );
  if (milestone > overNum + 1) {
    const remOvers = milestone - Math.floor((Number(state.ballsCompleted) || 0) / 6);
    const mean = proj.mean * Math.max(1, remOvers) * 0.92 + Number(state.battingRuns);
    const mLine = pickBalancedLine(mean);
    const mFair = normalOuFair(mean, Math.max(8, proj.sd * Math.sqrt(remOvers)), mLine);
    const milestoneMarket = ouMarket({
      marketId: `i${inn}_overs_0_${milestone}_total`,
      marketType: 'OVER_TOTAL',
      name: `${inn === 2 ? '2nd' : '1st'} Innings Overs 0 to ${milestone} - ${battingName} Total`,
      line: mLine,
      pOver: mFair.pOver,
      pUnder: mFair.pUnder,
      overround,
      priceExclusive,
    });
    if (milestoneMarket) markets.push(milestoneMarket);
  }

  return markets;
}
