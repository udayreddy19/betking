/**
 * Stale Odds Protection Engine — Server-Side Odds & Version Guard
 * Prevents acceptance of bets placed against obsolete client-side live prices.
 */

class StaleOddsProtectionEngine {
  validateOddsMatch({
    clientOdds,
    serverOdds,
    matchVersion = 1,
    currentServerMatchVersion = 1,
    marketStatus = 'ACTIVE',
    maxAllowedSlippage = 0.05,
  }) {
    // 1. Market Status Guard
    if (marketStatus !== 'ACTIVE' && marketStatus !== 'OPEN') {
      return {
        isAcceptable: false,
        reason: `Bet rejected: Market is currently ${marketStatus}`,
        action: 'SUSPEND',
      };
    }

    // 2. Version Monotonicity Guard
    if (matchVersion < currentServerMatchVersion) {
      return {
        isAcceptable: false,
        reason: `Bet rejected: Stale match version (Client version ${matchVersion} < Server version ${currentServerMatchVersion})`,
        action: 'REQUIRE_ODDS_CONFIRMATION',
      };
    }

    // 3. Price Slippage Guard
    if (serverOdds != null && typeof clientOdds === 'number') {
      const diff = Math.abs(clientOdds - serverOdds);
      if (diff > maxAllowedSlippage) {
        return {
          isAcceptable: false,
          reason: `Bet rejected: Price slippage exceeded (Client odds ${clientOdds} vs Server odds ${serverOdds})`,
          action: 'REPRICE',
          serverOdds,
        };
      }
    }

    return {
      isAcceptable: true,
      reason: 'Odds and match version validated successfully',
      action: 'ACCEPT',
    };
  }
}

export const staleOddsProtection = new StaleOddsProtectionEngine();

export function checkStaleOdds({ clientOdds, currentServerOdds }) {
  if (clientOdds !== currentServerOdds) {
    return {
      isStale: true,
      status: 'ODDS_CHANGED',
      previousOdds: clientOdds,
      currentOdds: currentServerOdds,
    };
  }
  return { isStale: false, status: 'VALID' };
}
