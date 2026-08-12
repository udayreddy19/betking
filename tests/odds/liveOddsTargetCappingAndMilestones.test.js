import { describe, it, expect } from 'vitest';
import { generate } from '../../lib/odds-v3/OddsEngineV3.mjs';
import { createCanonicalMatchState } from '../../lib/odds-v3/models/CanonicalMatchState.mjs';

describe('OddsEngineV3 — Target Capping & Market Pricing Integrity', () => {
  it('strictly caps Total Match Runs line by target score in 2nd Innings', () => {
    // Exact match state from user screenshot:
    // Oval Invincibles 142/5 (100 balls), Trent Rockets 98/3 (58 balls), Target 143
    const matchState = createCanonicalMatchState({
      matchId: 'cric_hundred_m_test',
      sport: 'CRICKET',
      format: 'THE_HUNDRED',
      status: 'LIVE',
      team1: { id: 'OVI', name: 'Oval Invincibles', runs: 142, wickets: 5, balls: 100 },
      team2: { id: 'TRT', name: 'Trent Rockets', runs: 98, wickets: 3, balls: 58 },
      currentInnings: 2,
      battingTeamId: 'TRT',
      bowlingTeamId: 'OVI',
      target: 143,
      runsRequired: 45,
      ballsPerInnings: 100,
      ballsCompleted: 58,
      ballsRemaining: 42,
      batter1: { name: 'Alex Hales', runs: 58 },
      batter2: { name: 'Tom Banton', runs: 34 },
      providerTimestamp: Date.now(),
      stateVersion: 1,
    });

    const snapshot = generate(matchState, { debug: true });
    expect(snapshot.status).toBe('OK');
    expect(snapshot.markets.length).toBeGreaterThan(0);

    // 1. Verify Match Total line does not exceed 287.5 runs (142 + 143 + 2.5 max overshoot)
    const matchTotalMarket = snapshot.markets.find((m) => m.marketId === 'match_total');
    expect(matchTotalMarket).toBeDefined();
    expect(matchTotalMarket.line).toBeLessThanOrEqual(287.5);

    // 2. Verify Chasing Team Total line does not exceed 145.5
    const teamTotalMarket = snapshot.markets.find((m) => m.marketId === 'team_total');
    expect(teamTotalMarket).toBeDefined();
    expect(teamTotalMarket.line).toBeLessThanOrEqual(145.5);

    // 3. Verify Innings Title Mismatch: 2nd Innings player props use "2nd Innings" label
    const alexHales25Market = snapshot.markets.find((m) => m.marketId.includes('player_25_alex_hales'));
    expect(alexHales25Market).toBeDefined();
    expect(alexHales25Market.name).toContain('2nd Innings');
    // Alex Hales is on 58 runs, so 25+ milestone is DETERMINED / SETTLED
    expect(alexHales25Market.status).toBe('DETERMINED');

    // 4. Verify Powerplay (Overs 0-5) market is filtered out since ballsCompleted (58) > 30
    const powerplayMarket = snapshot.markets.find((m) => m.marketId === 'overs_0_5_total');
    expect(powerplayMarket).toBeUndefined();
  });
});
