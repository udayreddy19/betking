/** Shared ball-outcome parsing for server settlement + client display. */

export function formatBallOutcome(outcome) {
  if (outcome === 'W' || outcome === -1) return 'W';
  if (outcome === 0 || outcome === '0' || outcome === '•') return '•';
  if (typeof outcome === 'number') return String(outcome);

  const s = String(outcome).toLowerCase().trim();
  if (s === 'wd' || s === 'wide') return 'Wd';
  if (s === 'lb' || s === 'legbye') return 'Lb';
  if (s === 'nb' || s === 'noball') return 'Nb';
  const wd = s.match(/^(\d+)wd$/);
  if (wd) return `${wd[1]}Wd`;
  const lb = s.match(/^(\d+)lb$/);
  if (lb) return `${lb[1]}Lb`;
  const nb = s.match(/^(\d+)nb$/);
  if (nb) return `${nb[1]}Nb`;

  return String(outcome);
}

export function isNonLegalDelivery(label) {
  const s = String(label).toLowerCase();
  return s.includes('wd') || s.includes('nb') || s === 'wide' || s === 'noball';
}

/** @returns {{ kind: 'dot'|'runs'|'wicket'|'unknown', runs: number|null, isBoundary: boolean }|null} */
export function parseDeliveryBallOutcome(ballLabel) {
  const raw = String(ballLabel || '').trim();
  if (!raw || raw === '…') return null;
  if (raw === 'W') return { kind: 'wicket', runs: 0, isBoundary: false };
  if (raw === '•' || raw === '.' || raw === '0') return { kind: 'dot', runs: 0, isBoundary: false };
  if (/^\d+$/.test(raw)) {
    const runs = Number(raw);
    return { kind: 'runs', runs, isBoundary: runs === 4 || runs === 6 };
  }
  const lb = raw.match(/^(\d+)Lb$/i);
  if (lb) return { kind: 'runs', runs: Number(lb[1]), isBoundary: false };
  return { kind: 'unknown', runs: null, isBoundary: false };
}
