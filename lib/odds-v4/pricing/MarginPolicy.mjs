/**
 * OddsEngineV4 — MarginPolicy
 * Target overrounds aligned with observed 10cric display style.
 */

export const DEFAULT_V4_MARGIN = Object.freeze({
  matchWinnerOverround: 0.08,
  totalsOverround: 0.11,
  overMarketsOverround: 0.11,
  deliveryOverround: 0.13,
  multiwayOverround: 0.20,
  minDecimalOdds: 1.01,
  maxDecimalOdds: 101,
});

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Proportional margin on exclusive outcomes.
 * @param {{ id: string, name: string, probability: number }[]} selections
 * @param {number} overround
 * @param {{ minDecimalOdds?: number, maxDecimalOdds?: number }} [opts]
 */
export function priceExclusive(selections, overround, opts = {}) {
  const minOdds = opts.minDecimalOdds ?? DEFAULT_V4_MARGIN.minDecimalOdds;
  const maxOdds = opts.maxDecimalOdds ?? DEFAULT_V4_MARGIN.maxDecimalOdds;
  const fairSum = selections.reduce((s, x) => s + Math.max(0, Number(x.probability) || 0), 0);
  if (!(fairSum > 0)) {
    return { suspended: true, selections: [], overround };
  }

  const normed = selections.map((s) => ({
    ...s,
    probability: Math.max(1e-6, Number(s.probability) || 0) / fairSum,
  }));

  const factor = 1 + Math.max(0, Number(overround) || 0);
  const priced = normed.map((s) => {
    const marginedP = clamp(s.probability * factor, 1 / maxOdds, 1 / minOdds);
    const odds = clamp(1 / marginedP, minOdds, maxOdds);
    return {
      selectionId: s.id || s.selectionId,
      name: s.name,
      probability: Number(s.probability.toFixed(6)),
      odds: Number(odds.toFixed(2)),
      status: 'OPEN',
    };
  });

  return { suspended: false, selections: priced, overround: Number(overround) || 0 };
}

export function priceTwoWay(name1, id1, p1, name2, id2, p2, overround, opts) {
  const raw1 = Math.max(0.01, Math.min(0.99, Number(p1)));
  const raw2 = Math.max(0.01, Math.min(0.99, Number(p2)));
  const sum = raw1 + raw2;
  return priceExclusive([
    { id: id1, name: name1, probability: raw1 / sum },
    { id: id2, name: name2, probability: raw2 / sum },
  ], overround, opts);
}
