/**
 * Live Cricket Match Delivery Simulator & Odds Stress-Tester
 * 
 * Replays synthetic deliveries (Wickets, Sixes, Fours, Dots, Wides) to stress-test:
 *  - OddsEngine V3 pricing model performance and reaction time
 *  - Volatility filter dampening
 *  - Latency and circuit breaker thresholds
 */

import { generate as generateOddsV3 } from './odds-v3/OddsEngineV3.mjs';

export const SAMPLE_DELIVERIES = [
  { event: 'DOT', runs: 0, isWicket: false, ballDesc: 'Good length on off stump, defended' },
  { event: 'BOUNDARY_FOUR', runs: 4, isWicket: false, ballDesc: 'Cover drive through extra cover for FOUR' },
  { event: 'BOUNDARY_SIX', runs: 6, isWicket: false, ballDesc: 'Full toss smashed over deep mid-wicket for SIX' },
  { event: 'WICKET', runs: 0, isWicket: true, ballDesc: 'BOWLED! Clean through the gate, middle stump uprooted!' },
  { event: 'SINGLE', runs: 1, isWicket: false, ballDesc: 'Pushed to mid-on for a quick single' },
  { event: 'TWO_RUNS', runs: 2, isWicket: false, ballDesc: 'Driven through covers, couple of runs taken' },
];

/**
 * Execute a stress-test sequence of simulated balls
 * @param {object} baseMatchState
 * @param {number} totalBalls
 */
export function runMatchOddsStressTest(baseMatchState = {}, totalBalls = 12) {
  const matchId = baseMatchState.matchId || `sim_${Date.now()}`;
  let currentRuns = baseMatchState.scoreHome || 120;
  let currentWickets = baseMatchState.wicketsHome || 3;
  let currentOvers = baseMatchState.oversCompleted || 14.0;

  const results = [];
  const startTime = Date.now();

  for (let i = 1; i <= totalBalls; i++) {
    const ballIdx = (i - 1) % SAMPLE_DELIVERIES.length;
    const delivery = SAMPLE_DELIVERIES[ballIdx];

    currentRuns += delivery.runs;
    if (delivery.isWicket) currentWickets = Math.min(10, currentWickets + 1);

    const overBall = (i % 6);
    const overNum = Math.floor((i - 1) / 6);
    const simulatedOvers = Number((currentOvers + overNum + (overBall / 10)).toFixed(1));

    const state = {
      matchId,
      sport: 'cricket',
      format: 'T20',
      status: 'LIVE',
      scoreHome: currentRuns,
      wicketsHome: currentWickets,
      oversCompleted: simulatedOvers,
      teamHome: baseMatchState.teamHome || 'Mumbai Titans',
      teamAway: baseMatchState.teamAway || 'Chennai Kings',
      lastBallEvent: delivery.event,
      stateVersion: i,
      timestamp: new Date().toISOString(),
    };

    const t0 = performance.now();
    const snapshot = generateOddsV3(state);
    const durationMs = Number((performance.now() - t0).toFixed(2));

    results.push({
      ballNumber: i,
      event: delivery.event,
      score: `${currentRuns}/${currentWickets} (${simulatedOvers} ov)`,
      durationMs,
      status: snapshot.status,
      marketsCount: (snapshot.markets || []).length,
      winnerOdds: (snapshot.markets || []).find((m) => m.marketId === 'match_winner')?.selections?.map((s) => ({
        name: s.name,
        price: s.price,
        dampened: Boolean(s.dampened),
      })) || [],
    });
  }

  const totalDurationMs = Date.now() - startTime;
  const avgLatencyMs = Number((results.reduce((s, r) => s + r.durationMs, 0) / results.length).toFixed(2));

  return {
    matchId,
    totalBallsExecuted: totalBalls,
    totalDurationMs,
    avgLatencyMs,
    isHealthy: avgLatencyMs < 25.0,
    deliveries: results,
  };
}
