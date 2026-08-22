/**
 * User-facing market titles derived from canonical market_id (not raw ids like i1_overs_0_10_total).
 */

function inningsLabel(innings) {
  if (innings === 1) return '1st Innings';
  if (innings === 2) return '2nd Innings';
  if (innings != null && Number.isFinite(Number(innings))) return `${innings}th Innings`;
  return null;
}

/**
 * @param {string} marketId
 * @returns {string}
 */
export function formatMarketDisplayName(marketId) {
  const id = String(marketId || '').trim();
  if (!id) return 'Market';

  const known = {
    match_winner: 'Match Winner',
    match_winner_super_over: 'Match Winner (incl. Super Over)',
    team_total: 'Team Total Runs',
    match_total: 'Match Total Runs',
  };
  if (known[id]) return known[id];

  const milestone = id.match(/^(?:i(\d+)_)?overs_0_(\d+)_total$/i);
  if (milestone) {
    const inn = milestone[1] != null ? Number(milestone[1]) : null;
    const endOver = Number(milestone[2]);
    const innText = inn != null ? inningsLabel(inn) : null;
    if (innText) return `${innText} Overs 0–${endOver} Total`;
    return `Overs 0–${endOver} Total`;
  }

  const nextOver = id.match(/^(?:i(\d+)_)?next_over_(\d+)_total$/i);
  if (nextOver) {
    const inn = nextOver[1] != null ? Number(nextOver[1]) : null;
    const overNum = Number(nextOver[2]);
    const innText = inn != null ? inningsLabel(inn) : null;
    if (innText) return `${innText} — Over ${overNum} Total`;
    return `Over ${overNum} Total Runs`;
  }

  const dismissal = id.match(/^(?:i(\d+)_)?team_score_at_(\d+)_dismissal$/i);
  if (dismissal) {
    const inn = dismissal[1] != null ? Number(dismissal[1]) : null;
    const wkt = Number(dismissal[2]);
    const innText = inn != null ? inningsLabel(inn) : null;
    if (innText) return `${innText} Score at ${wkt}${wkt === 1 ? 'st' : wkt === 2 ? 'nd' : wkt === 3 ? 'rd' : 'th'} Wicket`;
    return `Team Score at ${wkt}${wkt === 1 ? 'st' : wkt === 2 ? 'nd' : wkt === 3 ? 'rd' : 'th'} Dismissal`;
  }

  if (/^current_over_\d+_odd_even$/i.test(id)) {
    const over = id.match(/(\d+)/)?.[1];
    return over ? `Current Over (${over}) Odd/Even` : 'Current Over Odd/Even';
  }

  if (/next_delivery_/i.test(id)) {
    const hit = id.match(/^(?:i(\d+)_)?next_delivery_[a-z]+_(\d+)_(\d+)$/i);
    if (hit) {
      const inn = hit[1] != null ? inningsLabel(Number(hit[1])) : null;
      const over = hit[2];
      const ball = hit[3];
      if (inn) return `${inn} — Next Delivery (${over}.${ball})`;
      return `Next Delivery (${over}.${ball})`;
    }
  }

  if (/^i(\d+)_/i.test(id)) {
    return id
      .replace(/^i\d+_/i, '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return id
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function resolveMarketDisplayName({ marketId, marketName, placementSnapshot } = {}) {
  const explicit = String(marketName || '').trim();
  if (explicit && explicit !== String(marketId || '') && !/^i\d+_/i.test(explicit)) {
    return explicit;
  }
  const leg = placementSnapshot?.legs?.[0];
  if (leg?.marketName && String(leg.marketName).trim()) {
    return String(leg.marketName).trim();
  }
  return formatMarketDisplayName(marketId);
}
