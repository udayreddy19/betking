import { describe, it, expect } from 'vitest';
import { generate } from '../../lib/odds-v3/OddsEngineV3.mjs';
import { createCanonicalMatchState } from '../../lib/odds-v3/models/CanonicalMatchState.mjs';
import {
  calculatePlayerMilestoneProbability,
  enforceMilestoneProbabilityOrdering,
} from '../../lib/odds-v3/models/playerPerformanceModel.mjs';
import { PRICING_CONFIG } from '../../lib/engines/pricingConfig.mjs';

describe('Player milestone pricing', () => {
  it('orders milestone probabilities so higher targets are strictly less likely', () => {
    const tied = enforceMilestoneProbabilityOrdering([0.0001, 0.0001, 0.0001]);
    expect(tied[0]).toBeGreaterThan(tied[1]);
    expect(tied[1]).toBeGreaterThan(tied[2]);

    const raw = [
      calculatePlayerMilestoneProbability(8, 25, 108),
      calculatePlayerMilestoneProbability(8, 50, 108),
      calculatePlayerMilestoneProbability(8, 100, 108),
    ];
    const ordered = enforceMilestoneProbabilityOrdering(raw);
    expect(ordered[0]).toBeGreaterThanOrEqual(ordered[1]);
    expect(ordered[1]).toBeGreaterThan(ordered[2]);
  });

  it('caps extreme milestone yes odds and differentiates 50+ vs 100+', () => {
    const matchState = createCanonicalMatchState({
      matchId: 'milestone_cap_test',
      sport: 'CRICKET',
      format: 'T20',
      status: 'LIVE',
      team1: { id: 'T1', name: 'Team A', runs: 120, wickets: 6, balls: 102 },
      team2: { id: 'T2', name: 'Team B', runs: 8, wickets: 1, balls: 12 },
      currentInnings: 2,
      battingTeamId: 'T2',
      bowlingTeamId: 'T1',
      target: 121,
      runsRequired: 113,
      ballsPerInnings: 120,
      ballsCompleted: 12,
      ballsRemaining: 108,
      batter1: { name: 'S Prasath', runs: 8, balls: 10 },
      batter2: { name: 'Partner', runs: 0, balls: 2 },
      providerTimestamp: Date.now(),
      stateVersion: 1,
    });

    const snapshot = generate(matchState);
    const findYesOdds = (fragment) => {
      const market = snapshot.markets.find((m) => m.marketId.includes(fragment) && m.status === 'OPEN');
      expect(market).toBeDefined();
      const yes = market.selections.find((s) => s.name === 'Yes');
      expect(yes?.odds).toBeGreaterThan(1);
      return yes.odds;
    };

    const odds25 = findYesOdds('player_25');
    const odds50 = findYesOdds('player_50');
    const odds100 = findYesOdds('player_100');

    expect(odds25).toBeLessThanOrEqual(250);
    expect(odds50).toBeLessThanOrEqual(400);
    expect(odds100).toBeLessThanOrEqual(PRICING_CONFIG.MAX_ODDS);
    expect(odds25).toBeLessThan(odds50);
    expect(odds50).toBeLessThan(odds100);
    expect(odds100).toBeLessThanOrEqual(500);
  });
});
