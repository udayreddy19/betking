const MAX_SPLIT_PARTS = 50;

/**
 * Split a rupee total into N stake-sized parts for discrete free bets / bonuses.
 * Remainder paise (if any) go on the last part so the sum always equals the total.
 */
export function planSplitAmounts(totalAmount, parts = 1) {
  const n = Math.max(1, Math.min(MAX_SPLIT_PARTS, Math.floor(Number(parts) || 1)));
  const paise = Math.round(Number(totalAmount) * 100);
  if (!(paise > 0)) {
    throw Object.assign(new Error('Split total must be greater than zero'), {
      code: 'INVALID_SPLIT_AMOUNT',
      status: 400,
    });
  }
  if (n <= 1 || paise < n) {
    return [Number((paise / 100).toFixed(2))];
  }
  const base = Math.floor(paise / n);
  const rem = paise - base * n;
  return Array.from({ length: n }, (_, i) => Number(((base + (i === n - 1 ? rem : 0)) / 100).toFixed(2)));
}

/** Issue N identical stakes. Total is N × each — not a divided lump. */
export function planPackAmounts({ parts = 1, each = null } = {}) {
  const n = Math.max(1, Math.min(MAX_SPLIT_PARTS, Math.floor(Number(parts) || 1)));
  const eachAmt = Number(each);
  if (n <= 1 || !Number.isFinite(eachAmt) || !(eachAmt > 0)) {
    throw Object.assign(new Error('Pack needs a count and an amount for each stake'), {
      code: 'INVALID_PACK',
      status: 400,
    });
  }
  return Array.from({ length: n }, () => Number(eachAmt.toFixed(2)));
}

/**
 * Deposit-match delivery: honour N × each when it equals the match.
 * If the match is smaller, issue as many full `each` stakes as fit, plus leftover.
 */
export function resolveDeliveryAmounts({ matchAmount, parts = 1, each = null } = {}) {
  const matchPaise = Math.round(Number(matchAmount) * 100);
  if (!(matchPaise > 0)) {
    throw Object.assign(new Error('Amount must be greater than zero'), {
      code: 'INVALID_SPLIT_AMOUNT',
      status: 400,
    });
  }
  const n = Math.max(1, Math.min(MAX_SPLIT_PARTS, Math.floor(Number(parts) || 1)));
  const eachPaise = Math.round(Number(each) * 100);
  if (n <= 1 || !(eachPaise > 0)) {
    return [Number((matchPaise / 100).toFixed(2))];
  }
  if (n * eachPaise === matchPaise) {
    return Array.from({ length: n }, () => Number((eachPaise / 100).toFixed(2)));
  }
  const nFit = Math.min(n, Math.floor(matchPaise / eachPaise));
  if (nFit < 1) {
    return [Number((matchPaise / 100).toFixed(2))];
  }
  const amounts = Array.from({ length: nFit }, () => Number((eachPaise / 100).toFixed(2)));
  const rem = matchPaise - nFit * eachPaise;
  if (rem > 0) amounts.push(Number((rem / 100).toFixed(2)));
  return amounts;
}

export function normalizeSplitParts(input, { enabled = false } = {}) {
  if (!enabled) return 1;
  const n = Math.floor(Number(input) || 0);
  if (n <= 1) return 1;
  return Math.min(MAX_SPLIT_PARTS, Math.max(2, n));
}

export function normalizeSplitEach(input, { enabled = false } = {}) {
  if (!enabled) return null;
  const n = Number(input);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Number(n.toFixed(2));
}

export function describeSplit(totalAmount, parts) {
  const amounts = planSplitAmounts(totalAmount, parts);
  if (amounts.length <= 1) {
    return { parts: 1, each: amounts[0], label: `₹${Number(amounts[0]).toLocaleString('en-IN')} as one stake` };
  }
  const first = amounts[0];
  const even = amounts.every((a) => a === first);
  if (even) {
    return {
      parts: amounts.length,
      each: first,
      label: `${amounts.length} × ₹${Number(first).toLocaleString('en-IN')}`,
    };
  }
  return {
    parts: amounts.length,
    each: first,
    label: `${amounts.length} stakes totalling ₹${Number(totalAmount).toLocaleString('en-IN')}`,
  };
}

export { MAX_SPLIT_PARTS };
