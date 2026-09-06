const LIVE_PROVIDER_KEYS = ['tencric', 'crex', 'cricbuzz', 'fancode', 'espn', 'flashscore', 'cricketguru', 'cricketliveline'];
/** Cricket-primary sources — empty success is not a healthy live book. */
const CRICKET_PRIMARY_KEYS = ['tencric', 'crex', 'cricbuzz'];

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
  return null;
}

export { LIVE_PROVIDER_KEYS, CRICKET_PRIMARY_KEYS };
