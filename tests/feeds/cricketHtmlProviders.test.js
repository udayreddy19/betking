import { describe, it, expect } from 'vitest';
import { parseCrexHtml, parseCrexLiveCards } from '../../lib/crexCricketProvider.mjs';
import { parseCricketGuruHtml, mapGuruMatch } from '../../lib/providers/cricketGuruProvider.mjs';
import { parseCricketLivelineHtml } from '../../lib/providers/cricketLivelineProvider.mjs';

const CREX_HTML = `
<script type="application/ld+json" id="collection-schema">{"@context":"https://schema.org","@type":"CollectionPage","mainEntity":{"@type":"ItemList","itemListElement":[{"@type":"ListItem","item":{"@type":"SportsEvent","name":"Oman vs Kuwait","url":"https://crex.com/cricket-live-score/kuw-vs-oma-13th-match-updates-13MX","competitor":[{"@type":"SportsTeam","name":"Oman"},{"@type":"SportsTeam","name":"Kuwait"}]}}]}}</script>
<a href="/cricket-live-score/kuw-vs-oma-13th-match-asian-mens-premier-cup-2026-match-updates-13MX"><div class="live-card-middle"><span class="liveTag"> Live </span><span class="team-name">OMA</span><span class="inning-active">  252-8 </span><span class="match-over"> 50.0 </span><span class="team-name">KUW</span><span class="match-over"> Yet to bat </span><span class="comment">Innings Break </span></div></a>
`;

const GURU_HTML = `
<script id="clg-state" type="application/json">{&q;/api/v3/match/home/web&q;:{&q;status&q;:1,&q;res&q;:{&q;m&q;:[{&q;id&q;:&q;g88&q;,&q;t1n&q;:&q;Oman&q;,&q;t2n&q;:&q;Kuwait&q;,&q;s1&q;:&q;252-8&q;,&q;st&q;:&q;live&q;,&q;stt&q;:&q;Innings Break&q;,&q;sn&q;:&q;ACC Premier Cup&q;}]}}}</script>
<a class="match-card" href="/match/9001"><span class="team-name">Malaysia</span><span class="score">2-1</span><span class="team-name">Hong Kong</span><span class="score">209-10</span><span class="status">Malaysia need 208</span></a>
`;

const CRIX_HTML = `
<a href="/match/1002728" class="hero-card">
  <div class="hero-card-series">ACC Mens Premier Cup &middot; ODI</div>
  <span class="hero-team-name">Kuwait</span>
  <span class="hero-score">&mdash;</span>
  <span class="hero-team-name">Oman</span>
  <span class="hero-score">252-8</span>
  <span class="hero-overs">(50)</span>
  <div class="hero-status">Innings Break</div>
</a>
<a href="/match/1002730" class="home-match-row stagger-item">
  <span class="hmr-name">Fazilka Falcons</span>
  <span class="hmr-name">Bathinda Royals</span>
  <span class="hmr-series">Sher E Punjab T20</span>
  <span class="hmr-time">05 Sep 2026</span>
</a>
`;

describe('CREX HTML provider', () => {
  it('maps live card scores and JSON-LD team names', () => {
    const cards = parseCrexLiveCards(CREX_HTML);
    expect(cards[0].id).toBe('crex_13MX');
    expect(cards[0].isLive).toBe(true);
    expect(cards[0].liveDetails.runs).toBe(252);
    expect(cards[0].liveDetails.wickets).toBe(8);

    const merged = parseCrexHtml(CREX_HTML);
    expect(merged).toHaveLength(1);
    expect(merged[0].team1.name).toMatch(/Oman|OMA/);
    expect(merged[0].source).toBe('crex');
  });
});

describe('Cricket Guru provider', () => {
  it('reads clg-state and HTML cards', () => {
    const mapped = mapGuruMatch({ id: 'x', t1n: 'India', t2n: 'Sri Lanka', s1: '180-4', st: 'live' });
    expect(mapped.id).toBe('guru_x');
    expect(mapped.liveDetails.runs).toBe(180);

    const matches = parseCricketGuruHtml(GURU_HTML);
    const ids = matches.map((m) => m.id);
    expect(ids).toContain('guru_g88');
    expect(ids).toContain('guru_9001');
    const oman = matches.find((m) => m.id === 'guru_g88');
    expect(oman.league).toBe('ACC Premier Cup');
    expect(oman.isLive).toBe(true);
  });
});

describe('Cricket Liveline / CRIX provider', () => {
  it('parses hero live cards and upcoming rows', () => {
    const matches = parseCricketLivelineHtml(CRIX_HTML);
    expect(matches).toHaveLength(2);
    const live = matches.find((m) => m.id === 'crix_1002728');
    expect(live.source).toBe('cricketliveline');
    expect(live.team1.name).toBe('Kuwait');
    expect(live.team2.name).toBe('Oman');
    expect(live.liveDetails.score2).toBe(252);
    expect(live.isLive).toBe(true);
    const up = matches.find((m) => m.id === 'crix_1002730');
    expect(up.matchState).toBe('pre');
    expect(up.team1.name).toBe('Fazilka Falcons');
  });
});
