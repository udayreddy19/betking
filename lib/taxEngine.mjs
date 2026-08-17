/**
 * Enterprise Tax Engine — OddsYra Enterprise Platform (lib/taxEngine.mjs)
 * Calculates jurisdiction withholding tax, net payout tax, and generates tax compliance reports.
 */

export function calculatePayoutTax(payoutAmount = 0, taxRatePct = 30.0) {
  const payout = Number(payoutAmount) || 0;
  const taxDeduction = payout * (taxRatePct / 100);
  const netPayout = payout - taxDeduction;

  return {
    grossPayout: Number(payout.toFixed(2)),
    taxRatePct,
    taxDeducted: Number(taxDeduction.toFixed(2)),
    netPayout: Number(netPayout.toFixed(2)),
    calculatedAt: new Date().toISOString(),
  };
}
