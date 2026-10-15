import { globalRiskOrchestrator } from './globalRiskOrchestrator.mjs';
import {
  enforceHouseProtection,
  liabilityLimitForMarket,
  isTotalsMarket,
  isSrlContext,
} from './houseProtectionEngine.mjs';
import {
  assertPersistedMatchLiabilityCapacity,
  recordAcceptedBetLiability,
} from './persistedMarketLiability.mjs';
import { assertDailyNetWinCap, assertSharpStakeCap } from './dailyHouseCaps.mjs';
import { assertBetVelocity, recordAcceptedBetVelocity } from './risk/betVelocityBreaker.mjs';
import { assertHierarchicalRiskLimits } from './risk/riskHierarchy.mjs';

function isAccumulatorType(betType) {
  return /^(ACCA|ACCUMULATOR|MULTI|PARLAY|SYSTEM)$/i.test(String(betType || ''));
}

function combinedOddsFromSelections(selections = []) {
  return selections.reduce((acc, sel) => {
    const o = Number(sel.odds) || 1;
    return acc * (o > 1 ? o : 1);
  }, 1);
}

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

  const primaryMatchId = validatedSelections[0]?.matchId || validatedSelections[0]?.match_id;
  assertBetVelocity({ userId, matchId: primaryMatchId, stake: effectiveStake });

  const acca = isAccumulatorType(betType) && validatedSelections.length > 1;
  const combinedOdds = acca ? combinedOddsFromSelections(validatedSelections) : null;
  const n = validatedSelections.length;

  // Acca: enforce max payout once against combined odds (not per-leg as if singles).
  if (acca) {
    const primary = validatedSelections[0];
    assertHierarchicalRiskLimits({
      stake: effectiveStake,
      odds: combinedOdds,
      sport: primary?.sport || null,
      competition: primary?.league || null,
      matchId: primaryMatchId,
      marketId: 'accumulator',
      userId,
    });
  }

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

    // Singles: full hierarchy per leg. Acca: stake + leg odds for stake caps only
    // (payout already checked on combined).
    if (!acca) {
      assertHierarchicalRiskLimits({
        stake: effectiveStake,
        odds,
        sport,
        competition: league,
        matchId,
        marketId,
        userId,
        eventMaxLiability: maxLiabilityLimit,
      });
    } else {
      assertHierarchicalRiskLimits({
        stake: effectiveStake,
        odds: 1.01, // stake-only check; payout gated above via combinedOdds
        sport,
        competition: league,
        matchId,
        marketId,
        userId,
        eventMaxLiability: maxLiabilityLimit,
      });
    }

    assertSharpStakeCap({
      userId,
      stake: effectiveStake,
      isTotals: isTotalsMarket(marketId),
    });

    await enforceHouseProtection({
      userId,
      stake: effectiveStake,
      odds: acca ? Math.max(1.01, 1 + (combinedOdds - 1) / n) : odds,
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

    // Acca: attribute pro-rata match liability, not full stake × each leg odds.
    const liabilityOdds = acca
      ? Math.max(1.01, 1 + (combinedOdds - 1) / n)
      : odds;

    const exec = client?.query?.bind(client) || undefined;
    await assertPersistedMatchLiabilityCapacity({
      matchId,
      stake: effectiveStake,
      odds: liabilityOdds,
      maxLiabilityLimit,
      exec,
    });

    const decision = await globalRiskOrchestrator.evaluateBetRequest({
      userId,
      matchId,
      marketId,
      selectionId,
      clientOdds: odds,
      serverOdds: odds,
      stake: effectiveStake,
      skipMemExposure: true,
    });

    if (decision.decision !== 'ACCEPT') {
      const reason = decision.reason || decision.decision;
      throw Object.assign(
        new Error(`RISK_REJECTED: ${reason}`),
        { code: decision.decision, decision, reasonCode: decision.reasonCode || decision.decision },
      );
    }
  }

  return effectiveStake;
}

/** Persist derived liability cache after the bet row is committed. */
export async function recordBetRiskLiability(validatedSelections = [], stake, { userId, betType } = {}) {
  const effectiveStake = Number(stake) || 0;
  const acca = isAccumulatorType(betType) && validatedSelections.length > 1;
  const combined = acca ? combinedOddsFromSelections(validatedSelections) : null;
  const n = validatedSelections.length || 1;

  for (const sel of validatedSelections) {
    const odds = Number(sel.odds) || 1;
    const liabilityOdds = acca
      ? Math.max(1.01, 1 + (combined - 1) / n)
      : odds;
    await recordAcceptedBetLiability({
      matchId: sel.matchId || sel.match_id,
      marketId: sel.marketId || sel.market_id,
      selectionId: sel.selectionId || sel.selection_id,
      stake: effectiveStake,
      odds: liabilityOdds,
      userId,
    });
  }
  try {
    recordAcceptedBetVelocity({
      userId,
      matchId: validatedSelections[0]?.matchId || validatedSelections[0]?.match_id,
      stake: effectiveStake,
    });
  } catch { /* non-fatal */ }
}
