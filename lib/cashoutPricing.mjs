/**
 * Live cashout pricing from current OddsEngineV3 snapshot.
 * Fair value = stake × Π(accepted_leg / current_leg), then VIP cashout %.
 */

import { resolveServerOdds } from './oddsQuoteService.mjs';
import { getBenefitsForTier } from './vipBenefits.mjs';

const HOUSE_CASHOUT_MARGIN = 0.04; // extra 4% house take on fair value before VIP pct

/**
 * @param {{
 *   stake: number,
 *   acceptedOdds: number,
 *   legs?: Array<{ matchId: string, marketId: string, selectionId: string, odds: number }>,
 *   matchId?: string,
 *   marketId?: string,
 *   selectionId?: string,
 *   vipTier?: string,
 * }} bet
 */
export async function priceCashoutFromV3Snapshot(bet) {
  const stake = Number(bet.stake) || 0;
  const acceptedOdds = Number(bet.acceptedOdds || bet.odds) || 0;
  if (stake <= 0 || acceptedOdds < 1.01) {
    return { available: false, cashoutValue: 0, reason: 'INVALID_BET' };
  }

  let legs = Array.isArray(bet.legs) ? bet.legs.filter((l) => l?.matchId && l?.marketId && l?.selectionId) : [];
  if (legs.length === 0 && bet.matchId && bet.marketId && bet.selectionId) {
    legs = [{
      matchId: bet.matchId,
      marketId: bet.marketId,
      selectionId: bet.selectionId,
      odds: acceptedOdds,
      selectionName: bet.selectionName || bet.selection_name || null,
    }];
  }
  if (legs.length === 0) {
    return { available: false, cashoutValue: 0, reason: 'NO_SELECTIONS' };
  }

  const currentLegs = [];
  let oddsRatio = 1;

  for (const leg of legs) {
    const acceptedLeg = Number(leg.odds) || acceptedOdds;
    let currentOdds;
    try {
      currentOdds = await resolveServerOdds({
        matchId: leg.matchId,
        marketId: leg.marketId,
        selectionId: leg.selectionId,
        clientOdds: null,
        selectionName: leg.selectionName || leg.selection_name || null,
      });
    } catch (err) {
      const msg = err?.message || '';
      if (msg.startsWith('MARKET_ALREADY_DETERMINED') || msg.startsWith('ODDS_LOCKED') || msg.startsWith('MARKET_SUSPENDED')) {
        return { available: false, cashoutValue: 0, reason: msg.split(':')[0], detail: msg };
      }
      return { available: false, cashoutValue: 0, reason: 'ODDS_UNAVAILABLE', detail: msg };
    }

    if (!(currentOdds >= 1.01)) {
      return { available: false, cashoutValue: 0, reason: 'ODDS_UNAVAILABLE' };
    }

    oddsRatio *= acceptedLeg / currentOdds;
    currentLegs.push({
      matchId: leg.matchId,
      marketId: leg.marketId,
      selectionId: leg.selectionId,
      acceptedOdds: acceptedLeg,
      currentOdds,
    });
  }

  const potentialPayout = Number((stake * acceptedOdds).toFixed(2));
  const fairCashout = Number((stake * oddsRatio).toFixed(4));
  const afterHouseMargin = fairCashout * (1 - HOUSE_CASHOUT_MARGIN);
  const vipPct = getBenefitsForTier(bet.vipTier || 'BRONZE').cashoutPayoutPct || 0.85;
  let cashoutValue = afterHouseMargin * vipPct;

  // Cap only — never inflate dead bets with a 10% stake floor
  const maxCashout = potentialPayout * 0.98;
  cashoutValue = Math.max(0, Math.min(maxCashout, cashoutValue));
  cashoutValue = Number(cashoutValue.toFixed(2));

  if (cashoutValue < 0.01) {
    return { available: false, cashoutValue: 0, reason: 'CASHOUT_TOO_LOW', currentLegs };
  }

  return {
    available: true,
    cashoutValue,
    fairCashout: Number(fairCashout.toFixed(2)),
    potentialPayout,
    stake,
    acceptedOdds,
    vipCashoutPct: vipPct,
    houseMarginPct: HOUSE_CASHOUT_MARGIN * 100,
    currentLegs,
    pricedAt: new Date().toISOString(),
  };
}
