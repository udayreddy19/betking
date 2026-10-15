/**
 * Blend model fair probs with provider when both exist (V4.2 MW accuracy).
 * Provider gets modest weight; favorite still shortened by house protect.
 */

export function blendModelWithProvider(p1, p2, providerHome, providerAway, weight = 0.30) {
  const a = Number(p1);
  const b = Number(p2);
  if (!(a > 0 && b > 0)) return [a, b];
  const ph = Number(providerHome);
  const pa = Number(providerAway);
  if (!(ph > 1 && pa > 1)) {
    const s = a + b;
    return [a / s, b / s];
  }
  const raw1 = 1 / ph;
  const raw2 = 1 / pa;
  const psum = raw1 + raw2;
  const pp1 = raw1 / psum;
  const pp2 = raw2 / psum;
  const w = Math.max(0, Math.min(0.45, Number(weight) || 0.3));
  let b1 = (1 - w) * a + w * pp1;
  let b2 = (1 - w) * b + w * pp2;
  const sum = b1 + b2;
  return [b1 / sum, b2 / sum];
}
