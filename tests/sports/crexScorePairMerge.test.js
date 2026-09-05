import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { parseCrexLiveCards } from '../../lib/crexCricketProvider.mjs';
import { getMatchPairKeyCandidates } from '../../lib/matchPairKey.mjs';

const CREX_MUT_IAI_CARD = `
<a href="/cricket-live-score/iai-vs-mut-9th-match-oman-d50-league-2026-match-updates-13RL">
  <div class="live-card-middle">
    <div class="match-number">9th One Day, Al Amerat</div>
    <div class="team-score live-d">
      <span class="team-name">MUT</span>
      <span class="">187</span>
      <span class="match-over">48.5</span>
    </div>
    <div class="team-score">
      <span class="team-name">IAI</span>
      <span class="inning-active">33-1</span>
      <span class="match-over">6.3</span>
    </div>
    <span class="comment">155 runs needed in 261 balls</span>
  </div>
</a>
`;

describe('CREX live score parse + short-code pair merge', () => {
  it('parses MUT/IAI team blocks with chase fields (not scrambled overs)', () => {
    const [match] = parseCrexLiveCards(CREX_MUT_IAI_CARD);
    expect(match).toBeTruthy();
    expect(match.crexEventId).toBe('13RL');
    expect(match.score1).toBe(187);
    expect(match.score2).toBe(33);
    expect(match.liveDetails.firstRuns).toBe(187);
    expect(match.liveDetails.firstWickets).toBe(10);
    expect(match.liveDetails.firstOvers).toBe('48.5');
    expect(match.liveDetails.chaseRuns).toBe(33);
    expect(match.liveDetails.chaseWickets).toBe(1);
    expect(match.liveDetails.chaseOvers).toBe('6.3');
    expect(match.liveDetails.inningsId).toBe(2);
    expect(match.liveDetails.overs2).toBe('6.3');
  });

  it('links CREX short codes to FanCode full names via shortName candidates', () => {
    const crex = {
      team1: { name: 'MUT', shortName: 'MUT' },
      team2: { name: 'IAI', shortName: 'IAI' },
    };
    const fancode = {
      team1: { name: 'Muscat Thunders', shortName: 'MUT' },
      team2: { name: 'IAS Invincibles', shortName: 'IAI' },
    };
    const crexKeys = getMatchPairKeyCandidates(crex);
    const fcKeys = getMatchPairKeyCandidates(fancode);
    const overlap = crexKeys.filter((k) => fcKeys.includes(k));
    expect(overlap.some((k) => k.startsWith('m|short|'))).toBe(true);
  });

  it('parses live CREX homepage sample when available', () => {
    let html = '';
    try {
      html = readFileSync('/tmp/crex.html', 'utf8');
    } catch {
      return;
    }
    if (!html.includes('13RL')) return;
    const match = parseCrexLiveCards(html).find((m) => m.crexEventId === '13RL');
    expect(match).toBeTruthy();
    expect(Number(match.liveDetails.chaseRuns || match.score2)).toBeGreaterThan(2);
    expect(match.liveDetails.inningsId).toBe(2);
  });
});
