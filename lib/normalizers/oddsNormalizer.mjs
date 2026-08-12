/**
 * Canonical Odds Normalizer
 * Converts Decimal, Fractional ("17/20"), and American ("+150", "-110") odds into canonical decimal odds.
 * Rejects invalid, null, NaN, <= 1.00, or negative odds payloads.
 */

export function convertToDecimalOdds(rawOdds) {
  if (rawOdds === undefined || rawOdds === null || rawOdds === '') {
    throw new Error('Odds value is required');
  }

  let decimalVal = 0;

  if (typeof rawOdds === 'number') {
    decimalVal = rawOdds;
  } else if (typeof rawOdds === 'string') {
    const str = rawOdds.trim();

    // 1. Fractional format (e.g. "17/20" or "5/2")
    if (str.includes('/')) {
      const parts = str.split('/');
      const num = parseFloat(parts[0]);
      const den = parseFloat(parts[1]);
      if (isNaN(num) || isNaN(den) || den === 0) {
        throw new Error(`Invalid fractional odds format: ${str}`);
      }
      decimalVal = (num / den) + 1.0;
    }
    // 2. American format (e.g. "+150" or "-110")
    else if (str.startsWith('+') || (str.startsWith('-') && str.length > 1)) {
      const american = parseFloat(str);
      if (isNaN(american)) {
        throw new Error(`Invalid American odds format: ${str}`);
      }
      if (american > 0) {
        decimalVal = (american / 100) + 1.0;
      } else if (american < 0) {
        decimalVal = (100 / Math.abs(american)) + 1.0;
      } else {
        throw new Error('American odds cannot be zero');
      }
    }
    // 3. Normal Decimal String (e.g. "1.85")
    else {
      decimalVal = parseFloat(str);
    }
  } else {
    throw new Error(`Unsupported odds input type: ${typeof rawOdds}`);
  }

  // Sanity check checks
  if (isNaN(decimalVal) || !isFinite(decimalVal)) {
    throw new Error(`Invalid odds computed: ${decimalVal}`);
  }

  if (decimalVal <= 1.00) {
    throw new Error(`Decimal odds must be strictly greater than 1.00. Received: ${decimalVal}`);
  }

  // Return formatted decimal odds to 2 decimal places
  return parseFloat(decimalVal.toFixed(2));
}

/** Validate selection array and convert all odds to decimal */
export function normalizeSelections(selections = []) {
  if (!Array.isArray(selections) || selections.length === 0) {
    throw new Error('Selections array must be non-empty');
  }

  return selections.map(sel => {
    const decimalOdds = convertToDecimalOdds(sel.odds);
    const impliedProb = parseFloat((1.0 / decimalOdds).toFixed(4));

    return {
      ...sel,
      odds: decimalOdds,
      decimalOdds,
      impliedProbability: impliedProb,
      status: sel.status || 'OPEN',
    };
  });
}
