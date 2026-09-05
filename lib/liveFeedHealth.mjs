const LIVE_PROVIDER_KEYS = ['tencric', 'crex', 'cricbuzz', 'fancode', 'espn', 'flashscore', 'cricketguru', 'cricketliveline'];

/**
 * Typed feed failure when every real sports provider rejected.
 * SRL simulator matches are not a provider success.
 */
export function classifyLiveFeedHealth(sourceStatus = {}) {
  const allFailed = LIVE_PROVIDER_KEYS.every((key) => sourceStatus[key] === 'error');
  if (!allFailed) return null;
  return {
    code: 'ALL_PROVIDERS_FAILED',
    message: 'Live sports feeds are unavailable. Last known matches may still appear; prices can be delayed. Tap Retry.',
  };
}

export { LIVE_PROVIDER_KEYS };
