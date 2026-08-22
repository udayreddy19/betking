/**
 * Accumulator (Multiple) Bet Validation Engine
 * Validates every selection in an accumulator bet independently.
 * If ONE selection fails validation (suspended market, closed market, or stale odds), the entire accumulator is rejected.
 */

import { betRiskEngine } from './betRiskEngine.mjs';
import { marketSuspensionEngine } from './marketSuspensionEngine.mjs';
import { resolveServerOdds, unwrapServerOddsQuote } from './oddsQuoteService.mjs';

export class AccumulatorEngine {
  /** Validate accumulator bet selections */
  async validateAccumulator(stake, selections = []) {
    if (!Array.isArray(selections) || selections.length < 2) {
      throw new Error('INVALID_BET: Accumulator bet requires at least 2 selections');
    }

    const validatedSelections = [];
    const oddsUpdates = [];

    for (const sel of selections) {
      const { matchId, marketId, selectionId, odds } = sel;
      if (!matchId || !marketId || !selectionId) {
        throw new Error('INVALID_BET: Selection missing required parameters');
      }

      // Check market suspension status
      const causes = await marketSuspensionEngine.getActiveCauses(marketId);
      if (causes.length > 0) {
        throw new Error(`MARKET_SUSPENDED: Market '${marketId}' in selection '${selectionId}' is suspended due to ${causes[0].reason}`);
      }

      const quote = await resolveServerOdds({
        matchId,
        marketId,
        selectionId,
        clientOdds: odds,
        selectionName: sel.name || sel.selectionName || null,
      });
      const serverOdds = unwrapServerOddsQuote(quote);

      if (quote?.changed) {
        oddsUpdates.push({
          matchId,
          marketId,
          selectionId,
          selectionName: sel.selectionName || sel.name || selectionId,
          previousOdds: quote.previousOdds,
          odds: serverOdds,
        });
      }

      validatedSelections.push({
        matchId,
        marketId,
        selectionId,
        selectionName: sel.selectionName || sel.name || selectionId,
        odds: serverOdds,
      });
    }

    const payoutCalc = betRiskEngine.calculateAccumulatorPayout(stake, validatedSelections);

    return {
      success: true,
      betType: 'ACCUMULATOR',
      selectionsCount: validatedSelections.length,
      selections: validatedSelections,
      oddsUpdates,
      oddsChanged: oddsUpdates.length > 0,
      ...payoutCalc,
    };
  }
}

export const accumulatorEngine = new AccumulatorEngine();
