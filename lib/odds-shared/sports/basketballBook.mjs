import { normalizeSportKey } from './normalizeSportKey.mjs';
import { readLiveScoreState } from './readLiveScoreState.mjs';
import { twoWayMarket } from './bookHelpers.mjs';

export function generateBasketballBook(match, { team1Name, team2Name, overround }) {
  const { score1, score2, live } = readLiveScoreState(match);
  const diff = score1 - score2;
  const spreadLine = Math.max(1.5, Math.abs(diff) + 3.5);
  const currentPts = score1 + score2;
  const sport = normalizeSportKey(match.sport);
  const isNfl = sport === 'american-football';
  const baseTotal = isNfl ? 44.5 : 214.5;
  const totalLine = live
    ? (isNfl
      ? Math.max(baseTotal, currentPts + 14.5)
      : Math.max(180.5, currentPts + 40.5))
    : baseTotal;
  const favoriteIsHome = diff >= 0;

  return [
    twoWayMarket({
      marketId: 'spread',
      marketType: 'SPREAD',
      name: 'Point Spread',
      category: 'spreads',
      line: spreadLine,
      left: { id: `Spread:1 -${spreadLine}`, name: `${team1Name} -${spreadLine}` },
      right: { id: `Spread:2 +${spreadLine}`, name: `${team2Name} +${spreadLine}` },
      pLeft: favoriteIsHome ? 0.52 : 0.48,
      overround,
    }),
    twoWayMarket({
      marketId: 'total_pts',
      marketType: 'TOTAL',
      name: 'Total Match Points',
      category: 'totals',
      line: totalLine,
      left: { id: `Points:Over ${totalLine}`, name: `Over ${totalLine}` },
      right: { id: `Points:Under ${totalLine}`, name: `Under ${totalLine}` },
      pLeft: 0.51,
      overround,
    }),
  ];
}
