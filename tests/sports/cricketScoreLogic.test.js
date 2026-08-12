import { describe, it, expect } from 'vitest';
import { liveScoreSequenceEngine } from '../../lib/liveScoreSequenceEngine.mjs';
import { sportsDataRegistry } from '../../lib/sportsDataRegistry.mjs';

describe('Phase 3 Cricket & 5-Day Test Match Scoring Logic Tests', () => {
  const testMatchId = 'match_test_cricket_404';

  it('should process 5-Day Test Cricket match state, sessions, and lead/trail calculation', () => {
    sportsDataRegistry.clear();
    sportsDataRegistry.registerMatch({
      id: testMatchId,
      homeTeam: { name: 'England' },
      awayTeam: { name: 'India' },
      league: { name: 'ICC World Test Championship' },
      liveScore: { runs: 325, wickets: 10, overs: 98.4, currentInnings: 1 },
    }, 'cricbuzz');

    // Second innings update (India batting in 2nd innings of match, 1st innings of India)
    const update = liveScoreSequenceEngine.processLiveScoreUpdate(testMatchId, {
      isTestMatch: true,
      dayNumber: 3,
      session: 'AFTERNOON',
      currentInnings: 2,
      runs: 210,
      wickets: 4,
      overs: 65.0,
      score2: 325, // England 1st innings
    });

    expect(update.success).toBe(true);
    expect(update.match.liveScore.isTestMatch).toBe(true);
    expect(update.match.liveScore.dayNumber).toBe(3);
    expect(update.match.liveScore.session).toBe('AFTERNOON');
    expect(update.match.liveScore.leadOrTrail).toBe('TRAIL');
    expect(update.match.liveScore.leadRuns).toBe(115);
  });
});
