/**
 * OtherSportsEngineV4 — maximum house-first margin policy (v4.2).
 * Prefer suspending over printing a soft price.
 */

export const OSV4_ENGINE_VERSION = '4.2.0';

/**
 * Overround → book points = 100 × (1 + overround).
 * Live bump stacks on top.
 */
export const OSV4_MARGIN_CONFIG = Object.freeze({
  /** Match winner / 1X2 / moneyline → 118 pts base */
  matchWinnerOverround: 0.18,
  /** Totals & spreads → 122 pts base */
  totalsOverround: 0.22,
  /** BTTS / DC Yes-No → 118 pts base */
  propsOverround: 0.18,
  /** Extra overround piled onto Over after bias */
  overExtraOverround: 0.08,
  /** Hard longshot / underdog ceiling */
  maxSelectionOdds: 3.50,
  /** Soft totals Over ceiling — never sell juicy Overs */
  maxOverOdds: 1.35,
  /** Soft Yes / DC Yes ceiling */
  maxYesOdds: 1.85,
  /** Soft favorite ceiling (fair p ≥ 0.48) */
  maxFavoriteOdds: 1.55,
  minDecimalOdds: 1.01,
  /** Pull favorite fair mass up before margin */
  favoriteShortenFactor: 1.12,
  /** Crush Over / Yes fair p before margin */
  sideHouseBias: 0.72,
  /** Almost ignore soft public provider books */
  providerBlendWeight: 0.12,
  /** Extra overround late in live matches */
  liveMarginBumpMax: 0.08,
  /** Live bump starts earlier (fraction of match) */
  liveBumpStartProgress: 0.30,
  /** Exclusive markets must clear this book mass or we suspend */
  minBookMassMw: 1.16,
  minBookMassTotals: 1.20,
  minBookMassProps: 1.16,
});

export function overroundForMarket(kind, margins = OSV4_MARGIN_CONFIG) {
  const cfg = { ...OSV4_MARGIN_CONFIG, ...(margins || {}) };
  switch (String(kind || '').toLowerCase()) {
    case 'totals':
    case 'spread':
    case 'total':
      return cfg.totalsOverround;
    case 'props':
    case 'btts':
    case 'prop':
    case 'dc':
      return cfg.propsOverround;
    case 'winner':
    case 'mw':
    case '1x2':
    case 'moneyline':
    default:
      return cfg.matchWinnerOverround;
  }
}

export function minBookMassForKind(kind, margins = OSV4_MARGIN_CONFIG) {
  const cfg = { ...OSV4_MARGIN_CONFIG, ...(margins || {}) };
  switch (String(kind || '').toLowerCase()) {
    case 'totals':
    case 'spread':
    case 'total':
      return cfg.minBookMassTotals;
    case 'props':
    case 'btts':
    case 'prop':
    case 'dc':
      return cfg.minBookMassProps;
    default:
      return cfg.minBookMassMw;
  }
}
