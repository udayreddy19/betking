/**
 * Spin wheel bonus/freebet expiry labels for wallet and betslip surfaces.
 */

export function formatSpinGrantExpiry(isoDate) {
  if (!isoDate) return null;
  const expiresMs = new Date(isoDate).getTime();
  if (!Number.isFinite(expiresMs)) return null;
  const remainingMs = expiresMs - Date.now();
  if (remainingMs <= 0) return 'Expired';
  const hours = Math.floor(remainingMs / (60 * 60 * 1000));
  const mins = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
  if (hours >= 1) return `${hours}h ${mins}m left`;
  return `${mins}m left`;
}

export function buildSpinGrantNotice(spinGrants) {
  if (!spinGrants) return null;
  const parts = [];
  const bonusLeft = formatSpinGrantExpiry(spinGrants.nextBonusExpiresAt);
  const freebetLeft = formatSpinGrantExpiry(spinGrants.nextFreebetExpiresAt);
  if (Number(spinGrants.bonusRemaining) > 0 && bonusLeft) {
    parts.push(`Spin bonus ₹${Number(spinGrants.bonusRemaining).toFixed(0)} · ${bonusLeft}`);
  }
  if (Number(spinGrants.freebetRemaining) > 0 && freebetLeft) {
    parts.push(`Spin freebet ₹${Number(spinGrants.freebetRemaining).toFixed(0)} · ${freebetLeft}`);
  }
  if (!parts.length) return null;
  return {
    message: `${parts.join(' · ')} — use within 24h or it expires`,
    urgent: [bonusLeft, freebetLeft].some((v) => v && (v.endsWith('m left') || v.startsWith('0h') || v.startsWith('1h'))),
  };
}
