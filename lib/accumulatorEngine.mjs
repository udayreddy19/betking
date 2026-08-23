/**
 * Accumulator (Multiple) Bet Validation Engine
 * Validates every selection in an accumulator bet independently.
 * If ONE selection fails validation (suspended market, closed market, or odds change), the entire accumulator is rejected.
 */

import { betRiskEngine } from './betRiskEngine.mjs';
import { marketSuspensionEngine } from './marketSuspensionEngine.mjs';
import { resolveServerOdds, unwrapServerOddsQuote } from './oddsQuoteService.mjs';
import { validatePlacementOdds } from './oddsPlacementValidation.mjs';

export class AccumulatorEngine {
  /** Validate accumulator bet selections */
  async validateAccumulator(stake, selections = [], ctx = {}) {
    if (!Array.isArray(selections) || selections.length < 2) {
      throw new Error('INVALID_BET: Accumulator bet requires at least 2 selections');
    }

    const validatedSelections = [];
    const oddsChangeUpdates = [];

    const matchIds = [...new Set(selections.map((sel) => sel.matchId).filter(Boolean))];
    const snapshots = new Map();
    const { loadLiveOddsSnapshot } = await import('./oddsQuoteService.mjs');
    await Promise.all(matchIds.map(async (matchId) => {
      snapshots.set(matchId, await loadLiveOddsSnapshot(matchId));
    }));

    for (const sel of selections) {
      const { matchId, marketId, selectionId, odds } = sel;
      if (!matchId || !marketId || !selectionId) {
        throw new Error('INVALID_BET: Selection missing required parameters');
      }

      const causes = await marketSuspensionEngine.getActiveCauses(marketId);
      if (causes.length > 0) {
        throw new Error(`MARKET_SUSPENDED: Market '${marketId}' in selection '${selectionId}' is suspended due to ${causes[0].reason}`);
      }

      let quote;
      try {
        quote = await resolveServerOdds({
          matchId,
          marketId,
          selectionId,
          clientOdds: odds,
          selectionName: sel.name || sel.selectionName || null,
          liveSnap: snapshots.get(matchId),
        });
      } catch (err) {
        if (err.code === 'ODDS_CHANGED' || err.code === 'STALE_ODDS') {
          const updates = err.oddsUpdates || [err.data].filter(Boolean);
          oddsChangeUpdates.push(...updates);
          const serverOdds = Number(
            updates[0]?.newOdds ?? updates[0]?.odds ?? (quote ? unwrapServerOddsQuote(quote) : NaN),
          );
          if (Number.isFinite(serverOdds)) {
            validatedSelections.push({
              matchId,
              marketId: quote?.marketId || marketId,
              selectionId: quote?.selectionId || selectionId,
              selectionName: sel.selectionName || sel.name || selectionId,
              odds: serverOdds,
              team1Name: sel.team1Name || sel.team1_name || null,
              team2Name: sel.team2Name || sel.team2_name || null,
              matchName: sel.matchName || sel.match_name || null,
              league: sel.league || null,
              sport: sel.sport || null,
            });
          }
          continue;
        }
        throw err;
      }

      try {
        validatePlacementOdds({
          serverOdds: unwrapServerOddsQuote(quote),
          clientOdds: odds,
          matchId,
          marketId: quote?.marketId || marketId,
          selectionId: quote?.selectionId || selectionId,
          selectionName: sel.selectionName || sel.name || selectionId,
          oddsVersion: quote?.oddsVersion,
          quoteTimestamp: quote?.quoteTimestamp || quote?.generatedAt,
          userId: ctx.userId,
          correlationId: ctx.correlationId,
          betType: 'ACCUMULATOR',
        });
      } catch (err) {
        if (err.code === 'ODDS_CHANGED' || err.code === 'STALE_ODDS') {
          const updates = err.oddsUpdates || [err.data].filter(Boolean);
          oddsChangeUpdates.push(...updates);
          const serverOdds = Number(
            updates[0]?.newOdds ?? updates[0]?.odds ?? (quote ? unwrapServerOddsQuote(quote) : NaN),
          );
          if (Number.isFinite(serverOdds)) {
            validatedSelections.push({
              matchId,
              marketId: quote?.marketId || marketId,
              selectionId: quote?.selectionId || selectionId,
              selectionName: sel.selectionName || sel.name || selectionId,
              odds: serverOdds,
              team1Name: sel.team1Name || sel.team1_name || null,
              team2Name: sel.team2Name || sel.team2_name || null,
              matchName: sel.matchName || sel.match_name || null,
              league: sel.league || null,
              sport: sel.sport || null,
            });
          }
          continue;
        }
        throw err;
      }

      const serverOdds = unwrapServerOddsQuote(quote);
      validatedSelections.push({
        matchId,
        marketId: quote?.marketId || marketId,
        selectionId: quote?.selectionId || selectionId,
        selectionName: sel.selectionName || sel.name || selectionId,
        odds: serverOdds,
        team1Name: sel.team1Name || sel.team1_name || null,
        team2Name: sel.team2Name || sel.team2_name || null,
        matchName: sel.matchName || sel.match_name || null,
        league: sel.league || null,
        sport: sel.sport || null,
      });
    }

    const payoutCalc = betRiskEngine.calculateAccumulatorPayout(stake, validatedSelections);

    if (oddsChangeUpdates.length > 0) {
      return {
        success: true,
        betType: 'ACCUMULATOR',
        oddsChanged: true,
        oddsUpdates: oddsChangeUpdates,
        requiresAcceptance: true,
        selectionsCount: validatedSelections.length,
        selections: validatedSelections,
        ...payoutCalc,
      };
    }

    return {
      success: true,
      betType: 'ACCUMULATOR',
      selectionsCount: validatedSelections.length,
      selections: validatedSelections,
      ...payoutCalc,
    };
  }
}

export const accumulatorEngine = new AccumulatorEngine();
