/**
 * OtherSportsEngineV4 — maximum house-first margin policy (v4.8).
 * Prefer suspending over printing a soft price. Target operator mark: 10.0.
 */

export const OSV4_ENGINE_VERSION = '4.8.7';

/**
 * Overround → book points = 100 × (1 + overround).
 * Live bump stacks on top.
 */
export const OSV4_MARGIN_CONFIG = Object.freeze({
  /** Match winner / 1X2 / moneyline → 122 pts base */
  matchWinnerOverround: 0.215,
  /** Totals & spreads → 126 pts base */
  totalsOverround: 0.255,
  /** BTTS / DC Yes-No → 122 pts base */
  propsOverround: 0.215,
  /** Extra overround piled onto Over after bias */
  overExtraOverround: 0.115,
  /** Hard longshot / underdog ceiling */
  maxSelectionOdds: 2.75,
  /** Soft totals Over ceiling — never sell juicy Overs */
  maxOverOdds: 1.25,
  /** Soft Yes / DC Yes ceiling */
  maxYesOdds: 1.62,
  /** Soft favorite ceiling (fair p ≥ 0.48) */
  maxFavoriteOdds: 1.40,
  minDecimalOdds: 1.01,
  /** Pull favorite fair mass up before margin */
  favoriteShortenFactor: 1.19,
  /** Crush Over / Yes fair p before margin */
  sideHouseBias: 0.65,
  /** Almost ignore soft public provider books */
  providerBlendWeight: 0.06,
  /** Extra overround late in live matches */
  liveMarginBumpMax: 0.115,
  /** Live bump starts earlier (fraction of match) */
  liveBumpStartProgress: 0.20,
  /** Exclusive markets must clear this book mass or we suspend */
  minBookMassMw: 1.195,
  minBookMassTotals: 1.235,
  minBookMassProps: 1.195,
  /** American football: tighter underdog / Over caps */
  afMaxSelectionOdds: 2.55,
  afMaxOverOdds: 1.20,
  afMaxFavoriteOdds: 1.38,
  afLiveMarginBumpMax: 0.125,
  /** Late lock thresholds (v4.8 core-only) */
  soccerLateLockMinute: 78,
  basketballLateLockMinute: 40,
  americanFootballLateLockMinute: 48,
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
    case 'winner':
    case 'mw':
    case '1x2':
    default:
      return cfg.minBookMassMw;
  }
}

/** Sport-scoped margin overrides for american football (v4.8). */
export function marginsForSport(sport, margins = OSV4_MARGIN_CONFIG) {
  const cfg = { ...OSV4_MARGIN_CONFIG, ...(margins || {}) };
  if (String(sport || '').toLowerCase() !== 'american-football') return cfg;
  return {
    ...cfg,
    maxSelectionOdds: cfg.afMaxSelectionOdds ?? 2.55,
    maxOverOdds: cfg.afMaxOverOdds ?? 1.20,
    maxFavoriteOdds: cfg.afMaxFavoriteOdds ?? 1.38,
    liveMarginBumpMax: cfg.afLiveMarginBumpMax ?? 0.125,
    matchWinnerOverround: Math.max(cfg.matchWinnerOverround, 0.225),
    totalsOverround: Math.max(cfg.totalsOverround, 0.265),
    providerBlendWeight: Math.max(cfg.providerBlendWeight, 0.16),
  };
}
