import { describe, it, expect } from 'vitest';
import { normalizeMatch, normalizeMatchScore } from '../src/utils/cricketMatchNormalizer.js';
import { resolveCricketTeamScores, teamNameMatches } from '../src/utils/cricketScores.js';

describe('CRITICAL CRICKET SCORE MAPPING & ROSTER DISPLAY FIX', () => {
  describe('1. Test Match Multi-Innings Ownership (Sussex vs Somerset)', () => {
    const rawTestMatch = {
      id: 'match_test_sus_som_101',
      sport: 'cricket',
      league: 'County Championship Division One',
      format: 'TEST',
      matchType: 'Test',
      isLive: true,
      team1: { id: 'team_sussex', name: 'Sussex', shortName: 'SUS' },
      team2: { id: 'team_somerset', name: 'Somerset', shortName: 'SOM' },
      liveDetails: {
        matchFormat: 'TEST',
        inningsId: 3,
        testInnings: [
          {
            inningsId: 1,
            inningsNum: 1,
            batTeamId: 'team_sussex',
            batTeam: 'Sussex',
            teamSName: 'SUS',
            runs: 202,
            wickets: 10,
            overs: '64.2',
          },
          {
            inningsId: 2,
            inningsNum: 1,
            batTeamId: 'team_somerset',
            batTeam: 'Somerset',
            teamSName: 'SOM',
            runs: 250,
            wickets: 10,
            overs: '82.1',
          },
          {
            inningsId: 3,
            inningsNum: 2,
            batTeamId: 'team_sussex',
            batTeam: 'Sussex',
            teamSName: 'SUS',
            runs: 256,
            wickets: 3,
            overs: '78.3',
          },
        ],
      },
    };

    it('should strictly map each innings to exactly ONE team (mutual exclusivity)', () => {
      const normalized = normalizeMatch(rawTestMatch);

      // Home (Sussex) should have exactly Innings 1 and Innings 3
      expect(normalized.homeTeam.innings).toHaveLength(2);
      expect(normalized.homeTeam.innings[0].inningsId).toBe(1);
      expect(normalized.homeTeam.innings[0].runs).toBe(202);
      expect(normalized.homeTeam.innings[0].wickets).toBe(10);
      expect(normalized.homeTeam.innings[1].inningsId).toBe(3);
      expect(normalized.homeTeam.innings[1].runs).toBe(256);
      expect(normalized.homeTeam.innings[1].wickets).toBe(3);

      // Away (Somerset) should have exactly Innings 2
      expect(normalized.awayTeam.innings).toHaveLength(1);
      expect(normalized.awayTeam.innings[0].inningsId).toBe(2);
      expect(normalized.awayTeam.innings[0].runs).toBe(250);
      expect(normalized.awayTeam.innings[0].wickets).toBe(10);

      // Verify no shared innings references
      const homeIds = normalized.homeTeam.innings.map((i) => i.inningsId);
      const awayIds = normalized.awayTeam.innings.map((i) => i.inningsId);
      expect(homeIds).not.toEqual(expect.arrayContaining(awayIds));
    });

    it('should display only ONE relevant/latest score per team for compact cards', () => {
      const normalized = normalizeMatch(rawTestMatch);

      // Compact score for Sussex = latest score (256/3)
      expect(normalized.homeTeam.latestScore).toBe('256/3');
      expect(normalized.homeTeam.score).toBe('256/3');
      expect(normalized.homeTeam.displayScore).toBe('256/3');

      // Compact score for Somerset = latest score (250/10)
      expect(normalized.awayTeam.latestScore).toBe('250/10');
      expect(normalized.awayTeam.score).toBe('250/10');
      expect(normalized.awayTeam.displayScore).toBe('250/10');

      // NEVER display combined string "202/10 & 250/10 & 256/3"
      expect(normalized.homeTeam.score).not.toContain('250/10');
      expect(normalized.awayTeam.score).not.toContain('202/10');
      expect(normalized.awayTeam.score).not.toContain('256/3');
    });

    it('should provide full innings summary for detailed match view', () => {
      const normalized = normalizeMatch(rawTestMatch);

      // Sussex 1st inns all out (202), 2nd inns (256/3) -> "202 & 256/3"
      expect(normalized.homeTeam.fullInningsSummary).toBe('202 & 256/3');
      // Somerset 1st inns (250)
      expect(normalized.awayTeam.fullInningsSummary).toBe('250');
    });

    it('should correctly identify active current innings (Sussex 3rd match innings, 256/3)', () => {
      const normalized = normalizeMatch(rawTestMatch);
      expect(normalized.currentInnings.matchInningsId).toBe(3);
      expect(normalized.currentInnings.batTeam).toBe('Sussex');
      expect(normalized.currentInnings.runs).toBe(256);
      expect(normalized.currentInnings.wickets).toBe(3);
      expect(normalized.currentInnings.overs).toBe('78.3');
    });

    it('should resolve scores identically via resolveCricketTeamScores for UI consumption', () => {
      const resolved = resolveCricketTeamScores(rawTestMatch, rawTestMatch.liveDetails);

      expect(resolved.team1.displayScore).toBe('256/3');
      expect(resolved.team2.displayScore).toBe('250/10');
      expect(resolved.team1.innings).toHaveLength(2);
      expect(resolved.team2.innings).toHaveLength(1);
    });
  });

  describe('2. Team Identification & Disambiguation (Prevent Initial Collisions)', () => {
    it('should NOT match Somerset with token SUS and vice-versa', () => {
      // Single-letter initial collision prevented
      expect(teamNameMatches('Sussex', 'SUS')).toBe(true);
      expect(teamNameMatches('Somerset', 'SUS')).toBe(false);
      expect(teamNameMatches('Somerset', 'SOM')).toBe(true);
      expect(teamNameMatches('Sussex', 'SOM')).toBe(false);
    });

    it('should correctly match multi-letter acronyms without false positives', () => {
      expect(teamNameMatches('Chennai Super Kings', 'CSK')).toBe(true);
      expect(teamNameMatches('Mumbai Indians', 'MI')).toBe(true);
      expect(teamNameMatches('Mumbai Indians', 'CSK')).toBe(false);
      expect(teamNameMatches('England', 'ENG')).toBe(true);
      expect(teamNameMatches('India', 'IND')).toBe(true);
      expect(teamNameMatches('India', 'ENG')).toBe(false);
    });
  });

  describe('3. ODI Format Scoring (50 Overs)', () => {
    const rawOdiMatch = {
      id: 'match_odi_ind_aus',
      sport: 'cricket',
      format: 'ODI',
      team1: { id: 'tm_ind', name: 'India', shortName: 'IND' },
      team2: { id: 'tm_aus', name: 'Australia', shortName: 'AUS' },
      liveDetails: {
        inningsId: 2,
        firstRuns: 320,
        firstWickets: 7,
        firstOvers: '50.0',
        firstTeamName: 'India',
        chaseRuns: 180,
        chaseWickets: 4,
        chaseOvers: '28.2',
        chaseTeamName: 'Australia',
      },
    };

    it('should map 1st innings to India and 2nd innings to Australia', () => {
      const normalized = normalizeMatch(rawOdiMatch);

      expect(normalized.homeTeam.latestScore).toBe('320/7');
      expect(normalized.homeTeam.overs).toBe('50.0');
      expect(normalized.awayTeam.latestScore).toBe('180/4');
      expect(normalized.awayTeam.overs).toBe('28.2');

      expect(normalized.homeTeam.innings).toHaveLength(1);
      expect(normalized.awayTeam.innings).toHaveLength(1);
    });
  });

  describe('4. T20 Format Scoring (1st Innings — Opponent Has Not Batted)', () => {
    const rawT20Match = {
      id: 'match_t20_csk_mi',
      sport: 'cricket',
      format: 'T20',
      team1: { id: 'tm_csk', name: 'Chennai Super Kings', shortName: 'CSK' },
      team2: { id: 'tm_mi', name: 'Mumbai Indians', shortName: 'MI' },
      liveDetails: {
        inningsId: 1,
        firstRuns: 185,
        firstWickets: 5,
        firstOvers: '20.0',
        firstTeamName: 'Chennai Super Kings',
      },
    };

    it('should show CSK score and "—" for MI (never duplicate or copy opponent score)', () => {
      const normalized = normalizeMatch(rawT20Match);

      expect(normalized.homeTeam.latestScore).toBe('185/5');
      expect(normalized.homeTeam.hasBatted).toBe(true);

      expect(normalized.awayTeam.latestScore).toBe('—');
      expect(normalized.awayTeam.hasBatted).toBe(false);
      expect(normalized.awayTeam.innings).toHaveLength(0);

      const resolved = resolveCricketTeamScores(rawT20Match, rawT20Match.liveDetails);
      expect(resolved.team1.displayScore).toBe('185/5');
      expect(resolved.team2.displayScore).toBe('');
    });
  });

  describe('5. T10 Format Scoring (10 Overs Completed)', () => {
    const rawT10Match = {
      id: 'match_t10_ad_del',
      sport: 'cricket',
      format: 'T10',
      team1: { id: 'tm_ad', name: 'Team Abu Dhabi', shortName: 'TAD' },
      team2: { id: 'tm_del', name: 'Delhi Bulls', shortName: 'DB' },
      liveDetails: {
        inningsId: 2,
        firstRuns: 110,
        firstWickets: 3,
        firstOvers: '10.0',
        firstTeamName: 'Team Abu Dhabi',
        chaseRuns: 112,
        chaseWickets: 2,
        chaseOvers: '8.4',
        chaseTeamName: 'Delhi Bulls',
      },
    };

    it('should map T10 innings accurately', () => {
      const normalized = normalizeMatch(rawT10Match);
      expect(normalized.homeTeam.latestScore).toBe('110/3');
      expect(normalized.awayTeam.latestScore).toBe('112/2');
    });
  });

  describe('6. 4-Innings Full Test Match', () => {
    const raw4InnMatch = {
      id: 'match_test_ind_eng_4inn',
      sport: 'cricket',
      format: 'TEST',
      team1: { id: 'tm_eng', name: 'England', shortName: 'ENG' },
      team2: { id: 'tm_ind', name: 'India', shortName: 'IND' },
      liveDetails: {
        matchFormat: 'TEST',
        inningsId: 4,
        testInnings: [
          { inningsId: 1, batTeamId: 'tm_eng', batTeam: 'England', runs: 350, wickets: 10, overs: '102.4' },
          { inningsId: 2, batTeamId: 'tm_ind', batTeam: 'India', runs: 300, wickets: 10, overs: '90.0' },
          { inningsId: 3, batTeamId: 'tm_eng', batTeam: 'England', runs: 220, wickets: 8, overs: '60.0', declared: true },
          { inningsId: 4, batTeamId: 'tm_ind', batTeam: 'India', runs: 195, wickets: 4, overs: '55.2' },
        ],
      },
    };

    it('should cleanly split 4 innings: England has inn 1 & 3, India has inn 2 & 4', () => {
      const normalized = normalizeMatch(raw4InnMatch);

      expect(normalized.homeTeam.innings).toHaveLength(2);
      expect(normalized.homeTeam.innings[0].runs).toBe(350);
      expect(normalized.homeTeam.innings[1].runs).toBe(220);
      expect(normalized.homeTeam.innings[1].declared).toBe(true);
      expect(normalized.homeTeam.latestScore).toBe('220/8d');
      expect(normalized.homeTeam.fullInningsSummary).toBe('350 & 220/8d');

      expect(normalized.awayTeam.innings).toHaveLength(2);
      expect(normalized.awayTeam.innings[0].runs).toBe(300);
      expect(normalized.awayTeam.innings[1].runs).toBe(195);
      expect(normalized.awayTeam.latestScore).toBe('195/4');
      expect(normalized.awayTeam.fullInningsSummary).toBe('300 & 195/4');

      expect(normalized.currentInnings.batTeam).toBe('India');
      expect(normalized.currentInnings.runs).toBe(195);
      expect(normalized.currentInnings.wickets).toBe(4);
      expect(normalized.currentInnings.isChase).toBe(true);
    });
  });
});
