/**
 * Blend model fair probs with de-vigged provider MW (when present).
 * Provider weight is capped low so soft public books cannot soften our house.
 */

import { extractProviderOdds } from '../odds-v3/buildCanonicalFromMatch.mjs';
import { OSV4_MARGIN_CONFIG } from './pricing/MarginPolicy.mjs';

function normalize(weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) return weights.map(() => 1 / weights.length);
  return weights.map((w) => w / sum);
}

export function blendWinnerProbs({
  model,
  hasDraw,
  match,
  providerWeight = OSV4_MARGIN_CONFIG.providerBlendWeight,
}) {
  const [m1, mD, m2] = hasDraw
    ? [model[0], model[1], model[2]]
    : [model[0], 0, model[1]];

  const provider = extractProviderOdds(match);
  if (!provider) {
    if (hasDraw) {
      const [p1, pDraw, p2] = normalize([m1, mD, m2]);
      return { p1, pDraw, p2, hasDraw: true, blended: false };
    }
    const [p1, p2] = normalize([m1, m2]);
    return { p1, pDraw: null, p2, hasDraw: false, blended: false };
  }

  let wProv = Math.max(0, Math.min(0.75, Number(providerWeight) || 0));
  // Favorite-inversion guard: flat PPG priors must not override a strong provider favorite.
  if (!hasDraw) {
    const pHProv = 1 / Number(provider.home);
    const pAProv = 1 / Number(provider.away);
    if (Number.isFinite(pHProv) && Number.isFinite(pAProv)) {
      const modelFavHome = m1 >= m2;
      const provFavHome = pHProv >= pAProv;
      const strongProv = Math.max(pHProv, pAProv) >= 0.55;
      if (modelFavHome !== provFavHome && strongProv) {
        wProv = Math.max(wProv, 0.64);
      }
    }
  }
  const wModel = 1 - wProv;

  if (hasDraw) {
    const drawOdds = Number(provider.draw);
    const pDProv = drawOdds > 1 ? 1 / drawOdds : mD;
    const raw = [
      wModel * m1 + wProv * (1 / provider.home),
      wModel * mD + wProv * pDProv,
      wModel * m2 + wProv * (1 / provider.away),
    ];
    const [p1, pDraw, p2] = normalize(raw);
    return { p1, pDraw, p2, hasDraw: true, blended: true };
  }

  const raw = [
    wModel * m1 + wProv * (1 / provider.home),
    wModel * m2 + wProv * (1 / provider.away),
  ];
  const [p1, p2] = normalize(raw);
  return { p1, pDraw: null, p2, hasDraw: false, blended: true };
}

export { extractProviderOdds };
