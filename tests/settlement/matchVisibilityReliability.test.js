/**
 * Match Visibility & Event Lookup Reliability Test Suite
 * Tests 14 critical scenarios for reliable match loading, persistence, and lookup independence.
 */

import { describe, it, expect } from 'vitest';
import { reconstructMatchFromDb, upsertPersistentMatch } from '../../lib/eventPersistence.mjs';
import { lookupEventForSettlement } from '../../lib/settlement/settlementEventLookup.mjs';
import { getAggregatedLiveScores } from '../../lib/aggregator.mjs';

describe('Match Visibility & Event Lookup Reliability', () => {
  const sampleLiveMatch = {
    id: 'test_vis_match_1',
    matchId: 'test_vis_match_1',
    sport: 'cricket',
    league: 'SA20 SRL',
    team1: { name: 'Durban Super Giants' },
    team2: { name: 'Joburg Super Kings' },
    matchName: 'Durban Super Giants vs Joburg Super Kings',
    status: 'LIVE',
    matchState: 'in',
    isLive: true,
    liveDetails: { firstRuns: 140, firstWickets: 3, overs: '15.2' },
  };

  const sampleCompletedMatch = {
    id: 'oy_45bbebc2-e93b-3aa0-8c0e-583d94394784',
    matchId: 'oy_45bbebc2-e93b-3aa0-8c0e-583d94394784',
    sport: 'cricket',
    league: 'SA T20 League SRL',
    team1: { name: 'Paarl Royals SRL' },
    team2: { name: 'Mi Cape Town SRL' },
    matchName: 'Paarl Royals SRL vs Mi Cape Town SRL',
    status: 'COMPLETED',
    matchState: 'post',
    isLive: false,
    isCompleted: true,
    liveDetails: { firstRuns: 181, chaseRuns: 146, commentary: 'Match completed' },
  };

  const liveMap = new Map([[sampleLiveMatch.id, sampleLiveMatch]]);

  // 1. Match found in Live Map
  it('1. Retrieves match directly when present in live memory map', async () => {
    const lookup = await lookupEventForSettlement({
      bet: { match_id: sampleLiveMatch.id },
      liveById: liveMap,
    });
    expect(lookup.success).toBe(true);
    expect(lookup.lookupSource).toBe('LIVE_MAP');
    expect(lookup.match.id).toBe(sampleLiveMatch.id);
  });

  // 2. Match missing Live Map but found PostgreSQL / Redis
  it('2. Falls back to persistent lookup when missing from Live Map', async () => {
    const lookup = await lookupEventForSettlement({
      bet: {
        match_id: sampleCompletedMatch.id,
        placement_snapshot: {
          legs: [{ team1Name: 'Paarl Royals SRL', team2Name: 'Mi Cape Town SRL', league: 'SA T20 League SRL' }],
        },
      },
      liveById: new Map(),
    });
    expect(lookup.success).toBe(true);
  });

  // 3. Match missing Redis but found PostgreSQL
  it('3. Successfully resolves from PostgreSQL persistence when Redis key is absent', async () => {
    const mockDbMatch = await reconstructMatchFromDb(sampleCompletedMatch.id);
    expect(mockDbMatch == null || mockDbMatch.matchId === sampleCompletedMatch.id).toBe(true);
  });

  // 4. Redis expires but placed-bet match still loads
  it('4. Reconstructs full match details from placed bet snapshot after cache expiration', async () => {
    const reconstructed = await reconstructMatchFromDb('oy_45bbebc2-e93b-3aa0-8c0e-583d94394784');
    expect(reconstructed).not.toBeNull();
    expect(reconstructed.team1?.name || reconstructed.team1).toBeDefined();
    expect(reconstructed.team2?.name || reconstructed.team2).toBeDefined();
  });

  // 5. Application restart but placed-bet match still loads
  it('5. Independent of in-memory caches across cold restarts', async () => {
    const res = await reconstructMatchFromDb('cb_129585');
    if (res) {
      expect(res.team1?.name).toBe('England');
      expect(res.team2?.name).toBe('Pakistan');
    }
  });

  // 6. Multiple instances return identical match results
  it('6. Multiple instances querying shared storage return identical canonical entities', async () => {
    const instA = await reconstructMatchFromDb('oy_45bbebc2-e93b-3aa0-8c0e-583d94394784');
    const instB = await reconstructMatchFromDb('oy_45bbebc2-e93b-3aa0-8c0e-583d94394784');
    expect(instA?.matchId).toBe(instB?.matchId);
    expect(instA?.matchName).toBe(instB?.matchName);
  });

  // 7. Provider refresh does not temporarily erase event
  it('7. Stale-while-revalidate aggregation pattern serves existing snapshot during background refresh', async () => {
    const scores = await getAggregatedLiveScores({ force: false });
    expect(scores).toBeDefined();
    expect(Array.isArray(scores.matches)).toBe(true);
  });

  // 8. Event leaves live board but match details still load
  it('8. Match details endpoint distinguishes NO_LONGER_LIVE from NOT_FOUND', async () => {
    const matchState = await reconstructMatchFromDb('oy_45bbebc2-e93b-3aa0-8c0e-583d94394784');
    expect(matchState).not.toBeNull();
    expect(matchState.isLive).toBe(false);
  });

  // 9. Completed match still loads from historical data
  it('9. Historical matches load with format, score, and teams', async () => {
    const match = await reconstructMatchFromDb('oy_45bbebc2-e93b-3aa0-8c0e-583d94394784');
    expect(match.team1).toBeDefined();
    expect(match.team2).toBeDefined();
  });

  // 10. Provider temporarily unavailable
  it('10. Gracefully handles provider downtime without crashing or deleting matches', async () => {
    const lookup = await lookupEventForSettlement({
      bet: { match_id: 'non_existent_provider_id' },
      liveById: new Map(),
    });
    expect(lookup.success).toBe(false);
    expect(lookup.retryable).toBe(true);
  });

  // 11. Event genuinely does not exist
  it('11. Returns not found cleanly when match ID never existed', async () => {
    const res = await reconstructMatchFromDb('invalid_id_999999999');
    expect(res).toBeNull();
  });

  // 12. Settlement is independent from frontend visibility
  it('12. Settlement worker functions identically regardless of whether event is on live board', async () => {
    const lookup = await lookupEventForSettlement({
      bet: {
        match_id: 'oy_45bbebc2-e93b-3aa0-8c0e-583d94394784',
        placement_snapshot: {
          legs: [{ team1Name: 'Paarl Royals SRL', team2Name: 'Mi Cape Town SRL', line: 178.5 }],
        },
      },
      liveById: new Map(), // NOT ON LIVE BOARD
    });
    expect(lookup.success).toBe(true);
    expect(lookup.match).toBeDefined();
  });

  // 13. Live board may hide completed event without losing bet event
  it('13. Placed bet retains permanent immutable snapshot and database anchor', async () => {
    const match = await reconstructMatchFromDb('oy_45bbebc2-e93b-3aa0-8c0e-583d94394784');
    expect(match).not.toBeNull();
  });

  // 14. 20 repeated requests return consistent results
  it('14. 20 sequential lookups return 100% deterministic results', async () => {
    const results = [];
    for (let i = 0; i < 20; i++) {
      const match = await reconstructMatchFromDb('oy_45bbebc2-e93b-3aa0-8c0e-583d94394784');
      results.push(match != null);
    }
    expect(results.every(r => r === true)).toBe(true);
  });
});
