import { describe, it, expect } from 'vitest';
import { parseFlashscoreFeed, mapFlashscoreEvent } from '../../lib/providers/flashscoreProvider.mjs';

const SNOOKER_FEED = [
  'SA÷15¬',
  'ZA÷UNITED KINGDOM: British Open¬ZL÷/snooker/united-kingdom/british-open/¬',
  'AA÷bTd3NrBG¬AD÷1788609600¬AB÷1¬AE÷Selby M.¬AF÷Highfield L.¬WM÷SEL¬WN÷HIG¬',
  'AA÷hillJones¬AD÷1788516000¬AB÷3¬AC÷9¬AE÷Hill, Aaron¬AF÷Jones, Jak¬AG÷3¬AH÷5¬AS÷2¬AZ÷2¬WM÷HIL¬WN÷JON¬',
].join('~');

const SOCCER_LIVE = [
  'ZA÷AUSTRALIA: NPL¬',
  'AA÷kah1¬AB÷2¬AC÷38¬AE÷Kahibah¬AF÷Newcastle Croatia¬AG÷2¬AH÷1¬',
].join('~');

describe('Flashscore feed parser', () => {
  it('maps scheduled snooker and finished winner from AS/scores', () => {
    const matches = parseFlashscoreFeed(SNOOKER_FEED, { sport: 'snooker' });
    expect(matches).toHaveLength(2);
    expect(matches[0].team1.name).toBe('Selby M.');
    expect(matches[0].isLive).toBe(false);
    expect(matches[0].isCompleted).toBe(false);
    expect(matches[0].status).toBe('SCHEDULED');
    expect(matches[0].league).toMatch(/British Open/);

    const qf = matches[1];
    expect(qf.id).toBe('fs_hillJones');
    expect(qf.source).toBe('flashscore');
    expect(qf.isCompleted).toBe(true);
    expect(qf.winnerSide).toBe('2');
    expect(qf.score1).toBe(3);
    expect(qf.score2).toBe(5);
    expect(qf.flashscoreUrl).toContain('/match/hillJones/');
  });

  it('maps live soccer minute and score', () => {
    const [match] = parseFlashscoreFeed(SOCCER_LIVE, { sport: 'soccer' });
    expect(match.isLive).toBe(true);
    expect(match.matchState).toBe('in');
    expect(match.liveDetails.score1).toBe(2);
    expect(match.liveDetails.score2).toBe(1);
    expect(match.liveDetails.commentary).toBe("38'");
  });

  it('treats AS=0 as a draw', () => {
    const match = mapFlashscoreEvent({
      AA: 'draw1',
      AB: '3',
      AE: 'Belgrano',
      AF: 'Huracan',
      AG: '1',
      AH: '1',
      AS: '0',
      AZ: '0',
    }, { sport: 'soccer', league: 'Argentina' });
    expect(match.winnerSide).toBe('X');
    expect(match.isCompleted).toBe(true);
  });
});
