/**
 * Attach V4-priced card markets onto OddsYra SRL match objects for Sports / SRL UI.
 */

import { buildCanonicalFromMatch } from './odds-v3/buildCanonicalFromMatch.mjs';
import { generateMatchTotalMarket } from './odds-v3/markets/MatchTotalMarket.mjs';
import { SRL_MARGIN_CONFIG } from './odds-v3/pricing/MarginCalculator.mjs';
import { generateMatchWinnerMarketV4 } from './odds-v4/markets/MatchWinnerMarketV4.mjs';
import { generateTossFamilyMarketsV4 } from './odds-v4/markets/TossWinnerMarketV4.mjs';

function pickSel(market, pred) {
  return (market?.selections || []).find(pred) || null;
}

/**
 * @param {object} match
 * @returns {object}
 */
export function enrichIplSrlMatchCard(match) {
  if (!match?.team1?.id && !match?.team1?.key) return match;
  if (match.team1?.key === 'tbd' || match.teamsLocked === false) return match;

  try {
    const state = buildCanonicalFromMatch(match);
    const margins = { ...SRL_MARGIN_CONFIG };
    const card = [];

    const mw = generateMatchWinnerMarketV4(state, {}, margins);
    if (mw?.status === 'OPEN') card.push(mw);

    for (const m of generateTossFamilyMarketsV4(state, {}, margins)) {
      if (m.status === 'OPEN' || m.status === 'SETTLED') card.push(m);
    }

    const mt = generateMatchTotalMarket(state, {}, margins);
    if (mt?.status === 'OPEN') card.push(mt);

    const openCard = card.filter((m) => m.status === 'OPEN');
    const next = { ...match, engineCardMarkets: openCard };

    const mwOpen = openCard.find((m) => m.marketId === 'match_winner');
    if (mwOpen?.selections?.length >= 2) {
      const o1 = Number(mwOpen.selections[0].odds);
      const o2 = Number(mwOpen.selections[1].odds);
      if (o1 > 1 && o2 > 1) {
        next.odds = {
          ...(match.odds || {}),
          team1: o1,
          team2: o2,
          home: o1,
          away: o2,
        };
      }
    }

    const total = openCard.find((m) => m.marketId === 'match_total');
    if (total?.line != null) {
      const over = pickSel(total, (s) => /^over$/i.test(String(s.name)));
      const under = pickSel(total, (s) => /^under$/i.test(String(s.name)));
      next.srlMarkets = {
        totalRuns: total.line,
        overOdds: Number(over?.odds) > 1 ? Number(over.odds) : match.srlMarkets?.overOdds,
        underOdds: Number(under?.odds) > 1 ? Number(under.odds) : match.srlMarkets?.underOdds,
      };
    }

    next.extraMarkets = Math.max(
      Number(match.extraMarkets) || 0,
      openCard.length + 24,
    );
    return next;
  } catch {
    return match;
  }
}

export function enrichIplSrlMatchList(matches = []) {
  return (matches || []).map(enrichIplSrlMatchCard);
}
