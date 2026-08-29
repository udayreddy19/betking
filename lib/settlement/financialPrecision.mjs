/**
 * OddsYra / BetKing — Authoritative Financial Precision Engine
 * 
 * Guarantees deterministic 2-decimal (paise) rounding across all authoritative financial calculations:
 * - Prevents binary floating point IEEE 754 precision drift (e.g., 0.1 + 0.2 != 0.3)
 * - Safe half-up rounding using Number.EPSILON on boundary values (e.g., ₹1.005 -> ₹1.01)
 * - Exact minor units (paise) conversion and verification
 */

/**
 * Authoritative half-up rounding to 2 decimal places.
 * @param {number|string} amount
 * @returns {number}
 */
export function roundAuthoritativeMoney(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0.00;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Convert rupee amount to exact integer minor units (paise).
 * @param {number|string} amount
 * @returns {number} integer paise
 */
export function toMinorUnits(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100);
}

/**
 * Convert integer minor units (paise) back to authoritative rupee amount.
 * @param {number} paise
 * @returns {number}
 */
export function fromMinorUnits(paise) {
  const n = Number(paise);
  if (!Number.isFinite(n)) return 0.00;
  return Math.round(n) / 100;
}

/**
 * Deterministically compute gross payout: stake * acceptedOdds (+ vipBoost)
 * @param {number|string} stake
 * @param {number|string} acceptedOdds
 * @param {number} vipBoostPct
 * @returns {number}
 */
export function calculateAuthoritativePayout(stake, acceptedOdds, vipBoostPct = 0) {
  const s = roundAuthoritativeMoney(stake);
  const odds = Number(acceptedOdds);
  if (s <= 0 || !Number.isFinite(odds) || odds <= 0) return 0.00;

  const rawBase = s * odds;
  const basePayout = roundAuthoritativeMoney(rawBase);

  if (vipBoostPct > 0) {
    const boostMultiplier = 1 + (Number(vipBoostPct) / 100);
    return roundAuthoritativeMoney(basePayout * boostMultiplier);
  }

  return basePayout;
}

/**
 * Deterministically compute net profit: payout - stake
 * @param {number|string} payout
 * @param {number|string} stake
 * @returns {number}
 */
export function calculateAuthoritativeProfit(payout, stake) {
  const p = roundAuthoritativeMoney(payout);
  const s = roundAuthoritativeMoney(stake);
  return roundAuthoritativeMoney(p - s);
}

/**
 * Verify wallet bucket balance reconciliation against ledger net delta.
 * Invariant: delta(cash) + delta(bonus) == sum(ledger credits) - sum(ledger debits)
 * @param {object} beforeWallet
 * @param {object} afterWallet
 * @param {Array<object>} ledgerEntries
 * @returns {{ reconciled: boolean, deltaWallet: number, deltaLedger: number, discrepancy: number }}
 */
export function verifyBucketReconciliation(beforeWallet, afterWallet, ledgerEntries = []) {
  const beforeTotal = toMinorUnits(beforeWallet.balance || 0) + toMinorUnits(beforeWallet.bonusBalance || beforeWallet.bonus_balance || 0);
  const afterTotal = toMinorUnits(afterWallet.balance || 0) + toMinorUnits(afterWallet.bonusBalance || afterWallet.bonus_balance || 0);
  const deltaWalletPaise = afterTotal - beforeTotal;

  let deltaLedgerPaise = 0;
  for (const entry of ledgerEntries) {
    const entryPaise = toMinorUnits(entry.amount || 0);
    const type = String(entry.type || '').toUpperCase();
    if (type === 'CREDIT') {
      deltaLedgerPaise += entryPaise;
    } else if (type === 'DEBIT') {
      deltaLedgerPaise -= entryPaise;
    }
  }

  const discrepancyPaise = deltaWalletPaise - deltaLedgerPaise;
  return {
    reconciled: discrepancyPaise === 0,
    deltaWallet: fromMinorUnits(deltaWalletPaise),
    deltaLedger: fromMinorUnits(deltaLedgerPaise),
    discrepancy: fromMinorUnits(discrepancyPaise),
  };
}

/**
 * Deterministically calculate recovery amounts, outstanding liability, and recovery status.
 * Invariant: totalAdjustment === recoveredAmount + outstandingAmount
 * @param {object} params
 * @param {number|string} params.totalAdjustment
 * @param {number|string} params.currentBalance
 * @param {boolean} params.allowPartialRecovery
 * @returns {{ totalAdjustment: number, recoveredAmount: number, outstandingAmount: number, status: string, invariantVerified: boolean }}
 */
export function calculateRecoveryLiability({ totalAdjustment, currentBalance, allowPartialRecovery = true }) {
  const adj = roundAuthoritativeMoney(totalAdjustment);
  const bal = Math.max(0, roundAuthoritativeMoney(currentBalance));

  let recoveredAmount = 0.00;
  let outstandingAmount = adj;
  let status = 'REVERSAL_FINANCIALLY_PENDING';

  if (adj <= 0) {
    return {
      totalAdjustment: 0.00,
      recoveredAmount: 0.00,
      outstandingAmount: 0.00,
      status: 'REVERSED',
      invariantVerified: true,
    };
  }

  if (bal >= adj) {
    recoveredAmount = adj;
    outstandingAmount = 0.00;
    status = 'REVERSED';
  } else if (allowPartialRecovery && bal > 0) {
    recoveredAmount = bal;
    outstandingAmount = roundAuthoritativeMoney(adj - bal);
    status = 'REVERSAL_PARTIALLY_RECOVERED';
  } else if (allowPartialRecovery && bal <= 0) {
    recoveredAmount = 0.00;
    outstandingAmount = adj;
    status = 'REVERSAL_FINANCIALLY_PENDING';
  } else {
    throw new Error('INSUFFICIENT_BALANCE_FOR_REVERSAL');
  }

  const invariantVerified = toMinorUnits(adj) === toMinorUnits(recoveredAmount) + toMinorUnits(outstandingAmount);

  return {
    totalAdjustment: adj,
    recoveredAmount,
    outstandingAmount,
    status,
    invariantVerified,
  };
}
