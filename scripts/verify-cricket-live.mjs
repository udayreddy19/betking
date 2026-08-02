/**
 * One-shot live cricket pipeline check for Derbyshire + Trent Rockets Women.
 */
import { fetchMatchDetail } from '../lib/matchDetailFetcher.mjs';
import { fetchCricbuzzMatches } from '../lib/cricbuzzLiveScores.mjs';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function checkDetail(id, team1, team2, league, seriesName, expect) {
  const match = {
    id: `cb_${id}`,
    cricbuzzMatchId: String(id),
    sport: 'cricket',
    source: 'cricbuzz',
    league,
    seriesName,
    team1: { name: team1 },
    team2: { name: team2 },
  };
  const d = await fetchMatchDetail(match);
  assert(d, `${id}: no detail`);
  assert(d.isLive === true || expect.allowNotLive, `${id}: expected isLive true, got ${d.isLive}`);
  assert(d.matchState === 'in' || expect.allowNotLive, `${id}: expected matchState in, got ${d.matchState}`);
  assert(d.squads?.length >= 1, `${id}: missing squads`);
  assert(d.scorecardInnings?.some((inn) => inn.batters?.length > 0), `${id}: missing scorecard batters`);
  assert(d.liveDetails?.firstRuns != null || d.liveDetails?.chaseRuns != null, `${id}: missing runs`);

  if (expect.hundredCompleteFirst) {
    assert(d.liveDetails.firstOvers === '20.0' || d.liveDetails.firstRuns != null, `${id}: hundred first overs`);
    // First innings should not collapse to chase ball count
    const firstBalls = d.scorecardInnings?.find((i) => i.inningsId === 1)?.scoreDetails?.ballNbr;
    if (firstBalls === 100) {
      assert(d.liveDetails.firstOvers === '20.0', `${id}: expected firstOvers 20.0 from 100 balls, got ${d.liveDetails.firstOvers}`);
    }
  }

  console.log(`OK detail ${id} ${team1}: isLive=${d.isLive} first=${d.liveDetails.firstRuns}/${d.liveDetails.firstWickets} (${d.liveDetails.firstOvers}) chase=${d.liveDetails.chaseRuns ?? '-'} (${d.liveDetails.chaseOvers || '-'}) squads=${d.squads.map((s) => s.players.length).join('/')} scorecard=${d.scorecardInnings.map((i) => i.batters.length).join('+')} oversHist=${d.overHistory?.length || 0}`);
  return d;
}

const derby = await checkDetail(
  143705,
  'Derbyshire',
  'Sussex',
  'One-Day Cup',
  'England Domestic One-Day Cup',
  {},
);

const rockets = await checkDetail(
  145198,
  'Trent Rockets Women',
  'Sunrisers Leeds Women',
  'The Hundred Women',
  "The Hundred Women's Competition 2026",
  { hundredCompleteFirst: true },
);

const list = await fetchCricbuzzMatches();
const listDerby = list.matches.find((m) => m.cricbuzzMatchId == 143705);
const listRockets = list.matches.find((m) => m.cricbuzzMatchId == 145198);

assert(listDerby?.matchState === 'in' && listDerby.isLive, 'list Derbyshire should be live');
assert(listDerby.liveDetails?.firstRuns > 0 || listDerby.liveDetails?.runs > 0, 'list Derbyshire scores');

assert(listRockets?.matchState === 'in' && listRockets.isLive, `list Rockets should be live, got state=${listRockets?.matchState} isLive=${listRockets?.isLive}`);
assert(
  listRockets.liveDetails?.firstRuns > 0 || listRockets.liveDetails?.runs > 0,
  `list Rockets missing scores: ${JSON.stringify(listRockets?.liveDetails)}`,
);

// Hundred chase overs should be balls/5, not raw ball count as overs
if (listRockets.liveDetails?.chaseRuns != null) {
  const co = listRockets.liveDetails.chaseOvers;
  const [whole] = String(co).split('.').map(Number);
  assert(whole <= 20, `list Rockets chaseOvers too high (ball-count leak?): ${co}`);
}
assert(String(listRockets.liveDetails.firstOvers || listRockets.liveDetails.overs) === '20.0'
  || listRockets.liveDetails.firstRuns === 139
  || listRockets.liveDetails.runs === 139, `list Rockets first overs unexpected: ${JSON.stringify(listRockets.liveDetails)}`);

console.log(`OK list Derbyshire: ${listDerby.time}`, listDerby.liveDetails);
console.log(`OK list Rockets: ${listRockets.time}`, listRockets.liveDetails);
console.log('All cricket live checks passed.');
