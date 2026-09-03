import { globalRiskOrchestrator } from './globalRiskOrchestrator.mjs';
import {
  enforceHouseProtection,
  liabilityLimitForMarket,
  isTotalsMarket,
  isSrlContext,
} from './houseProtectionEngine.mjs';
import { calculateExposureRisk } from './exposureEngine.mjs';
import {
  assertPersistedMatchLiabilityCapacity,
  recordAcceptedBetLiability,
} from './persistedMarketLiability.mjs';
import { assertDailyNetWinCap, assertSharpStakeCap } from './dailyHouseCaps.mjs';

export async function enforceBetRisk({
  userId,
  stake,
  validatedSelections = [],
  betType = 'SINGLE',
  fundSource = 'cash',
  client = null,
}) {
  if (!userId || !Array.isArray(validatedSelections) || validatedSelections.length === 0) {
    throw new Error('RISK_REJECTED: Missing bet selections for risk evaluation');
  }

  const effectiveStake = Number(stake) || 0;
  await assertDailyNetWinCap(userId, { fundSource, client });

  for (const sel of validatedSelections) {
    const odds = Number(sel.odds) || 1;
    const marketId = sel.marketId || sel.market_id;
    const selectionId = sel.selectionId || sel.selection_id;
    const selectionName = sel.selectionName || sel.selection_name || selectionId;
    const matchId = sel.matchId || sel.match_id;
    const league = sel.league || null;
    const sport = sel.sport || null;
    const matchName = sel.matchName || sel.match_name || null;
    const isSrl = isSrlContext({ league, sport, matchName, isSrl: sel.isSrl });
    const maxLiabilityLimit = liabilityLimitForMarket(marketId, { isSrl });

    assertSharpStakeCap({
      userId,
      stake: effectiveStake,
      isTotals: isTotalsMarket(marketId),
    });

    await enforceHouseProtection({
      userId,
      stake: effectiveStake,
      odds,
      matchId,
      marketId,
      selectionId,
      selectionName,
      fundSource,
      client,
      league,
      sport,
      matchName,
      isSrl,
    });

    // Authoritative multi-instance check from open bets in Postgres
    const exec = client?.query?.bind(client) || undefined;
    await assertPersistedMatchLiabilityCapacity({
      matchId,
      stake: effectiveStake,
      odds,
      maxLiabilityLimit,
      exec,
    });

    // Fast in-process guard (hydrated from prior accepts in this worker)
    const exposureCheck = calculateExposureRisk({
      matchId,
      marketId,
      stake: effectiveStake,
      odds,
      maxLiabilityLimit,
    });
    if (exposureCheck?.exceedsMaxLiability) {
      throw Object.assign(
        new Error(
          `RISK_REJECTED: Market liability full — max remaining capacity ₹${Math.floor(exposureCheck.remainingCapacity || 0)}`,
        ),
        { code: 'MARKET_LIABILITY_FULL' },
      );
    }

    const decision = await globalRiskOrchestrator.evaluateBetRequest({
      userId,
      matchId,
      marketId,
      selectionId,
      clientOdds: odds,
      serverOdds: odds,
      stake: effectiveStake,
    });

    if (decision.decision !== 'ACCEPT') {
      const reason = decision.reason || decision.decision;
      throw Object.assign(
        new Error(`RISK_REJECTED: ${reason}`),
        { code: decision.decision, decision },
      );
    }
  }

  return effectiveStake;
}

/** Persist liability after the bet row is committed. */
export async function recordBetRiskLiability(validatedSelections = [], stake) {
  const effectiveStake = Number(stake) || 0;
  for (const sel of validatedSelections) {
    await recordAcceptedBetLiability({
      matchId: sel.matchId || sel.match_id,
      marketId: sel.marketId || sel.market_id,
      selectionId: sel.selectionId || sel.selection_id,
      stake: effectiveStake,
      odds: Number(sel.odds) || 1,
    });
  }
}
