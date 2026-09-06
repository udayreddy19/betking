import { describe, it, expect } from 'vitest';
import { createCanonicalMatchState } from '../../lib/odds-v3/models/CanonicalMatchState.mjs';
import {
  generateExtendedMatchTotals,
  currentMatchWickets,
  estimateExpectedMatchWickets,
} from '../../lib/odds-v3/markets/matchTotals.mjs';
import { getFormatRules } from '../../lib/odds-v3/format/CricketFormatRules.mjs';

describe('Total Match Wickets — live pricing', () => {
  it('counts 10 + 2 = 12 live wickets', () => {
    expect(currentMatchWickets({
      team1: { wickets: 10 },
      team2: { wickets: 2 },
    }, 10)).toBe(12);
  });

  it('prices from live wickets mid-chase (SAU/NEP-style 10+2) — line tracks projection', () => {
    // SAU 190 all out, NEP 42/2 in 11.2 of 50 — must not ignore the 12 already down.
    const state = createCanonicalMatchState({
      matchId: 'sau_nep_live',
      sport: 'CRICKET',
      format: 'ODI',
      status: 'LIVE',
      team1: { id: 'SAU', name: 'Saudi Arabia', runs: 190, wickets: 10, balls: 300 },
      team2: { id: 'NEP', name: 'Nepal', runs: 42, wickets: 2, balls: 68 },
      currentInnings: 2,
      battingTeamId: 'NEP',
      bowlingTeamId: 'SAU',
      target: 191,
      runsRequired: 149,
      ballsPerInnings: 300,
      ballsCompleted: 68,
      ballsRemaining: 232,
      providerTimestamp: Date.now(),
      stateVersion: 1,
    });

    const rules = getFormatRules('ODI');
    const live = currentMatchWickets(state, rules.maxWickets);
    expect(live).toBe(12);
    const expected = estimateExpectedMatchWickets(state, rules, live);
    expect(expected).toBeGreaterThan(13);

    const market = generateExtendedMatchTotals(state).find((m) => m.marketId === 'total_match_wickets');
    expect(market).toBeTruthy();
    expect(market.status).toBe('OPEN');
    expect(market.line).toBeGreaterThan(12.5);
    expect(market.line).toBeGreaterThan(live);

    const over = market.selections.find((s) => s.selectionId === 'sel_wkt_over');
    const under = market.selections.find((s) => s.selectionId === 'sel_wkt_under');
    expect(over?.odds).toBeGreaterThan(1);
    expect(under?.odds).toBeGreaterThan(1);
    // Near projected line both sides stay bettable (not the old ~1.42/1.46 on a dead 12.5).
    expect(Math.abs(over.odds - under.odds)).toBeLessThan(2);
  });

  it('keeps Under priced when 19 wickets down and few balls left (line moves above live)', () => {
    const state = createCanonicalMatchState({
      matchId: 'wkt_locked',
      sport: 'CRICKET',
      format: 'T20',
      status: 'LIVE',
      team1: { id: 'A', name: 'A', runs: 160, wickets: 10, balls: 120 },
      team2: { id: 'B', name: 'B', runs: 80, wickets: 9, balls: 110 },
      currentInnings: 2,
      battingTeamId: 'B',
      bowlingTeamId: 'A',
      target: 161,
      runsRequired: 81,
      ballsPerInnings: 120,
      ballsCompleted: 110,
      ballsRemaining: 10,
      providerTimestamp: Date.now(),
      stateVersion: 1,
    });

    // 19 wickets live with almost no balls left → line floors at live+0.5 then settle if crossed
    // Force settle path: live already above a low fixed expectation by having 19 wkts.
    const market = generateExtendedMatchTotals(state).find((m) => m.marketId === 'total_match_wickets');
    expect(market.line).toBeGreaterThan(19);
    // With 19 live and line = 19.5, market stays OPEN until 20th wicket.
    expect(market.status).toBe('OPEN');
    const under = market.selections.find((s) => s.selectionId === 'sel_wkt_under');
    // Under only wins if zero more wickets in 10 balls — should be short-ish / competitive
    expect(under.odds).toBeGreaterThan(1);
  });
});
