const LIVE_PROVIDER_KEYS = ['tencric', 'crex', 'cricbuzz', 'fancode', 'espn', 'flashscore', 'cricketguru', 'cricketliveline'];
/** Cricket-primary sources — empty success is not a healthy live book. */
const CRICKET_PRIMARY_KEYS = ['tencric', 'crex', 'cricbuzz'];
/** Other-sports score/odds sources used by OtherSportsEngineV5. */
const OTHER_SPORTS_PROVIDER_KEYS = ['espn', 'flashscore', 'fancode'];

/** Per-sport feed SLO targets (seconds freshness / min ok providers). */
export const FEED_SPORT_SLOS = Object.freeze({
  cricket: { maxStaleSec: 30, minOkProviders: 1, providers: CRICKET_PRIMARY_KEYS },
  soccer: { maxStaleSec: 60, minOkProviders: 1, providers: OTHER_SPORTS_PROVIDER_KEYS },
  basketball: { maxStaleSec: 60, minOkProviders: 1, providers: OTHER_SPORTS_PROVIDER_KEYS },
  tennis: { maxStaleSec: 60, minOkProviders: 1, providers: OTHER_SPORTS_PROVIDER_KEYS },
});

/**
 * Typed feed failure when every real sports provider rejected.
 * SRL simulator matches are not a provider success.
 *
 * @param {Record<string, string>} sourceStatus  ok | error | empty
 */
export function classifyLiveFeedHealth(sourceStatus = {}) {
  const allFailed = LIVE_PROVIDER_KEYS.every((key) => sourceStatus[key] === 'error');
  if (allFailed) {
    return {
      code: 'ALL_PROVIDERS_FAILED',
      message: 'Live sports feeds are unavailable. Last known matches may still appear; prices can be delayed. Tap Retry.',
    };
  }

  const cricketBroken = CRICKET_PRIMARY_KEYS.every((key) => {
    const s = sourceStatus[key];
    return s === 'error' || s === 'empty';
  });
  if (cricketBroken) {
    return {
      code: 'CRICKET_PRIMARIES_DEGRADED',
      message: 'Primary cricket feeds are empty or down. Live cricket odds may be delayed.',
    };
  }

  const otherBroken = OTHER_SPORTS_PROVIDER_KEYS.every((key) => {
    const s = sourceStatus[key];
    return s === 'error' || s === 'empty' || s == null;
  });
  if (otherBroken) {
    return {
      code: 'OTHER_SPORTS_FEEDS_DEGRADED',
      message: 'Other-sports feed sources are empty or down. Soccer/basketball/tennis books may use live-score models only.',
    };
  }
  return null;
}

/**
 * Evaluate per-sport SLO from provider status map.
 * @returns {{ sport: string, ok: boolean, okProviders: number, slo: object }[]}
 */
export function evaluateFeedSportSlos(sourceStatus = {}) {
  return Object.entries(FEED_SPORT_SLOS).map(([sport, slo]) => {
    const okProviders = (slo.providers || []).filter((k) => sourceStatus[k] === 'ok').length;
    return {
      sport,
      ok: okProviders >= (slo.minOkProviders || 1),
      okProviders,
      slo,
    };
  });
}

export { LIVE_PROVIDER_KEYS, CRICKET_PRIMARY_KEYS, OTHER_SPORTS_PROVIDER_KEYS };
