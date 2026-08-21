import { betPlacementEngine } from '../lib/betPlacementEngine.mjs';
import { buildMatchOddsPayload } from '../lib/liveScoresApiHandlers.mjs';

const userId = 'usr_1786983155547_36670c3f';
const live = await (await fetch('http://localhost:5001/api/live-scores')).json();
const m = live.matches.find((x) => x.isLive && x.sport === 'cricket') || live.matches.find((x) => x.isLive);
const snap = await buildMatchOddsPayload({ matchId: m.id, force: true });
const market = (snap.markets || []).find((mk) => (mk.selections || []).some((s) => Number(s.odds) > 1.01));
const opt = (market?.selections || []).find((s) => Number(s.odds) > 1.01);

console.log('using', m.id, market?.marketId, opt?.selectionId, opt?.odds);

// 1-leg multi shape (the previous bug)
try {
  const r = await betPlacementEngine.placeBet({
    userId,
    stake: 10,
    fundSource: 'cash',
    idempotencyKey: `fix-multi1-${Date.now()}`,
    selections: [{
      matchId: m.id,
      marketId: market.marketId,
      selectionId: opt.selectionId,
      odds: opt.odds,
    }],
  });
  console.log('MULTI1_OK', r.betId, r.status);
} catch (e) {
  console.log('MULTI1_FAIL', e.message);
}

// classic card shape 1/2 + match_winner
try {
  const r = await betPlacementEngine.placeBet({
    userId,
    matchId: m.id,
    marketId: 'match_winner',
    selectionId: '1',
    stake: 10,
    clientOdds: opt.odds,
    fundSource: 'cash',
    idempotencyKey: `fix-alias-${Date.now()}`,
  });
  console.log('ALIAS_OK', r.betId, r.status, r.odds);
} catch (e) {
  console.log('ALIAS_FAIL', e.message);
}

process.exit(0);
