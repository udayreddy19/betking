import { describe, it, expect, beforeEach } from 'vitest';
import { liveScoreSequenceEngine } from '../../lib/liveScoreSequenceEngine.mjs';
import { sportsDataRegistry } from '../../lib/sportsDataRegistry.mjs';

describe('Phase 3 Live Score Ordering & Idempotency Tests', () => {
  const matchId = 'match_seq_test_101';

  beforeEach(() => {
    sportsDataRegistry.clear();
    sportsDataRegistry.registerMatch({
      id: matchId,
      homeTeam: { name: 'India' },
      awayTeam: { name: 'Pakistan' },
      liveScore: { runs: 120, wickets: 3, overs: 15.0, currentInnings: 1 },
    }, 'cricbuzz');
  });

  it('should accept valid score progression within active innings', () => {
    const res = liveScoreSequenceEngine.processLiveScoreUpdate(matchId, {
      runs: 126, wickets: 3, overs: 15.4, currentInnings: 1,
    });

    expect(res.success).toBe(true);
    expect(res.isRegression).toBe(false);
    expect(res.match.liveScore.runs).toBe(126);
  });

  it('CRITICAL: out-of-order score regression (118/4 after 120/3) must be REJECTED', () => {
    const res = liveScoreSequenceEngine.processLiveScoreUpdate(matchId, {
      runs: 118, wickets: 4, overs: 14.5, currentInnings: 1,
    });

    expect(res.success).toBe(false);
    expect(res.isRegression).toBe(true);
    expect(res.reason).toContain('Out-of-order score regression rejected');

    // Verify canonical state was NOT moved backwards
    const updated = sportsDataRegistry.getMatch(matchId);
    expect(updated.liveScore.runs).toBe(120);
  });

  it('should ignore duplicate live score events idempotently', () => {
    const scorePayload = { runs: 135, wickets: 4, overs: 16.2, currentInnings: 1 };
    
    const first = liveScoreSequenceEngine.processLiveScoreUpdate(matchId, scorePayload);
    expect(first.success).toBe(true);
    expect(first.isDuplicate).toBe(false);

    const duplicate = liveScoreSequenceEngine.processLiveScoreUpdate(matchId, scorePayload);
    expect(duplicate.success).toBe(true);
    expect(duplicate.isDuplicate).toBe(true);
  });
});
