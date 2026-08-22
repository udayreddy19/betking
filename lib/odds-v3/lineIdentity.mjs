/**
 * Line identity helpers — prevent O/U cashout/placement against a bumped line.
 */

export function parseOuLine(text = '') {
  const m = String(text).match(/(?:over|under)\s+(\d+(?:\.\d+)?)/i);
  if (m) return Number(m[1]);
  const bare = String(text).match(/(\d+\.\d+)/);
  return bare ? Number(bare[1]) : null;
}

export function isOverSelection(selectionId = '', selectionName = '') {
  const s = `${selectionId} ${selectionName}`.toLowerCase();
  return /\bover\b/.test(s) && !/\bunder\b/.test(s);
}

export function isUnderSelection(selectionId = '', selectionName = '') {
  const s = `${selectionId} ${selectionName}`.toLowerCase();
  return /\bunder\b/.test(s);
}

/** Selection ids that embed the line: sel_over_143.5 / sel_under_98.5 */
export function lineScopedSelectionId(side, line) {
  const n = Number(line);
  if (!Number.isFinite(n)) return side === 'under' ? 'sel_under' : 'sel_over';
  return side === 'under' ? `sel_under_${n}` : `sel_over_${n}`;
}

export function linesMatch(a, b, eps = 0.01) {
  const x = Number(a);
  const y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return true; // nothing to compare
  return Math.abs(x - y) <= eps;
}

/**
 * Extract accepted line from selection id/name, then require live market.line to match.
 * Returns false when the live book has moved past the bet's line (decided / bumped).
 */
export function acceptedLineStillOpen(market, selectionId, selectionName) {
  const accepted = parseOuLine(selectionName) ?? parseOuLine(selectionId);
  if (accepted == null) return true;
  if (market?.line == null) return true;
  return linesMatch(accepted, market.line);
}
